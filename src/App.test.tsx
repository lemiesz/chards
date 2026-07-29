import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { newGame } from './engine/setup'
import { applyMove } from './engine/apply'
import { allLegalMoves } from './engine/moves'
import { findSeatPieces } from './engine/apply'
import { SEAT_NAMES, SEAT_ORDER } from './engine/types'
import type { GameState, Seat } from './engine/types'
import { loadGame, saveGame } from './state/persistence'

type UserEvent = ReturnType<typeof userEvent.setup>

/**
 * Clicks "You" in every seat row on the Home seat-setup UI, so a test that
 * exercises human play controls every seat regardless of who the (random,
 * unseeded) deal would otherwise hand to the computer.
 */
async function setAllSeatsHuman(user: UserEvent) {
  for (const seat of SEAT_ORDER) {
    await setSeatChoice(user, seat, 'You')
  }
}

/** Clicks a single seat's choice button ("You" | "Easy" | "Normal" | "Hard") on Home. */
async function setSeatChoice(
  user: UserEvent,
  seat: Seat,
  label: 'You' | 'Easy' | 'Normal' | 'Hard',
) {
  const row = document.querySelector(`[data-seat="${seat}"]`) as HTMLElement
  await user.click(within(row).getByRole('button', { name: label }))
}

beforeEach(() => {
  window.localStorage.clear()
})

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

