/**
 * Browser check for the computer opponents:
 *   1. default setup (you = South, three CPUs) — the CPUs move on their own and
 *      the board is locked while one is thinking
 *   2. all four seats set to CPU — the game plays itself to a winner with zero
 *      clicks, which also exercises elimination resets end to end
 *
 *   node scripts/ai-smoke.mjs [outputDir] [baseUrl]
 */
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

const OUT = process.argv[2] ?? './screenshots'
const BASE = process.argv[3] ?? 'http://localhost:5173/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const problems = []
const notes = []
const check = (label, ok) => {
  notes.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) problems.push(label)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await mkdir(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console error: ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })

// --- Home seat setup ------------------------------------------------------
await page.waitForSelector('.seat-setup')
const defaults = await page.evaluate(() =>
  [...document.querySelectorAll('.seat-setup__row')].map((row) => ({
    seat: row.getAttribute('data-seat'),
    active: [...row.querySelectorAll('.seat-setup__choice')]
      .filter((b) => b.getAttribute('data-active') === 'true')
      .map((b) => b.textContent.trim()),
  })),
)
check(
  'home offers a player choice for all four seats',
  defaults.length === 4 &&
    defaults.every((d) => d.active.length === 1),
)
check(
  'default setup is South human, other three computer',
  defaults.find((d) => d.seat === 'S')?.active[0] === 'You' &&
    ['W', 'N', 'E'].every(
      (s) => defaults.find((d) => d.seat === s)?.active[0] === 'Normal',
    ),
)
await page.screenshot({ path: `${OUT}/20-home-setup.png`, fullPage: true })

// --- Game 1: one human, three CPUs ---------------------------------------
const start = async () => {
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => /new game/i.test(b.textContent))
      ?.click()
  })
  await sleep(250)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => /^start$/i.test(b.textContent.trim()))
      ?.click()
  })
  await page.waitForSelector('[data-square]')
}
await start()

const readTurn = () =>
  page.evaluate(
    () =>
      document.body.innerText.match(/(South|West|North|East) to move/i)?.[1] ??
      null,
  )

// Wait for a CPU seat to be on move and confirm the UI says so.
let sawThinking = false
let sawDisabled = false
for (let i = 0; i < 40 && !sawThinking; i++) {
  const state = await page.evaluate(() => ({
    thinking: document.querySelector('.ai-thinking')?.textContent?.trim() ?? '',
    disabled: [...document.querySelectorAll('[data-square]')].every(
      (b) => b.disabled,
    ),
    turn:
      document.body.innerText.match(/(South|West|North|East) to move/i)?.[1] ??
      null,
  }))
  if (state.thinking) {
    sawThinking = /West|North|East/.test(state.thinking)
    sawDisabled = state.disabled
    await page.screenshot({ path: `${OUT}/21-cpu-thinking.png` })
  }
  await sleep(100)
}
check('a computer seat announces that it is thinking', sawThinking)
check('board is locked while a computer seat is on move', sawDisabled)

// The CPUs should march the turn around to South without any input from us.
let reachedSouth = false
for (let i = 0; i < 120 && !reachedSouth; i++) {
  if ((await readTurn()) === 'South') reachedSouth = true
  else await sleep(100)
}
check('computer seats take their turns unprompted', reachedSouth)

// South is human: its pieces must still be selectable.
const humanCanMove = await page.evaluate(async () => {
  const own = [...document.querySelectorAll('[data-square]')].filter((s) =>
    (s.getAttribute('aria-label') ?? '').includes('South'),
  )
  for (const sq of own) {
    if (sq.disabled) return false
    sq.click()
    await new Promise((r) => setTimeout(r, 20))
    if (document.querySelector('[data-state="selected"]')) return true
  }
  return false
})
check('the human seat can still select its own pieces', humanCanMove)
await page.screenshot({ path: `${OUT}/22-human-turn.png` })

// --- Game 2: four CPUs, zero clicks --------------------------------------
await page.evaluate(() => localStorage.clear())
await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.waitForSelector('.seat-setup')
await page.evaluate(() => {
  for (const row of document.querySelectorAll('.seat-setup__row')) {
    const hardest = [...row.querySelectorAll('.seat-setup__choice')].find(
      (b) => b.textContent.trim() === 'Hard',
    )
    hardest?.click()
  }
})
const allCpu = await page.evaluate(() =>
  [...document.querySelectorAll('.seat-setup__row')].every((row) =>
    [...row.querySelectorAll('.seat-setup__choice')].some(
      (b) =>
        b.getAttribute('data-active') === 'true' &&
        b.textContent.trim() === 'Hard',
    ),
  ),
)
check('all four seats can be set to computer', allCpu)
await start()

let finished = false
let eliminationSeen = false
let lastPieces = 24
const deadline = Date.now() + 180000
while (!finished && Date.now() < deadline) {
  const snap = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      text,
      finished: /wins!|draw/i.test(text),
      banner: document.querySelector('.event-banner')?.textContent ?? '',
      pieces: [...document.querySelectorAll('[data-square]')].filter(
        (s) => !/empty/i.test(s.getAttribute('aria-label') ?? ''),
      ).length,
    }
  })
  if (/eliminated/i.test(snap.banner) && !eliminationSeen) {
    eliminationSeen = true
    await page.screenshot({ path: `${OUT}/23-cpu-elimination.png` })
  }
  if (snap.pieces > lastPieces) {
    problems.push(`piece count rose from ${lastPieces} to ${snap.pieces}`)
  }
  if (snap.pieces > 0) lastPieces = snap.pieces
  finished = snap.finished
  if (!finished) await sleep(250)
}
check('a four-computer game plays itself to a finish with no clicks', finished)
check('the self-playing game produced an elimination reset', eliminationSeen)
await page.screenshot({ path: `${OUT}/24-cpu-game-over.png` })

const finalText = await page.evaluate(() =>
  document.body.innerText.split('\n').slice(0, 3).join(' / '),
)
console.log(notes.join('\n'))
console.log(`\nfinal screen: ${finalText}`)

await browser.close()

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAll AI browser checks passed.')
