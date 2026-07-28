# Chards

A four-player chess variant played with a standard 52-card deck, as a
mobile-friendly web app. Local pass-and-play on one shared device.

The rules are specified in [PLAN.md](./PLAN.md) §1 — that document is the source
of truth. If the code and the spec ever disagree, the spec wins.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | oxlint |
| `npm run format` | Prettier |
| `npm run verify:browser` | Real-Chrome smoke test of the UI (needs a dev/preview server running) |
| `npm run verify:game` | Plays a **complete game** through the UI in real Chrome |
| `npm run verify:ai` | Checks the computer opponents in real Chrome, including a four-CPU game that plays itself |

The two `verify:*` scripts drive a real Chrome via `puppeteer-core` against
`http://localhost:5173` and write screenshots to `./screenshots`. Start
`npm run dev` first. `verify:game` clicks out an entire game — every move is a
DOM click — and asserts the board never gains pieces, that eliminations announce
a board reset, that survivors' pieces land back on their own back row in
ascending card order, and that the game reaches a winner.

## Sharing it over a Cloudflare tunnel

The app is fully static and talks to no server, so a tunnel just needs to point
at a local static server. In two terminals:

```bash
npm run build && npm run preview   # serves dist/ on :4173
npm run tunnel                     # cloudflared tunnel --url http://localhost:4173
```

`cloudflared` prints a public `https://<random>.trycloudflare.com` URL. Anyone
can open it on their phone; the URL lasts until you stop the tunnel.

Vite refuses requests whose `Host` header it does not recognise, which is why
`vite.config.ts` allows `.trycloudflare.com` and `.cfargotunnel.com` — without
that you get "Blocked request. This host is not allowed" instead of the game.
That setting affects only the local dev/preview servers.

For a stable URL on your own domain, use a named tunnel instead
(`cloudflared tunnel login`, `cloudflared tunnel create chards`, route DNS to
it, then `cloudflared tunnel run`). Note that either way your machine is the
server — if it sleeps, the site goes down. For an always-on link, deploying
`dist/` to Cloudflare Pages is the better fit.

## Computer opponents

On the Home screen each of the four seats is set to **You** or to a computer at
**Easy / Normal / Hard**. The default is you at South against three Normal
opponents; set all four to a level and the game plays itself.

The AI lives in `src/engine/ai.ts` and is pure like the rest of the engine —
`chooseMove(state, seat, { level, rng })` with an injectable RNG, so its
decisions are reproducible in tests.

- **Easy** — a uniformly random legal move.
- **Normal** — greedy one-ply: takes the most valuable capture, prefers
  promotions and eliminating a rival, with small nudges toward advancing pawns
  and the centre.
- **Hard** — the same evaluation, then simulates the move and subtracts the
  best reply available to the opponents, so it declines poisoned captures.

Because the king is an ordinary piece here, it is valued for its mobility (3.5)
rather than being priceless, and eliminating a player is worth a bonus since it
removes a rival and triggers a board reset.

## Architecture

```
src/
  engine/     pure TypeScript rules — no React, no DOM
    types.ts      cards, pieces, board geometry, GameState, helpers
    deck.ts       52-card deck, seedable Fisher-Yates shuffle, deal
    setup.ts      back-row placement, first-player calc, newGame, nextSeat
    moves.ts      legal move generation per piece and per seat orientation
    apply.ts      applyMove: capture, promotion, elimination, board reset, win
    serialize.ts  versioned JSON save format
    index.ts      public API surface
  state/      gameReducer (UI selection over engine state), persistence
  ui/         Board + squares + pieces, turn banner, player panel, screens
```

**The engine is deliberately pure.** It imports nothing from React or the DOM,
takes immutable state, and returns new state (`applyMove(state, move) → state`).
That is what makes every rule unit-testable without a browser, and what would
let the same rules run on a server if online multiplayer is ever added.

## Rule decisions worth knowing

These were open questions in the original description and are settled in
PLAN.md §1 — change the spec first if you want them different:

- The king is an ordinary piece: no check, no checkmate, no castling.
- Pawns move away from their own edge; no two-square first move, no en passant;
  they promote to Queen on the far edge, and promotion survives board resets.
- On a board reset, survivors re-place pieces ascending by card value, ties
  broken by suit ♣ < ♦ < ♥ < ♠.
- A seat with no legal move is skipped; a full round of skips is a draw.
- After a reset, play continues clockwise from the seat that made the
  eliminating capture.

## Not built yet (deliberately)

Online multiplayer, AI opponents, 2–3 player variants, replays, PWA offline
install, move animations, and undo — see PLAN.md §3 Phase 3 and §4.