describe('App: home screen', () => {
  it('renders Home with no Resume when there is no save', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /chards/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /resume/i }),
    ).not.toBeInTheDocument()
  })

  it('shows Resume when a valid save exists', () => {
    saveGame(newGame({ seed: 1 }))
    render(<App />)
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// New game -> deal -> board
// ---------------------------------------------------------------------------

describe('App: new game flow', () => {
  it('New Game shows the deal reveal with four hand totals, then the board on Start', async () => {
    const user = userEvent.setup()
    const seed = 42
    const expectedGame = newGame({ seed })

    render(<App seed={seed} />)
    await setAllSeatsHuman(user)
    await user.click(screen.getByRole('button', { name: /new game/i }))

    for (const seat of SEAT_ORDER) {
      const handEl = document.querySelector(`[data-seat="${seat}"]`)
      expect(handEl).not.toBeNull()
    }
    expect(
      screen.getByText(
        new RegExp(
          `${SEAT_NAMES[expectedGame.turn]} has the lowest total`,
          'i',
        ),
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start/i }))

    expect(document.querySelectorAll('[data-square]')).toHaveLength(64)
    expect(document.querySelectorAll('.piece')).toHaveLength(24)
  })
})

// ---------------------------------------------------------------------------
// Full move flow
// ---------------------------------------------------------------------------

describe('App: move flow', () => {
  it('selects a piece, highlights its legal targets, and applies the move on tap', async () => {
    const user = userEvent.setup()
    const seed = 7
    const game = newGame({ seed })
    const move = allLegalMoves(game, game.turn)[0]
    expect(move).toBeDefined()
    const expectedNext = applyMove(game, move)

    render(<App seed={seed} />)
    await setAllSeatsHuman(user)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const fromBtn = document.querySelector(
      `[data-square="${move.from.row},${move.from.col}"]`,
    ) as HTMLElement
    const toBtn = document.querySelector(
      `[data-square="${move.to.row},${move.to.col}"]`,
    ) as HTMLElement
    expect(fromBtn).not.toBeNull()
    expect(toBtn).not.toBeNull()

    await user.click(fromBtn)
    expect(fromBtn.getAttribute('data-state')).toBe('selected')

    const targets = document.querySelectorAll(
      '[data-state="target"], [data-state="capture-target"]',
    )
    expect(targets.length).toBeGreaterThan(0)
    expect(
      toBtn.matches('[data-state="target"], [data-state="capture-target"]'),
    ).toBe(true)

    await user.click(toBtn)

    const movedPiece = expectedNext.board[move.to.row][move.to.col]!
    expect(toBtn.getAttribute('aria-label')).toContain(
      `${SEAT_NAMES[movedPiece.owner]} ${movedPiece.pieceType}`,
    )
    expect(
      screen.getByText(`${SEAT_NAMES[expectedNext.turn]} to move`),
    ).toBeInTheDocument()
  })

  it('tapping an opponent piece produces no selection and no error', async () => {
    const user = userEvent.setup()
    const seed = 13
    const game = newGame({ seed })
    const opponentSeat = SEAT_ORDER.find((s) => s !== game.turn)!
    const [opponentSquare] = findSeatPieces(game.board, opponentSeat).map(
      (p) => p.square,
    )

    render(<App seed={seed} />)
    await setAllSeatsHuman(user)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const btn = document.querySelector(
      `[data-square="${opponentSquare.row},${opponentSquare.col}"]`,
    ) as HTMLElement
    await user.click(btn)

    expect(btn.getAttribute('data-state')).not.toBe('selected')
    expect(document.querySelectorAll('[data-state="selected"]')).toHaveLength(0)
    expect(
      screen.getByText(`${SEAT_NAMES[game.turn]} to move`),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Status slot (thinking indicator / event banner) — layout stability
// ---------------------------------------------------------------------------
//
// jsdom does not lay elements out, so these tests cannot measure that the
// board's pixel position stays put. What they can prove is the structural
// guarantee that makes that true in a real browser: the status slot is a
// single, always-present element, and the thinking indicator / event banner
// render *inside* it rather than as siblings that mount and unmount (which
// is what used to shove the board up and down).

describe('App: status slot layout', () => {
  it('keeps the status slot in the tree even when it has nothing to show', async () => {
    const user = userEvent.setup()
    render(<App seed={7} />)
    await setAllSeatsHuman(user)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const slot = document.querySelector('.app__status')
    expect(slot).not.toBeNull()
    // A fresh game with every seat human: nothing to announce yet.
    expect(slot?.querySelector('.ai-thinking')).toBeNull()
    expect(slot?.querySelector('.event-banner')).toBeNull()
  })

  it('renders the ai-thinking indicator inside the status slot, not as a sibling of the board', async () => {
    const user = userEvent.setup()
    // seed 0 deals West (a computer seat by default) the first turn.
    render(<App seed={0} aiDelayMs={10000} />)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const slot = document.querySelector('.app__status')
    expect(slot).not.toBeNull()
    expect(slot?.querySelector('.ai-thinking')).not.toBeNull()
    // Before this change the indicator was a direct child of <main class="app">;
    // it must now only ever appear nested inside the slot.
    expect(document.querySelector('.app > .ai-thinking')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

describe('App: rules', () => {
  it('opens the rules and Back returns to the board with the same turn', async () => {
    const user = userEvent.setup()
    const seed = 21

    render(<App seed={seed} />)
    await setAllSeatsHuman(user)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const turnTextBefore = document.querySelector('.turn-banner')?.textContent

    await user.click(screen.getByRole('button', { name: /rules/i }))
    expect(screen.getByText(/lowest total goes first/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(document.querySelectorAll('[data-square]')).toHaveLength(64)
    expect(document.querySelector('.turn-banner')?.textContent).toBe(
      turnTextBefore,
    )
  })
})

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('App: persistence', () => {
  it('resumes the exact mid-game position after an unmount/remount', async () => {
    const user = userEvent.setup()
    const seed = 55
    const game = newGame({ seed })
    const move = allLegalMoves(game, game.turn)[0]
    expect(move).toBeDefined()
    const expectedAfterMove = applyMove(game, move)

    const { unmount } = render(<App seed={seed} />)
    await setAllSeatsHuman(user)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const fromBtn = document.querySelector(
      `[data-square="${move.from.row},${move.from.col}"]`,
    ) as HTMLElement
    const toBtn = document.querySelector(
      `[data-square="${move.to.row},${move.to.col}"]`,
    ) as HTMLElement
    await user.click(fromBtn)
    await user.click(toBtn)

    unmount()

    render(<App />)
    await user.click(screen.getByRole('button', { name: /resume/i }))

    const destBtn = document.querySelector(
      `[data-square="${move.to.row},${move.to.col}"]`,
    ) as HTMLElement
    const srcBtn = document.querySelector(
      `[data-square="${move.from.row},${move.from.col}"]`,
    ) as HTMLElement

    const movedPiece = expectedAfterMove.board[move.to.row][move.to.col]!
    expect(destBtn.getAttribute('aria-label')).toContain(
      `${SEAT_NAMES[movedPiece.owner]} ${movedPiece.pieceType}`,
    )
    expect(srcBtn.getAttribute('aria-label')).toMatch(/, empty$/)
    expect(
      screen.getByText(`${SEAT_NAMES[expectedAfterMove.turn]} to move`),
    ).toBeInTheDocument()
  })

  it('clears the save once a resumed finished game reaches game-over', async () => {
    const user = userEvent.setup()
    const base = newGame({ seed: 9 })
    const finished: GameState = {
      ...base,
      phase: 'finished',
      winner: 'S',
      aliveSeats: ['S'],
    }
    saveGame(finished)

    render(<App />)
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /resume/i }))

    expect(screen.getByText(/South wins!/i)).toBeInTheDocument()
    expect(loadGame()).toBeNull()

    await user.click(screen.getByRole('button', { name: /home/i }))
    expect(
      screen.queryByRole('button', { name: /resume/i }),
    ).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AI opponents
// ---------------------------------------------------------------------------

describe('App: AI opponents', () => {
  // seed 0 deals West the lowest hand total, so West (a computer seat under
  // the default setup) is on move as soon as the board appears.
  const AI_FIRST_SEED = 0
  // seed 6 deals South the lowest hand total, so South (the human seat under
  // the default setup) is on move as soon as the board appears.
  const HUMAN_FIRST_SEED = 2

  it('computer seats take their own turns without any click, and the turn comes back around to South', async () => {
    const user = userEvent.setup()
    render(<App seed={AI_FIRST_SEED} aiDelayMs={0} />)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    // Nothing here clicks a board square: West, North and East must each take
    // their own turn unprompted for South to come back on move.
    await waitFor(
      () => {
        expect(screen.getByText('South to move')).toBeInTheDocument()
      },
      { timeout: 10000 },
    )
  }, 15000)

  it('disables the board while a computer seat is on move, so tapping its piece selects nothing', async () => {
    const user = userEvent.setup()
    const game = newGame({ seed: AI_FIRST_SEED })
    const [westPiece] = findSeatPieces(game.board, 'W')

    // A long delay keeps the computer from actually moving before we assert.
    render(<App seed={AI_FIRST_SEED} aiDelayMs={10000} />)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const btn = document.querySelector(
      `[data-square="${westPiece.square.row},${westPiece.square.col}"]`,
    ) as HTMLElement
    expect(btn).toBeDisabled()

    await user.click(btn)

    expect(btn.getAttribute('data-state')).not.toBe('selected')
    expect(document.querySelectorAll('[data-state="selected"]')).toHaveLength(0)
  })

  it('names the thinking seat in the .ai-thinking status', async () => {
    const user = userEvent.setup()
    render(<App seed={AI_FIRST_SEED} aiDelayMs={10000} />)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    expect(document.querySelector('.ai-thinking')?.textContent).toMatch(
      /West is thinking/i,
    )
  })

  it('shows a CPU badge for computer seats and none for the human seat', async () => {
    const user = userEvent.setup()
    render(<App seed={HUMAN_FIRST_SEED} aiDelayMs={0} />)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    // `.player-card` disambiguates from board pieces, which also carry a
    // `data-seat` attribute (their owner).
    const sCard = document.querySelector(
      '.player-card[data-seat="S"]',
    ) as HTMLElement
    const wCard = document.querySelector(
      '.player-card[data-seat="W"]',
    ) as HTMLElement
    const nCard = document.querySelector(
      '.player-card[data-seat="N"]',
    ) as HTMLElement
    const eCard = document.querySelector(
      '.player-card[data-seat="E"]',
    ) as HTMLElement

    expect(within(sCard).queryByText('CPU')).not.toBeInTheDocument()
    expect(within(wCard).getByText('CPU')).toBeInTheDocument()
    expect(within(nCard).getByText('CPU')).toBeInTheDocument()
    expect(within(eCard).getByText('CPU')).toBeInTheDocument()
  })

  it('lets the human seat select its own piece normally on its turn', async () => {
    const user = userEvent.setup()
    const game = newGame({ seed: HUMAN_FIRST_SEED })
    expect(game.turn).toBe('S')
    const move = allLegalMoves(game, game.turn)[0]
    expect(move).toBeDefined()

    render(<App seed={HUMAN_FIRST_SEED} aiDelayMs={0} />)
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    const fromBtn = document.querySelector(
      `[data-square="${move.from.row},${move.from.col}"]`,
    ) as HTMLElement
    expect(fromBtn).not.toBeDisabled()

    await user.click(fromBtn)

    expect(fromBtn.getAttribute('data-state')).toBe('selected')
  })

  it('plays a four-computer game to completion with no clicks after New game', async () => {
    const user = userEvent.setup()
    render(<App aiDelayMs={0} />)

    for (const seat of SEAT_ORDER) {
      await setSeatChoice(user, seat, 'Easy')
    }
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /start/i }))

    await waitFor(
      () => {
        expect(
          screen.getByRole('heading', { name: /wins!|draw/i }),
        ).toBeInTheDocument()
      },
      { timeout: 20000 },
    )
  }, 25000)
})
