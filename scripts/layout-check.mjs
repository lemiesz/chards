/**
 * Measures how much the board moves on screen during play. A stable UI keeps
 * the board's top edge at exactly one position for the whole game; every extra
 * position is a visible jump as banners appear and disappear.
 *
 *   node scripts/layout-check.mjs [baseUrl] [seconds]
 *
 * Exits non-zero if the board shifts more than a hair (>2px).
 */
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:5173/'
const SECONDS = Number(process.argv[3] ?? 45)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TOLERANCE_PX = 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })

// All four seats to the computer so the game plays itself while we measure.
await page.waitForSelector('.seat-setup')
await page.evaluate(() => {
  for (const row of document.querySelectorAll('.seat-setup__row')) {
    ;[...row.querySelectorAll('.seat-setup__choice')]
      .find((b) => b.textContent.trim() === 'Normal')
      ?.click()
  }
  ;[...document.querySelectorAll('button')]
    .find((b) => /new game/i.test(b.textContent))
    ?.click()
})
await sleep(300)
await page.evaluate(() => {
  ;[...document.querySelectorAll('button')]
    .find((b) => /^start$/i.test(b.textContent.trim()))
    ?.click()
})
await page.waitForSelector('[data-square]')

const samples = []
const deadline = Date.now() + SECONDS * 1000
while (Date.now() < deadline) {
  const sample = await page.evaluate(() => {
    const cell = document.querySelector('[data-square="0,0"]')
    if (!cell) return null
    const rect = cell.getBoundingClientRect()
    return {
      top: Math.round(rect.top * 10) / 10,
      left: Math.round(rect.left * 10) / 10,
      size: Math.round(rect.width * 10) / 10,
      banner: Boolean(document.querySelector('.event-banner')),
      thinking: Boolean(document.querySelector('.ai-thinking')),
    }
  })
  if (sample) samples.push(sample)
  else break // game over screen
  await sleep(60)
}

await browser.close()

const tops = samples.map((s) => s.top)
const uniqueTops = [...new Set(tops)].sort((a, b) => a - b)
const spread = uniqueTops.length ? uniqueTops.at(-1) - uniqueTops[0] : 0

// Count how often the board actually moved between consecutive samples.
let jumps = 0
for (let i = 1; i < tops.length; i++) {
  if (Math.abs(tops[i] - tops[i - 1]) > TOLERANCE_PX) jumps++
}

console.log(`samples:            ${samples.length}`)
console.log(`distinct board tops: ${uniqueTops.join(', ')}`)
console.log(`vertical spread:     ${spread.toFixed(1)}px`)
console.log(`visible jumps:       ${jumps}`)
console.log(
  `banner seen: ${samples.some((s) => s.banner)}, thinking seen: ${samples.some((s) => s.thinking)}`,
)

if (spread > TOLERANCE_PX) {
  console.log(
    `\nFAIL: the board moved ${spread.toFixed(1)}px during play (${jumps} jumps).`,
  )
  process.exit(1)
}
console.log('\nPASS: the board stayed put for the whole game.')
