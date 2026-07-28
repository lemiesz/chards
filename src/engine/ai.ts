/**
 * AI opponent for the Chards engine (PLAN.md §1).
 *
 * Pure TypeScript, no DOM/React imports (see engine/types.ts architecture
 * rule). `chooseMove` never mutates its input `state`, and is deterministic
 * given the same state + seat + level + seeded rng.
 *
 * Levels:
 *  - 'easy'   picks uniformly at random among legal moves.
 *  - 'normal' greedy one-ply: score each legal move by immediate gain
 *    (captures, promotion, elimination, pawn advancement, centralisation),
 *    take the best, break ties randomly.
 *  - 'hard'   everything 'normal' does, plus a reply-aware term: simulate
 *    the move and subtract the best material any single opponent could win
 *    back immediately. To stay fast, only the top-N shallow-scored moves are
 *    deep-evaluated (see HARD_CANDIDATE_CAP below).
 *
 * Staleness escalation (see `stalenessFactor` below): this engine has no
 * repetition or move-count draw rule (PLAN.md's only draw is "every alive
 * seat skipped in one round"), so a purely reply-averse 'hard' can decline
 * every available trade forever -- an even trade nets ~0 after the reply
 * penalty, which loses to a quiet move's small positional bonus, so two
 * risk-averse endgame pieces can shuffle indefinitely. `GameState` already
 * carries the progress signal (`moveCount`, `captures`), so `scoreMove` and
 * the 'hard' reply search read "plies since the last capture" and, ONLY
 * once that stretch is unusually long, lean harder into engagement and
 * discount the reply penalty. In a normal position (recent capture, low
 * staleness) this is a no-op and tactics are unaffected.
 */

import type { Rng } from './deck'
import { makeRng } from './deck'
import { applyMove } from './apply'
import { allLegalMoves } from './moves'
import {
  PROMOTION_EDGE,
  pieceAt,
  type GameState,
  type Move,
  type Piece,
  type PieceType,
  type Seat,
  type Square,
} from './types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AiLevel = 'easy' | 'normal' | 'hard'

export interface AiOptions {
  level?: AiLevel
  /** Used ONLY for tie-breaking; not for search order or anything else. */
  rng?: Rng
}

// ---------------------------------------------------------------------------
// Piece values
// ---------------------------------------------------------------------------

const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 3.5,
}

/** Static material value of a piece. A promoted pawn has pieceType 'queen' (9). */
export function pieceValue(piece: Piece): number {
  return PIECE_VALUES[piece.pieceType]
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Distance (in squares) from the central 2x2 block. 0 inside it, growing outward. */
function centreDistance(sq: Square): number {
  const rowDist = Math.max(3 - sq.row, sq.row - 4, 0)
  const colDist = Math.max(3 - sq.col, sq.col - 4, 0)
  return rowDist + colDist
}

/**
 * Chebyshev (king-move) distance from `to` to the nearest piece not owned by
 * `owner`, or 0 if there are none. This is a nudge toward engagement:
 * without it, two lone risk-averse pieces on an otherwise-empty board have
 * no incentive to ever come within capturing range of each other, and a
 * 'hard' vs 'hard' (or 'normal' vs 'normal') endgame can shuffle forever
 * (observed empirically with two rooks that just never realign onto a
 * shared rank/file). Its weight is well below any real capture value (max
 * board distance is 7, so its swing tops out under 1 point), so it only
 * ever nudges between quiet moves or near-equal trades -- it never flips
 * the ordering between two captures of different value.
 */
function nearestEnemyDistance(
  board: GameState['board'],
  owner: Seat,
  to: Square,
): number {
  let best = Infinity
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const cell = board[row][col]
      if (cell === null || cell.owner === owner) continue
      const dist = Math.max(Math.abs(row - to.row), Math.abs(col - to.col))
      if (dist < best) best = dist
    }
  }
  return best === Infinity ? 0 : best
}

/**
 * Whether landing on `to` shares a rank or file with at least one enemy
 * piece, ignoring blockers in between. Plain distance-closing (see
 * `nearestEnemyDistance`) turns out not to be enough on its own to break a
 * standoff between sliding pieces: a rook needs to actually be on a shared
 * rank/file to threaten a capture at all, and two rooks can stay
 * "Chebyshev-close" forever without ever lining up (this was observed
 * directly: a stress-tested 'hard' vs 'hard' endgame with a rook on each
 * side sat at zero available captures for thousands of plies even at full
 * staleness escalation, because nothing rewarded the alignment itself).
 * This is a coarse, cheap proxy -- it does not check for blocking pieces --
 * used only as a staleness-scaled nudge, never a material-sized one.
 */
