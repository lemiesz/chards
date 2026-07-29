# Chards — Implementation Plan

A four-player chess variant played with a standard 52-card deck on an 8×8 board, built as a **mobile-friendly web app** (local pass-and-play on one device to start; architecture must keep the door open for online multiplayer later).

---

## 1. Game Rules Specification

This section is the source of truth. If code and this spec disagree, the spec wins.

### 1.1 Board & Seating

- Standard 8×8 grid. Coordinates are `(row, col)`, `row 0` = North edge, `col 0` = West edge.
- Four players, one per edge: **South, West, North, East**.
- Each player's **back row** is the 8 squares along their edge. Only the **6 center squares** are used for setup; the 4 board corners `(0,0) (0,7) (7,0) (7,7)` are always empty at setup (they are shared ends of two back rows).

| Player | Back-row squares (setup slots) | Slot order 1→6 ("left to right" from that player's seat) |
|---|---|---|
| South | row 7, cols 1–6 | col 1 → col 6 |
| West  | col 0, rows 1–6 | row 1 → row 6 |
| North | row 0, cols 1–6 | col 6 → col 1 |
| East  | col 7, rows 1–6 | row 6 → row 1 |

(The exact left/right convention matters less than being consistent; use the table above.)

### 1.2 Setup

**Each player is a suit, and deals from their own deck.** Players do not share one
shuffled deck.

| Player | Suit |
|---|---|
| South | ♠ Spades |
| West | ♥ Hearts |
| North | ♣ Clubs |
| East | ♦ Diamonds |

1. Before dealing, players choose **how many standard 52-card decks** the game
   uses (1 or 2).
2. Each player's personal deck is every card of their suit across those decks:
   **13 cards with one deck, 26 with two** (two copies of each rank).
3. Each player shuffles their own deck and draws 6 cards from it.
4. Cards are placed **in the order drawn** into slots 1→6 of the player's back row.
5. Consequences worth knowing:
   - Every player can hold the same rank — all four may have a King.
   - With **one** deck a player's six cards are six *different* ranks.
   - With **two** decks a player may draw the same card twice (e.g. two 5♠).

### 1.3 Card → Piece mapping

| Card | Piece | Point value (for first-player calc and reset ordering) |
|---|---|---|
| Ace | Bishop | 1 |
| 2–9 | Pawn | face value |
| 10 | Rook | 10 |
| Jack | Knight | 11 |
| Queen | Queen | 12 |
| King | King | 13 |

### 1.4 First player & turn order

- Each player sums their 6 card values (table above). **Lowest total goes first.**
- Tiebreak: compare the tied players' lowest card; if equal, next lowest, and so on. If value multisets are identical, choose randomly among the tied players.
- Play proceeds **clockwise** (viewed from above): South → West → North → East → South…
- Eliminated players are skipped.

### 1.5 Movement

Standard chess movement rules, with these clarifications:

- **King is an ordinary piece.** There is no check, checkmate, or castling. Kings can be captured like any piece, and you may freely move your king onto attacked squares.
- **Bishop / Rook / Queen / Knight**: exactly as in chess (sliders blocked by any piece; knight jumps).
- **Pawns** move directly *away from their owner's home edge* (South's pawns move north, West's pawns move east, etc.). One square forward if empty; capture one square diagonally forward. Because pawns start on the back row (not a second rank), there is **no two-square first move** and **no en passant**.
- **Pawn promotion**: a pawn that reaches the edge opposite its home edge promotes automatically to a **Queen**. Promotion persists through board resets; the piece's card (and its point value) stays the same for reset-ordering purposes.
- You may capture any **opponent's** piece (all three other players are opponents equally); you may never capture or move through your own pieces.
- **No legal moves** on your turn → your turn is skipped. If all surviving players are skipped consecutively (a full round with no move possible), the game is a draw. (Vanishingly rare; just don't crash.)

### 1.6 Elimination & board reset

- A player who loses their last piece is **eliminated immediately**.
- The eliminating move completes, then **the board resets**:
  - Every surviving player collects their still-alive pieces and re-places them on their own back-row slots, **slot 1 → slot 6, in ascending point value** (A=1 … K=13). Ties in value are broken by the order the cards were originally drawn, which is deterministic. (Since every one of a player's cards is their own suit, a tie is only possible in a two-deck game, where a player can hold the same card twice.)
  - A player with fewer than 6 pieces fills slots starting at slot 1; remaining slots stay empty.
  - Eliminated players' edges stay empty.
- After a reset, play continues **clockwise from the player who made the eliminating capture** (i.e., next surviving player after them). It is not possible to eliminate two players with one move.

### 1.7 Winning

The game ends when only one player has pieces remaining. That player wins.

### ⚠️ House-rule decisions made in this spec (confirm with the game's author)

1. No pawn double-move / en passant (pawns start on back row).
2. Pawn promotes to Queen automatically at the far edge; promotion survives resets.
3. Reset tie-break by original draw order (suit cannot break a tie — a player's cards are all one suit); first-player tie-break by lowest-card comparison then random.
4. No-legal-move = skip turn; full skipped round = draw.
5. Turn after a reset passes clockwise from the eliminator.

---

## 2. Technical Approach

### Stack

- **Vite + React 18 + TypeScript** (strict mode).
- **Vitest** for unit tests.
- **Zero backend.** All state in memory + `localStorage` for resume. No accounts, no network.
- State management: `useReducer` over the engine's pure `GameState` (no Redux/Zustand needed at this size).
- Plain CSS (or CSS modules) — no UI framework. The board is the whole UI; a framework adds weight without helping.

### Architecture rule (non-negotiable)

`src/engine/` is a **pure TypeScript module with no React or DOM imports**. It exposes immutable state + pure functions (`applyMove(state, move) → state`). This is what makes the future online-multiplayer port cheap (engine runs identically on a server) and makes the rules unit-testable without a browser.

```
src/
  engine/
    types.ts        # Card, Suit, Rank, PieceType, Player, Square, Move, GameState, GamePhase
    deck.ts         # buildDeck, shuffle (injectable RNG), deal
    setup.ts        # initial placement, first-player determination
    moves.ts        # legal move generation per piece, per seat orientation
    apply.ts        # applyMove: capture, promotion, elimination, reset, turn advance, win/draw
    index.ts        # public API surface
  ui/
    App.tsx
    Board.tsx, SquareCell.tsx, PieceView.tsx
    PlayerPanel.tsx, TurnBanner.tsx
    screens/ (Home, Game, GameOver)
  state/
    gameReducer.ts  # thin wrapper around engine + UI-only state (selection, highlights)
    persistence.ts  # localStorage save/load
```

### Mobile-friendliness requirements

- Board rendered as a square scaled to `min(100vw, 100dvh − chrome)`; CSS `aspect-ratio: 1`; works portrait and landscape from 320px width up.
- Interaction is **tap piece → highlighted legal squares → tap destination** (no drag-and-drop in v1; drag is a stretch goal).
- Touch targets: each square ≥ 40×40 px on a 375px-wide phone (8 squares ≈ 46px each — fine).
- Since all four players share one device, the board never rotates; instead each player's pieces are color-coded and the UI clearly banners whose turn it is. Piece rendering must be readable from all four sides (card rank + suit + piece glyph, orientation-neutral).
- `viewport-fit=cover`, no 300ms tap delay, disable double-tap zoom on the board, `touch-action: manipulation`.

### Piece rendering

Each piece shows: **piece glyph** (♗♔♕♘♖ + pawn) dominant, with the **card rank+suit** small beneath/beside it (e.g., ♘ with `J♠`), on a background of the owner's color. Red/black suit color kept on the card label only, so it never fights the four player colors. Player colors must be distinguishable with color-blindness (e.g., blue/orange/green/purple + distinct border shapes if needed).

---

## 3. Task List (hand to implementing agent)

Tasks are ordered; each lists acceptance criteria (AC). Complete phases in order — Phase 1 is fully unit-tested before any UI work.

### Phase 0 — Scaffold

**T0.1 — Project setup**
Create Vite + React + TypeScript app in repo root. Add Vitest, ESLint + Prettier, strict tsconfig. Add mobile viewport meta (`width=device-width, initial-scale=1, viewport-fit=cover`). Add npm scripts: `dev`, `build`, `test`, `lint`.
*AC: `npm run dev` serves a blank app; `npm test` runs a trivial passing test; `npm run build` succeeds.*

### Phase 1 — Game engine (pure TS, no DOM)

**T1.1 — Core types** (`engine/types.ts`)
Define `Suit`, `Rank`, `Card`, `PieceType`, `Seat` (`'S'|'W'|'N'|'E'`), `Piece` (card + owner + pieceType + unique id + promoted flag), `Square`, `Board` (8×8 of `Piece | null`), `Move` (`{from, to}`), `GamePhase` (`'playing' | 'finished' | 'draw'`), `GameState` (board, turn seat, alive seats, capture history, phase, winner, rng seed if used).
*AC: types compile under strict mode; `pointValue(card)` and `pieceTypeFor(rank)` helpers implemented per §1.3 with unit tests.*

**T1.2 — Deck, deal, and setup placement** (`engine/deck.ts`, `engine/setup.ts`)
Build 52-card deck; Fisher–Yates shuffle with an **injectable RNG** (seedable for tests). Deal 6 cards per seat; place into back-row slots per the §1.1 slot table, in draw order.
*AC: tests verify 24 distinct cards placed, corners empty, slot coordinates for all four seats match the table exactly, same seed → same layout.*

**T1.3 — First player & turn order** (`engine/setup.ts`)
Implement hand-sum, lowest-goes-first, tie-break per §1.4. Implement `nextSeat(state)` returning the next *alive* seat clockwise (S→W→N→E).
*AC: tests cover a clear winner, a sum tie broken by lowest card, an identical-multiset tie (assert it picks one of the tied seats), and clockwise skipping of eliminated seats.*

**T1.4 — Move generation** (`engine/moves.ts`)
`legalMoves(state, square) → Square[]` and `allLegalMoves(state, seat)`. Standard chess movement; pawn forward direction derived from owner's seat; pawn diagonal capture; sliders blocked correctly; no self-capture; no check logic of any kind.
*AC: table-driven tests per piece type; pawn direction tested for **all four seats**; pawn on far edge has no forward moves pre-promotion edge case handled (promotion happens on arrival, see T1.5); blocked-slider and knight-jump cases covered.*

**T1.5 — Apply move: capture, promotion, elimination, reset, win** (`engine/apply.ts`)
`applyMove(state, move) → GameState` (pure — returns new state):
1. Validate move is legal for the current turn's seat; else throw/return error result.
2. Move piece, remove captured piece.
3. Pawn reaching opposite edge → becomes Queen (`promoted: true`, card unchanged).
4. If the captured piece was its owner's last → mark seat eliminated → **reset board** per §1.6 (ascending point value, suit tie-break ♣♦♥♠, slots from slot 1, promoted pieces keep Queen movement but sort by card value).
5. Advance turn to next alive seat; auto-skip seats with no legal moves (record skips; full skipped round → `phase: 'draw'`).
6. One seat left alive → `phase: 'finished'`, set winner.
*AC: unit tests for each numbered behavior, including: capture that eliminates → board snapshot matches expected reset layout for a 6-piece and a 3-piece survivor; turn lands on correct seat after reset; win detection; skip-turn; draw round. A scripted full-game test (fixed seed, fixed move list) runs start → winner without error.*

**T1.6 — Serialization** (`engine/index.ts`, `state/persistence.ts` engine half)
`serialize(state) → string` / `deserialize(string) → GameState` (JSON, versioned with a schema number).
*AC: round-trip test: serialize → deserialize → deep-equal; version field present.*

### Phase 2 — UI

**T2.1 — Board rendering**
Responsive square board; alternating square shading; seat color-coding on the four back-row edges; pieces rendered per §2 "Piece rendering". Static render from any `GameState`.
*AC: renders correctly at 320px and 428px widths and in landscape; all 24 starting pieces visible and legible; no horizontal page scroll.*

**T2.2 — Interaction: select & move**
Tap own piece → highlight it + its legal squares (from engine). Tap highlighted square → dispatch move. Tap elsewhere → deselect. Only the current seat's pieces are selectable. Illegal taps do nothing (no error modals).
*AC: full move flow works on touch and mouse; can't select opponents' pieces or move out of turn; highlights always match `legalMoves` output.*

**T2.3 — Game chrome**
Turn banner (seat color + "South to move"); per-player panel showing pieces remaining and captured cards; eliminated players greyed out; brief toast/banner on elimination ("West eliminated — board resets") and on skip ("North has no moves — skipped").
*AC: all states reachable in play are reflected; elimination reset is visually announced, not silent.*

**T2.4 — Screens & flow**
Home screen (New game, Resume if save exists, Rules); deal animation or simple reveal into starting position with each hand's sum shown and first player announced; Game Over screen (winner, rematch, home). Rules screen rendering §1 in condensed form.
*AC: Home → Game → Game Over → rematch loop works; first-player announcement matches engine calc.*

**T2.5 — Persistence**
Autosave `GameState` to `localStorage` after every move; Resume restores mid-game including selection-free UI state; finished games clear the save.
*AC: reload mid-game and resume exactly; corrupted/old-version saves are discarded gracefully (fresh Home, no crash).*

### Phase 3 — Polish (do after Phase 2 is playable end-to-end)

**T3.1 — Move animation & last-move indicator** — animate piece slide (~150ms), highlight last move's from/to squares. *AC: animations don't block rapid play; reduced-motion respected.*
**T3.2 — Elimination/reset transition** — short sequence showing pieces flying to reset positions so the reset is comprehensible. *AC: after the animation, board matches engine state.*
**T3.3 — PWA** — manifest + service worker (offline, installable), app icon. *AC: Lighthouse installable; works airplane-mode after first load.*
**T3.4 — Undo (pass-and-play convenience)** — single-step undo with confirmation from all… keep simple: undo only your own move before the next player moves. *AC: undo restores exact prior state incl. eliminations/resets.*

### Phase 4 — Explicitly out of scope for v1 (do not build yet)

- Online multiplayer (engine purity in Phase 1 is the prep for this).
- AI opponents / bot seats.
- 2–3 player variants, spectator mode, game history/replays.

---

## 4. Definition of Done (v1)

- Four people can pass one phone around and play a complete game of Chards to a winner, including at least one elimination-reset, with no rule errors and no crashes.
- `npm test` passes with the engine at high coverage (every rule in §1 has at least one test).
- Playable and legible on an iPhone SE-sized viewport (320×568) and up.
