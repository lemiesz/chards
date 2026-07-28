/**
 * Plays a COMPLETE game of Chards through the real UI — every move is a DOM
 * click, exactly as four people passing a phone would do it. Verifies the
 * Definition of Done: a full game to a winner, including at least one
 * elimination board-reset, with no crashes and no rule errors.
 *
 *   node scripts/autoplay.mjs [outputDir] [baseUrl]
 */
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

const OUT = process.argv[2] ?? './screenshots'
const BASE = process.argv[3] ?? 'http://localhost:5173/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MAX_MOVES = 1500

await mkdir(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle0' })

const clickByText = async (re) =>
  page.evaluate((src) => {
    const rx = new RegExp(src, 'i')
    const b = [...document.querySelectorAll('button')].find((x) =>
      rx.test(x.textContent ?? ''),
    )
    if (b) b.click()
    return Boolean(b)
  }, re.source)

await clickByText(/new game/)
await new Promise((r) => setTimeout(r, 200))
await clickByText(/start|play|begin/)
await page.waitForSelector('[data-square]')

const snapshot = () =>
  page.evaluate(() => {
    const text = document.body.innerText
    const squares = [...document.querySelectorAll('[data-square]')].map(
      (s) => ({
        key: s.getAttribute('data-square'),
        label: s.getAttribute('aria-label') ?? '',
      }),
    )
    return {
      text,
      turn: text.match(/(South|West|North|East) to move/i)?.[1] ?? null,
      finished: /wins|draw/i.test(text) && !/to move/i.test(text),
      pieces: squares.filter((s) => !/empty/i.test(s.label)).length,
      counts: Object.fromEntries(
        ['South', 'West', 'North', 'East'].map((n) => [
          n,
          squares.filter((s) => s.label.includes(n)).length,
        ]),
      ),
      banner:
        document.querySelector('.event-banner')?.textContent?.trim() ?? '',
    }
  })

let moves = 0
let eliminations = 0
let resetShot = false
let prev = await snapshot()
const seenSeatsOut = new Set()

while (moves < MAX_MOVES) {
  const state = await snapshot()
  if (state.finished || !state.turn) break

  // Pick a move for the seat to move: try each of its pieces until one has
  // legal targets, preferring captures so the game actually terminates.
  // Each step is its own round-trip so React can flush between click and read.
  const own = await page.evaluate((seat) => {
    const keys = [...document.querySelectorAll('[data-square]')]
      .filter((s) => (s.getAttribute('aria-label') ?? '').includes(seat))
      .map((s) => s.getAttribute('data-square'))
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[keys[i], keys[j]] = [keys[j], keys[i]]
    }
    return keys
  }, state.turn)

  let played = false
  for (const key of own) {
    await page.evaluate((k) => {
      document.querySelector(`[data-square="${k}"]`)?.click()
    }, key)
    const pick = await page.evaluate(() => {
      const caps = [
        ...document.querySelectorAll('[data-state="capture-target"]'),
      ]
      const plain = [...document.querySelectorAll('[data-state="target"]')]
      const pool = caps.length > 0 ? caps : plain
      if (pool.length === 0) return null
      return pool[Math.floor(Math.random() * pool.length)].getAttribute(
        'data-square',
      )
    })
    if (pick) {
      await page.evaluate((k) => {
        document.querySelector(`[data-square="${k}"]`)?.click()
      }, pick)
      played = true
      break
    }
  }

  if (!played) {
    console.log(
      `No move found for ${state.turn} after ${moves} moves — stopping`,
    )
    break
  }

  moves++
  await new Promise((r) => setTimeout(r, 15))

  const now = await snapshot()

  // Invariant: total pieces on the board never increases.
  if (now.pieces > prev.pieces) {
    errors.push(
      `piece count rose from ${prev.pieces} to ${now.pieces} at move ${moves}`,
    )
  }

  // Detect an elimination (a seat's count hits zero) and capture the reset.
  for (const [seat, count] of Object.entries(now.counts)) {
    if (count === 0 && prev.counts[seat] > 0 && !seenSeatsOut.has(seat)) {
      seenSeatsOut.add(seat)
      eliminations++
      console.log(`move ${moves}: ${seat} eliminated — banner: "${now.banner}"`)
      if (!resetShot) {
        await page.screenshot({ path: `${OUT}/10-elimination-reset.png` })
        resetShot = true
        if (!/eliminated/i.test(now.banner)) {
          errors.push('elimination was not announced in the event banner')
        }
        // After a reset every surviving seat's pieces must sit on its own
        // back-row slots, ascending by card value.
        const layout = await page.evaluate(() => {
          const slots = {
            South: ['7,1', '7,2', '7,3', '7,4', '7,5', '7,6'],
            West: ['1,0', '2,0', '3,0', '4,0', '5,0', '6,0'],
            North: ['0,6', '0,5', '0,4', '0,3', '0,2', '0,1'],
            East: ['6,7', '5,7', '4,7', '3,7', '2,7', '1,7'],
          }
          const label = (k) =>
            document
              .querySelector(`[data-square="${k}"]`)
              ?.getAttribute('aria-label') ?? ''
          const offSlot = []
          const order = {}
          for (const [seat, keys] of Object.entries(slots)) {
            const onSlots = keys
              .map((k) => label(k))
              .filter((l) => l.includes(seat))
            const total = [
              ...document.querySelectorAll('[data-square]'),
            ].filter((s) => (s.getAttribute('aria-label') ?? '').includes(seat))
            if (total.length !== onSlots.length) offSlot.push(seat)
            order[seat] = keys.map((k) => label(k))
          }
          return { offSlot, order }
        })
        if (layout.offSlot.length > 0) {
          errors.push(
            `after reset these seats had pieces off their back row: ${layout.offSlot.join(', ')}`,
          )
        }
        console.log('post-reset back rows:')
        for (const [seat, labels] of Object.entries(layout.order)) {
          const occupied = labels.filter((l) => l.includes(seat))
          if (occupied.length) console.log(`  ${seat}: ${occupied.join(' | ')}`)
        }
      }
    }
  }

  prev = now
}

const final = await snapshot()
await page.screenshot({ path: `${OUT}/11-final.png` })

console.log(`\nmoves played: ${moves}`)
console.log(`eliminations seen: ${eliminations}`)
console.log(
  `final screen text: ${final.text.split('\n').slice(0, 4).join(' / ')}`,
)

if (!final.finished) errors.push('game did not reach a finished state')
if (eliminations < 1) errors.push('no elimination/reset occurred in this game')

await browser.close()

if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`)
  for (const e of errors) console.log(` - ${e}`)
  process.exit(1)
}
console.log('\nFull game completed through the UI with no errors.')
