import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  Board,
  Card,
  GameEvent,
  GameState,
  Piece,
  Rank,
  Seat,
  Suit,
} from '../engine/types'
import { pieceTypeFor, SEAT_ORDER } from '../engine/types'
import { TurnBanner } from './TurnBanner'
import { PlayerPanel } from './PlayerPanel'
import { EventBanner } from './EventBanner'
import { Home } from './screens/Home'
import { Rules } from './screens/Rules'
import { GameOver } from './screens/GameOver'
import { DealReveal } from './screens/DealReveal'

// ---------------------------------------------------------------------------
// Local test helpers — build minimal GameState-shaped fixtures without
// touching engine/setup.ts, deck.ts, moves.ts, or apply.ts.
// ---------------------------------------------------------------------------

function card(rank: Rank, suit: Suit = 'C'): Card {
  return { rank, suit }
}

function piece(id: string, owner: Seat, rank: Rank, suit: Suit = 'C'): Piece {
  return {
    id,
    owner,
    card: card(rank, suit),
    pieceType: pieceTypeFor(rank),
    promoted: false,
    drawIndex: 0,
  }
}

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null))
}

function makeHands(): Record<Seat, readonly Card[]> {
  return {
    S: [card('A'), card('2'), card('3'), card('4'), card('5'), card('6')], // 21
    W: [card('A'), card('A'), card('A'), card('A'), card('2'), card('3')], // 9
    N: [card('K'), card('K'), card('K'), card('K'), card('K'), card('K')], // 78
    E: [card('10'), card('10'), card('10'), card('10'), card('10'), card('10')], // 60
  }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    board: emptyBoard(),
    turn: 'S',
    aliveSeats: ['S', 'W', 'N', 'E'],
    deckCount: 1,
    phase: 'playing',
    winner: null,
    captures: [],
    moveCount: 0,
    lastMove: null,
    events: [],
    hands: makeHands(),
    seed: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TurnBanner
// ---------------------------------------------------------------------------

describe('TurnBanner', () => {
  it('shows the correct seat name while playing', () => {
    render(<TurnBanner turn="N" phase="playing" winner={null} />)
    expect(screen.getByText('North to move')).toBeInTheDocument()
  })

  it('shows a winner message when finished', () => {
    render(<TurnBanner turn="E" phase="finished" winner="W" />)
    expect(screen.getByText(/West wins/i)).toBeInTheDocument()
  })

  it('shows a draw message when phase is draw', () => {
    render(<TurnBanner turn="S" phase="draw" winner={null} />)
    expect(screen.getByText(/draw/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// PlayerPanel
// ---------------------------------------------------------------------------

describe('PlayerPanel', () => {
  it('shows all four seats with correct piece counts', () => {
    const state = makeState()
    render(
      <PlayerPanel state={state} pieceCounts={{ S: 6, W: 5, N: 4, E: 0 }} />,
    )

    expect(screen.getByText('South', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('West', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('North', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('East', { exact: false })).toBeInTheDocument()

    const sCard = document.querySelector('[data-seat="S"]') as HTMLElement
    const eCard = document.querySelector('[data-seat="E"]') as HTMLElement
    expect(within(sCard).getByText(/6 pieces/)).toBeInTheDocument()
    expect(within(eCard).getByText(/0 pieces/)).toBeInTheDocument()
  })

  it('shows captured cards for the capturing seat', () => {
    const state = makeState({
      captures: [
        { piece: piece('W-0', 'W', 'Q', 'H'), by: 'S', moveNumber: 1 },
        { piece: piece('N-0', 'N', '9', 'S'), by: 'S', moveNumber: 2 },
      ],
    })
    render(
      <PlayerPanel state={state} pieceCounts={{ S: 6, W: 5, N: 5, E: 6 }} />,
    )

    const sCard = document.querySelector('[data-seat="S"]') as HTMLElement
    expect(within(sCard).getByText('Q♥')).toBeInTheDocument()
    expect(within(sCard).getByText('9♠')).toBeInTheDocument()

    const wCard = document.querySelector('[data-seat="W"]') as HTMLElement
    expect(within(wCard).getByText(/no captures/i)).toBeInTheDocument()
  })

  it('marks the seat to move', () => {
    const state = makeState({ turn: 'E' })
    render(
      <PlayerPanel state={state} pieceCounts={{ S: 6, W: 6, N: 6, E: 6 }} />,
    )

    const eCard = document.querySelector('[data-seat="E"]') as HTMLElement
    const sCard = document.querySelector('[data-seat="S"]') as HTMLElement
    expect(eCard.getAttribute('data-turn')).toBe('true')
    expect(sCard.getAttribute('data-turn')).toBe('false')
  })

  it('greys out an eliminated seat', () => {
    const state = makeState({ aliveSeats: ['S', 'W', 'E'] })
    render(
      <PlayerPanel state={state} pieceCounts={{ S: 6, W: 6, N: 0, E: 6 }} />,
    )

    const nCard = document.querySelector('[data-seat="N"]') as HTMLElement
    expect(nCard.getAttribute('data-eliminated')).toBe('true')
    expect(within(nCard).getByText(/out/i)).toBeInTheDocument()

    const sCard = document.querySelector('[data-seat="S"]') as HTMLElement
    expect(sCard.getAttribute('data-eliminated')).toBe('false')
  })

  it('shows a CPU badge for computer seats and omits it for a human seat', () => {
    const state = makeState()
    render(
      <PlayerPanel
        state={state}
        pieceCounts={{ S: 6, W: 6, N: 6, E: 6 }}
        aiSeats={{ S: null, W: 'normal', N: 'hard', E: 'easy' }}
      />,
    )

    const sCard = document.querySelector('[data-seat="S"]') as HTMLElement
    const wCard = document.querySelector('[data-seat="W"]') as HTMLElement
    const nCard = document.querySelector('[data-seat="N"]') as HTMLElement
    const eCard = document.querySelector('[data-seat="E"]') as HTMLElement

    expect(within(sCard).queryByText('CPU')).not.toBeInTheDocument()
    expect(within(wCard).getByText('CPU')).toBeInTheDocument()
    expect(within(nCard).getByText('CPU')).toBeInTheDocument()
    expect(within(eCard).getByText('CPU')).toBeInTheDocument()
  })

  it('omits the CPU badge for every seat when aiSeats is not provided', () => {
    const state = makeState()
    render(
      <PlayerPanel state={state} pieceCounts={{ S: 6, W: 6, N: 6, E: 6 }} />,
    )

    expect(screen.queryByText('CPU')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// EventBanner
// ---------------------------------------------------------------------------

describe('EventBanner', () => {
  it('renders elimination, skip, promotion and draw sentences', () => {
    const events: GameEvent[] = [
      { type: 'elimination', seat: 'W' },
      { type: 'skip', seat: 'N' },
      { type: 'promotion', seat: 'S', at: { row: 0, col: 3 } },
      { type: 'draw' },
    ]
    render(<EventBanner events={events} />)

    expect(
      screen.getByText('West eliminated — board resets'),
    ).toBeInTheDocument()
    expect(screen.getByText('North has no moves — skipped')).toBeInTheDocument()
    expect(screen.getByText('South pawn promoted to Queen')).toBeInTheDocument()
    expect(screen.getByText('No player can move — draw')).toBeInTheDocument()
  })

  it('ignores plain move and capture events', () => {
    const events: GameEvent[] = [
      {
        type: 'move',
        seat: 'S',
        move: { from: { row: 6, col: 1 }, to: { row: 5, col: 1 } },
      },
      { type: 'capture', by: 'S', piece: piece('W-0', 'W', '5', 'D') },
    ]
    const { container } = render(<EventBanner events={events} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for an empty list', () => {
    const { container } = render(<EventBanner events={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

describe('Home', () => {
  it('shows Resume only when hasSave is true', () => {
    const { rerender } = render(
      <Home
        hasSave={false}
        onNewGame={vi.fn()}
        onResume={vi.fn()}
        onRules={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /resume/i }),
    ).not.toBeInTheDocument()

    rerender(
      <Home
        hasSave={true}
        onNewGame={vi.fn()}
        onResume={vi.fn()}
        onRules={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
  })

  it('fires each callback on click', async () => {
    const user = userEvent.setup()
    const onNewGame = vi.fn()
    const onResume = vi.fn()
    const onRules = vi.fn()
    render(
      <Home
        hasSave={true}
        onNewGame={onNewGame}
        onResume={onResume}
        onRules={onRules}
      />,
    )

    await user.click(screen.getByRole('button', { name: /new game/i }))
    await user.click(screen.getByRole('button', { name: /resume/i }))
    await user.click(screen.getByRole('button', { name: /rules/i }))

    expect(onNewGame).toHaveBeenCalledTimes(1)
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(onRules).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Home: seat setup
// ---------------------------------------------------------------------------

describe('Home: seat setup', () => {
  function renderHome(onNewGame = vi.fn()) {
    render(
      <Home
        hasSave={false}
        onNewGame={onNewGame}
        onResume={vi.fn()}
        onRules={vi.fn()}
      />,
    )
    return onNewGame
  }

  function seatRow(seat: Seat): HTMLElement {
    return document.querySelector(`[data-seat="${seat}"]`) as HTMLElement
  }

  it('renders all four seat rows, each with the four player choices', () => {
    renderHome()

    for (const seat of SEAT_ORDER) {
      const row = seatRow(seat)
      expect(row).not.toBeNull()
      for (const label of ['You', 'Easy', 'Normal', 'Hard']) {
        expect(
          within(row).getByRole('button', { name: label }),
        ).toBeInTheDocument()
      }
    }
  })

  it('defaults to South human and West/North/East normal', () => {
    renderHome()

    expect(
      within(seatRow('S')).getByRole('button', { name: 'You' }),
    ).toHaveAttribute('aria-pressed', 'true')

    for (const seat of ['W', 'N', 'E'] as const) {
      const normalBtn = within(seatRow(seat)).getByRole('button', {
        name: 'Normal',
      })
      expect(normalBtn).toHaveAttribute('aria-pressed', 'true')
      expect(normalBtn).toHaveAttribute('data-active', 'true')
    }
  })

  it('clicking a choice updates aria-pressed and data-active for that seat only', async () => {
    const user = userEvent.setup()
    renderHome()

    const row = seatRow('N')
    const hardBtn = within(row).getByRole('button', { name: 'Hard' })
    const normalBtn = within(row).getByRole('button', { name: 'Normal' })
    expect(normalBtn).toHaveAttribute('aria-pressed', 'true')
    expect(hardBtn).toHaveAttribute('aria-pressed', 'false')

    await user.click(hardBtn)

    expect(hardBtn).toHaveAttribute('aria-pressed', 'true')
    expect(hardBtn).toHaveAttribute('data-active', 'true')
    expect(normalBtn).toHaveAttribute('aria-pressed', 'false')
    expect(normalBtn).toHaveAttribute('data-active', 'false')

    // West and East are untouched.
    expect(
      within(seatRow('W')).getByRole('button', { name: 'Normal' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(seatRow('E')).getByRole('button', { name: 'Normal' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('passes the chosen config to onNewGame', async () => {
    const user = userEvent.setup()
    const onNewGame = renderHome()

    await user.click(within(seatRow('N')).getByRole('button', { name: 'Hard' }))
    await user.click(screen.getByRole('button', { name: /new game/i }))

    expect(onNewGame).toHaveBeenCalledTimes(1)
    expect(onNewGame).toHaveBeenCalledWith(
      {
        S: null,
        W: 'normal',
        N: 'hard',
        E: 'normal',
      },
      'relaxed',
      1,
    )
  })
})

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

describe('Rules', () => {
  it('renders key rule text', () => {
    render(<Rules onBack={vi.fn()} />)

    expect(screen.getByText(/lowest total goes first/i)).toBeInTheDocument()
    expect(screen.getByText(/King is an ordinary piece/i)).toBeInTheDocument()
    expect(screen.getByText(/promotes to a Queen/i)).toBeInTheDocument()
    expect(screen.getAllByText(/board reset/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Bishop')).toBeInTheDocument()
  })

  it('fires onBack', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<Rules onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// GameOver
// ---------------------------------------------------------------------------

describe('GameOver', () => {
  it('shows the winner', () => {
    render(<GameOver winner="N" onRematch={vi.fn()} onHome={vi.fn()} />)
    expect(screen.getByText(/North wins/i)).toBeInTheDocument()
  })

  it('shows a draw when winner is null', () => {
    render(<GameOver winner={null} onRematch={vi.fn()} onHome={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /draw/i })).toBeInTheDocument()
  })

  it('fires both callbacks', async () => {
    const user = userEvent.setup()
    const onRematch = vi.fn()
    const onHome = vi.fn()
    render(<GameOver winner="S" onRematch={onRematch} onHome={onHome} />)

    await user.click(screen.getByRole('button', { name: /rematch/i }))
    await user.click(screen.getByRole('button', { name: /home/i }))

    expect(onRematch).toHaveBeenCalledTimes(1)
    expect(onHome).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// DealReveal
// ---------------------------------------------------------------------------

describe('DealReveal', () => {
  it('shows four hands, correct totals, and names the first seat', () => {
    const hands = makeHands()
    render(<DealReveal hands={hands} firstSeat="W" onStart={vi.fn()} />)

    const sHand = document.querySelector('[data-seat="S"]') as HTMLElement
    const wHand = document.querySelector('[data-seat="W"]') as HTMLElement
    const nHand = document.querySelector('[data-seat="N"]') as HTMLElement
    const eHand = document.querySelector('[data-seat="E"]') as HTMLElement

    expect(within(sHand).getByText(/Total: 21/)).toBeInTheDocument()
    expect(within(wHand).getByText(/Total: 9/)).toBeInTheDocument()
    expect(within(nHand).getByText(/Total: 78/)).toBeInTheDocument()
    expect(within(eHand).getByText(/Total: 60/)).toBeInTheDocument()

    expect(
      screen.getByText(/West has the lowest total \(9\) and goes first/i),
    ).toBeInTheDocument()
  })

  it('fires onStart', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<DealReveal hands={makeHands()} firstSeat="W" onStart={onStart} />)
    await user.click(screen.getByRole('button', { name: /start/i }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
