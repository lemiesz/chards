/**
 * Browser smoke test: drives a real Chrome through Home -> Deal -> Board -> a
 * legal move, capturing screenshots at two phone sizes. Run against `npm run dev`:
 *
 *   node scripts/smoke.mjs [outputDir] [baseUrl]
 *
 * Exits non-zero on any console error, page error, or failed expectation.
 */
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

const OUT = process.argv[2] ?? './screenshots'
const BASE = process.argv[3] ?? 'http://localhost:5173/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const problems = []
const notes = []

function check(label, ok) {
  notes.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) problems.push(label)
}

await mkdir(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})

const page = await browser.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))

// iPhone-ish portrait, the primary target.
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle0' })

// --- Home ---------------------------------------------------------------
await page.waitForSelector('button')
check(
  'home shows New game',
  await page.$$eval('button', (bs) =>
    bs.some((b) => /new game/i.test(b.textContent ?? '')),
  ),
)
await page.screenshot({ path: `${OUT}/01-home.png` })

// --- Rules screen -------------------------------------------------------
await page.$$eval('button', (bs) => {
  bs.find((b) => /rules/i.test(b.textContent ?? ''))?.click()
})
await new Promise((r) => setTimeout(r, 250))
check(
  'rules screen mentions the king is an ordinary piece',
  /ordinary piece|no check/i.test(
    await page.evaluate(() => document.body.innerText),
  ),
)
await page.screenshot({ path: `${OUT}/02-rules.png`, fullPage: true })
await page.$$eval('button', (bs) => {
  bs.find((b) => /back|close/i.test(b.textContent ?? ''))?.click()
})
await new Promise((r) => setTimeout(r, 250))

// --- Deal reveal --------------------------------------------------------
await page.$$eval('button', (bs) => {
  bs.find((b) => /new game/i.test(b.textContent ?? ''))?.click()
})
await new Promise((r) => setTimeout(r, 300))
const dealText = await page.evaluate(() => document.body.innerText)
check('deal reveal names a first seat', /goes first/i.test(dealText))
await page.screenshot({ path: `${OUT}/03-deal.png`, fullPage: true })

await page.$$eval('button', (bs) => {
  bs.find((b) => /start|play|begin/i.test(b.textContent ?? ''))?.click()
})
await page.waitForSelector('[data-square]')

// --- Board --------------------------------------------------------------
const squareCount = await page.$$eval('[data-square]', (n) => n.length)
check('board renders 64 squares', squareCount === 64)

const pieceCount = await page.$$eval(
  '[data-square]',
  (nodes) =>
    nodes.filter((n) => !/empty/i.test(n.getAttribute('aria-label') ?? ''))
      .length,
)
check('board renders 24 pieces', pieceCount === 24)

const corners = await page.$$eval('[data-square]', (nodes) =>
  ['0,0', '0,7', '7,0', '7,7'].every((k) =>
    /empty/i.test(
      nodes
        .find((n) => n.getAttribute('data-square') === k)
        ?.getAttribute('aria-label') ?? '',
    ),
  ),
)
check('four corners start empty', corners)

const noHScroll = await page.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth,
)
check('no horizontal page scroll at 390px', noHScroll)

await page.screenshot({ path: `${OUT}/04-board.png` })

// --- Make a move --------------------------------------------------------
const turnSeat = await page.evaluate(() => {
  const text = document.body.innerText
  const m = text.match(/(South|West|North|East) to move/i)
  return m ? m[1] : null
})
check('turn banner names a seat', turnSeat !== null)

// Click each of that seat's pieces until one has legal targets.
const selected = await page.evaluate(async (seat) => {
  const squares = [...document.querySelectorAll('[data-square]')]
  const own = squares.filter((s) =>
    (s.getAttribute('aria-label') ?? '').includes(seat),
  )
  for (const sq of own) {
    sq.click()
    await new Promise((r) => setTimeout(r, 30))
    const targets = document.querySelectorAll(
      '[data-state="target"], [data-state="capture-target"]',
    )
    if (targets.length > 0) {
      return {
        from: sq.getAttribute('data-square'),
        label: sq.getAttribute('aria-label'),
        targets: [...targets].map((t) => t.getAttribute('data-square')),
      }
    }
  }
  return null
}, turnSeat)
check('selecting a piece highlights legal targets', selected !== null)
await page.screenshot({ path: `${OUT}/05-selected.png` })

if (selected) {
  const target = selected.targets[0]
  await page.evaluate((t) => {
    document.querySelector(`[data-square="${t}"]`)?.click()
  }, target)
  await new Promise((r) => setTimeout(r, 300))

  const moved = await page.evaluate(
    ({ from, t, seat }) => {
      const label = (k) =>
        document
          .querySelector(`[data-square="${k}"]`)
          ?.getAttribute('aria-label') ?? ''
      return {
        fromEmpty: /empty/i.test(label(from)),
        toOccupied: label(t).includes(seat),
        banner: document.body.innerText.match(
          /(South|West|North|East) to move/i,
        )?.[1],
      }
    },
    { from: selected.from, t: target, seat: turnSeat },
  )
  check('origin square is empty after the move', moved.fromEmpty)
  check('destination square holds the moved piece', moved.toOccupied)
  check(
    'turn passed to another seat',
    moved.banner && moved.banner !== turnSeat,
  )
  await page.screenshot({ path: `${OUT}/06-after-move.png` })
}

// --- Opponent piece is not selectable -----------------------------------
const opponentIgnored = await page.evaluate(
  (seat) => {
    const squares = [...document.querySelectorAll('[data-square]')]
    const other = squares.find((s) => {
      const l = s.getAttribute('aria-label') ?? ''
      return !/empty/i.test(l) && !l.includes(seat)
    })
    if (!other) return true
    other.click()
    return document.querySelectorAll('[data-state="selected"]').length === 0
  },
  await page.evaluate(
    () =>
      document.body.innerText.match(/(South|West|North|East) to move/i)?.[1] ??
      '',
  ),
)
check('opponent pieces cannot be selected', opponentIgnored)

// --- Smallest supported viewport ---------------------------------------
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2 })
await new Promise((r) => setTimeout(r, 300))
const fitsSmall = await page.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth,
)
check('no horizontal scroll at 320x568', fitsSmall)
const boardVisible = await page.evaluate(() => {
  const cell = document.querySelector('[data-square="0,0"]')
  const last = document.querySelector('[data-square="7,7"]')
  if (!cell || !last) return false
  const a = cell.getBoundingClientRect()
  const b = last.getBoundingClientRect()
  return a.width >= 30 && b.bottom > 0 && a.top >= 0
})
check('board fits and squares stay >=30px at 320px', boardVisible)
await page.screenshot({ path: `${OUT}/07-320px.png` })

// --- Landscape ----------------------------------------------------------
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 })
await new Promise((r) => setTimeout(r, 300))
const landscapeOk = await page.evaluate(() => {
  const board = document
    .querySelector('[data-square="0,0"]')
    ?.closest('[class*="board"]')
  if (!board) return false
  const r = board.getBoundingClientRect()
  return r.bottom <= window.innerHeight + 2 && r.right <= window.innerWidth + 2
})
check('board fits on screen in landscape', landscapeOk)
await page.screenshot({ path: `${OUT}/08-landscape.png` })

await browser.close()

console.log(notes.join('\n'))
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAll browser checks passed.')