function sharesLineWithEnemy(
  board: GameState['board'],
  owner: Seat,
  to: Square,
): boolean {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (row !== to.row && col !== to.col) continue
      const cell = board[row][col]
      if (cell !== null && cell.owner !== owner) return true
    }
  }
  return false
}

/** Whether `move` would land a pawn exactly on its owner's promotion edge. */
function isPromotingMove(piece: Piece, to: Square): boolean {
  if (piece.pieceType !== 'pawn') return false
  const edge = PROMOTION_EDGE[piece.owner]
  return edge.axis === 'row' ? to.row === edge.index : to.col === edge.index
}

/**
 * Progress (0..1) a pawn has made toward its promotion edge if it lands on
 * `to`. 0 = just left home row, 1 = on the promotion edge.
 */
function pawnProgress(piece: Piece, to: Square): number {
  if (piece.pieceType !== 'pawn') return 0
  const edge = PROMOTION_EDGE[piece.owner]
  const start = edge.index === 0 ? 7 : 0
  const current = edge.axis === 'row' ? to.row : to.col
  const total = Math.abs(edge.index - start)
  if (total === 0) return 1
  return 1 - Math.abs(edge.index - current) / total
}

function pickRandom<T>(items: readonly T[], rng: Rng): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length))
  return items[index]
}

// ---------------------------------------------------------------------------
// Staleness: plies since the last capture, used to escalate out of standoffs
// ---------------------------------------------------------------------------

/** Below this many stale plies, staleness has zero effect on scoring. */
const STALE_ENGAGE_START = 40
/** At and beyond this many stale plies, escalation is fully in effect. */
const STALE_ENGAGE_FULL = 160

/** How many plies have passed since the most recent capture (0 if none yet). */
function plySinceLastCapture(state: GameState): number {
  const lastCaptureMove =
    state.captures.length > 0
      ? state.captures[state.captures.length - 1].moveNumber
      : 0
  return state.moveCount - lastCaptureMove
}

/**
 * 0..1 ramp: 0 while the game is progressing normally (a capture happened
 * recently), rising linearly to 1 once a long capture-free stretch signals a
 * standoff. Pure function of `state` -- no mutation, no randomness.
 */
function stalenessFactor(state: GameState): number {
  const stale = plySinceLastCapture(state)
  if (stale <= STALE_ENGAGE_START) return 0
  if (stale >= STALE_ENGAGE_FULL) return 1
  return (stale - STALE_ENGAGE_START) / (STALE_ENGAGE_FULL - STALE_ENGAGE_START)
}

// ---------------------------------------------------------------------------
// scoreMove: shallow (0-ply capture/promotion/elimination/positional) score
// ---------------------------------------------------------------------------

const CAPTURE_WEIGHT = 1
const PROMOTION_BONUS = 8
const ELIMINATION_BONUS = 15
const PAWN_ADVANCE_WEIGHT = 0.05
const CENTRE_WEIGHT = 0.02
/**
 * Weight for closing the distance to the nearest enemy piece, fully driven
 * by staleness (0 at staleness 0, this value at staleness 1 -- see
 * `stalenessFactor`). Deliberately absent from ordinary play: an
 * always-on aggression term, even a tiny one, turned out to shift a normal
 * game's move ordering just enough to trap it in its OWN standoff on some
 * seeds (found by broad stress-testing, not the reported 20-seed sample).
 * Making it purely staleness-gated means fresh/normal positions score
 * identically to a build with no aggression term at all, and the nudge only
 * ever appears once a long capture-free stretch already flags a standoff.
 */
const AGGRESSION_WEIGHT_AT_FULL_STALENESS = 0.1
/** Bonus for landing on a shared rank/file with an enemy piece; same staleness gating as above. */
const LINE_ALIGNMENT_BONUS_AT_FULL_STALENESS = 0.3

/**
 * Score of a candidate move, higher is better. This is the shallow
 * (one-ply, no-reply) component used directly by 'easy'/'normal' and as the
 * base term for 'hard'. 'easy' does not call this at all (it is uniform
 * random), but it is still meaningful to score its moves in tests.
 */
export function scoreMove(
  state: GameState,
  move: Move,
  level: AiLevel,
): number {
  void level // shallow score is level-independent; kept for API symmetry
  const piece = pieceAt(state.board, move.from)
  if (piece === null) return -Infinity

  let score = 0

  const target = pieceAt(state.board, move.to)
  if (target !== null) {
    score += CAPTURE_WEIGHT * pieceValue(target)

    // Elimination bonus: does this capture take the target owner's LAST piece?
    let targetOwnerCount = 0
    for (const row of state.board) {
      for (const cell of row) {
        if (cell !== null && cell.owner === target.owner) targetOwnerCount += 1
      }
    }
    if (targetOwnerCount === 1) {
      score += ELIMINATION_BONUS
    }
  }

  if (isPromotingMove(piece, move.to)) {
    score += PROMOTION_BONUS
  }

  score += PAWN_ADVANCE_WEIGHT * pawnProgress(piece, move.to)
  score -= CENTRE_WEIGHT * centreDistance(move.to)

  // The longer it has been since any capture, the harder this leans toward
  // closing distance on an enemy piece -- a standoff-breaker that is a
  // true no-op in ordinary play (stalenessFactor === 0 means this whole
  // term drops out) and only ever grows a small positional term, never a
  // material one, even at its strongest.
  const stale = stalenessFactor(state)
  const aggressionWeight = AGGRESSION_WEIGHT_AT_FULL_STALENESS * stale
  score -=
    aggressionWeight * nearestEnemyDistance(state.board, piece.owner, move.to)

  // Plain distance-closing is not enough to break every standoff: a slider
  // needs to actually land on a shared rank/file to threaten anything, and
  // two sliders can stay "close" without ever lining up (see
  // `sharesLineWithEnemy`). Same staleness gating and small-versus-material
  // sizing as the aggression term above.
  if (stale > 0 && sharesLineWithEnemy(state.board, piece.owner, move.to)) {
    score += LINE_ALIGNMENT_BONUS_AT_FULL_STALENESS * stale
  }

  return score
}

// ---------------------------------------------------------------------------
// hard: reply-aware search
// ---------------------------------------------------------------------------

/**
 * Cap on how many shallow-best candidate moves get deep-evaluated at 'hard'
 * level in ordinary (non-stale) play. Bounds the O(candidates * opponent
 * replies) reply search so a decision stays well under the ~100ms budget
 * even from a busy midgame position with dozens of legal moves. Lifted
 * entirely once `stalenessFactor` reaches 1 -- see the comment where it is
 * used in `chooseMove`.
 */
const HARD_CANDIDATE_CAP = 12

/**
 * Best material any single alive-and-not-`excludeSeat` seat could win with
 * one immediate move in `state`. Used to estimate "how much does the seat on
 * move next stand to win back", weighted by how soon that seat is due to
 * move.
 */
function bestImmediateGainForSeat(state: GameState, seat: Seat): number {
  if (state.phase !== 'playing') return 0
  let best = 0
  for (const move of allLegalMoves(state, seat)) {
    const target = pieceAt(state.board, move.to)
    if (target === null) continue
    const value = pieceValue(target)
    if (value > best) best = value
  }
  return best
}

/**
 * Reply-aware term: after playing `move`, look at what every other alive
 * seat could immediately win back and subtract the worst case, weighting the
 * seat whose turn it actually lands on most heavily (they reply first; the
 * other two only get a look-in if the board reset scrambled the turn order
 * in this engine's four-player skip/eliminate/reset rules).
 *
 * The raw penalty is then discounted by `stalenessFactor(state)`: at
 * staleness 0 (a capture happened recently) it is applied in full, exactly
 * as before. Only once the position has gone a long, unusual stretch
 * without any capture does the discount kick in, tapering the penalty down
 * so that even an "equal" trade -- which nets to roughly zero once the full
 * penalty is subtracted -- stops looking worse than shuffling forever. This
 * is what lets 'hard' escalate out of a standoff without touching its
 * tactics in a normal position: `state` (not the post-move `resulting`
 * state) drives the discount, since it reflects how stale THIS decision
 * point is, not the one move being evaluated.
 *
 * Also returns `containment`: at high staleness, how many fewer legal moves
 * the immediate opponent has after `move` than a neutral baseline. Closing
 * distance (scoreMove's aggression term) and lining up on a shared rank/file
 * (sharesLineWithEnemy) get pieces near each other, but an evasive piece
 * (a lone knight in particular) can still dodge a single pursuer forever on
 * an open board -- restricting its escape squares is the actual technique
 * needed to corner it, same as a real king-hunt. This reuses the single
 * `applyMove` simulation already done for the reply penalty rather than
 * paying for a second one.
 */
function evaluateReply(
  state: GameState,
  move: Move,
  mySeat: Seat,
): { penalty: number; containment: number } {
  let resulting: GameState
  try {
    resulting = applyMove(state, move)
  } catch {
    // Should not happen for a move drawn from allLegalMoves, but stay safe.
    return { penalty: 0, containment: 0 }
  }

  if (resulting.phase !== 'playing') return { penalty: 0, containment: 0 }

  const otherAliveSeats = resulting.aliveSeats.filter((seat) => seat !== mySeat)
  if (otherAliveSeats.length === 0) return { penalty: 0, containment: 0 }

  let penalty = 0
  for (const seat of otherAliveSeats) {
    const gain = bestImmediateGainForSeat(resulting, seat)
    // The seat actually on move replies first and is the real threat; the
    // other alive seats only matter for the ply after that, so they are
    // discounted rather than ignored (a board reset can hand any of them
    // the next move after a later capture, so they are not irrelevant).
    const weight = seat === resulting.turn ? 1 : 0.35
    penalty = Math.max(penalty, weight * gain)
  }

  const stale = stalenessFactor(state)
  const discount = 1 - PENALTY_STALE_DECAY * stale

  // Only bother counting the opponent's replies (another allLegalMoves scan)
  // once staleness could actually use the answer.
  const containment =
    stale > 0 ? allLegalMoves(resulting, resulting.turn).length : 0

  return { penalty: penalty * discount, containment }
}

/**
 * How much of the reply penalty staleness can strip away at full escalation.
 * At 1 (full decay), a maximally-stale 'hard' ranks candidates purely by
 * `scoreMove` -- i.e. it falls back to exactly 'normal's greedy ranking,
 * which the baseline measurement shows always converges quickly on its own.
 * That fallback is deliberate: once a position has gone this long without a
 * capture, forcing progress matters more than reply-safety.
 */
const PENALTY_STALE_DECAY = 1

/**
 * Weight for the containment term at full staleness: prefer moves that
 * leave the immediate opponent with fewer legal replies (a basic king-hunt
 * technique), scaled the same way as the other standoff-breakers above.
 */
const CONTAINMENT_WEIGHT_AT_FULL_STALENESS = 0.05

/** Does `move` win the game outright for `seat`? */
function isWinningMove(state: GameState, move: Move, seat: Seat): boolean {
  try {
    const resulting = applyMove(state, move)
    return resulting.phase === 'finished' && resulting.winner === seat
  } catch {
    return false
  }
}

const WIN_SCORE = 1000

// ---------------------------------------------------------------------------
// chooseMove
// ---------------------------------------------------------------------------

/** Picks a move for `seat`. Returns null if that seat has no legal move. */
export function chooseMove(
  state: GameState,
  seat: Seat,
  options?: AiOptions,
): Move | null {
  const level = options?.level ?? 'normal'
  const rng = options?.rng ?? makeRng(Math.floor(Math.random() * 2 ** 31))

  const moves = allLegalMoves(state, seat)
  if (moves.length === 0) return null

  if (level === 'easy') {
    return pickRandom(moves, rng)
  }

  if (level === 'normal') {
    const scored = moves.map((move) => ({
      move,
      score: scoreMove(state, move, level),
    }))
    return pickBestScored(scored, rng)
  }

  // hard: shallow-score everything, deep-evaluate only the top N candidates
  // (see HARD_CANDIDATE_CAP) with a reply-aware term, then pick the best. At
  // full staleness the cap is dropped entirely (see below): the reply
  // penalty has already decayed to nothing by then, so the only thing a cap
  // could do at that point is arbitrarily hide the very move needed to
  // escape a standoff -- a real cause of stalls found during stress-testing
  // (a stuck position with >12 legal moves would silently never consider
  // some of them). Deep-evaluating every move stays cheap (a plain
  // `applyMove` clone plus a few `allLegalMoves` scans per candidate), so
  // there is no meaningful cost to widening it once it's actually needed.
  const shallowScored = moves
    .map((move) => ({ move, shallow: scoreMove(state, move, 'hard') }))
    .sort((a, b) => b.shallow - a.shallow)

  const stale = stalenessFactor(state)
  const cap = stale >= 1 ? shallowScored.length : HARD_CANDIDATE_CAP
  const candidates = shallowScored.slice(0, cap)

  const deepScored = candidates.map(({ move, shallow }) => {
    if (isWinningMove(state, move, seat)) {
      return { move, score: WIN_SCORE + shallow }
    }
    const { penalty, containment } = evaluateReply(state, move, seat)
    const containmentBonus =
      CONTAINMENT_WEIGHT_AT_FULL_STALENESS * stale * -containment
    return { move, score: shallow - penalty + containmentBonus }
  })

  return pickBestScored(deepScored, rng)
}

function pickBestScored(
  scored: readonly { move: Move; score: number }[],
  rng: Rng,
): Move {
  let best = -Infinity
  let bestMoves: Move[] = []
  for (const { move, score } of scored) {
    if (score > best + 1e-9) {
      best = score
      bestMoves = [move]
    } else if (score > best - 1e-9) {
      bestMoves.push(move)
    }
  }
  return pickRandom(bestMoves, rng)
}
