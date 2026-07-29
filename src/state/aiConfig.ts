/**
 * Which seats are played by the computer. A seat mapped to `null` is a human
 * passing the device; a seat mapped to an `AiLevel` is played by the engine's
 * AI at that strength.
 */

import type { Seat } from '../engine/types'
import type { AiLevel } from '../engine/ai'

export type AiConfig = Readonly<Record<Seat, AiLevel | null>>

export const AI_LEVELS: readonly AiLevel[] = ['easy', 'normal', 'hard']

export const AI_LEVEL_LABELS: Readonly<Record<AiLevel, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
}

/**
 * How long a computer seat pauses before playing. "Relaxed" is long enough to
 * follow what happened; "fast" is for watching computers play each other or
 * pushing through a game quickly.
 */
export type AiPace = 'fast' | 'relaxed'

export const AI_PACES: readonly AiPace[] = ['relaxed', 'fast']

export const AI_PACE_LABELS: Readonly<Record<AiPace, string>> = {
  relaxed: 'Relaxed',
  fast: 'Fast',
}

export const AI_PACE_DELAY_MS: Readonly<Record<AiPace, number>> = {
  relaxed: 900,
  fast: 120,
}

export const DEFAULT_AI_PACE: AiPace = 'relaxed'

export function parseAiPace(value: unknown): AiPace | null {
  return value === 'fast' || value === 'relaxed' ? value : null
}

/** Default: you take South, the computer plays the other three seats. */
export const DEFAULT_AI_CONFIG: AiConfig = {
  S: null,
  W: 'normal',
  N: 'normal',
  E: 'normal',
}

/** Four humans passing one device — the original pass-and-play mode. */
export const ALL_HUMAN_CONFIG: AiConfig = { S: null, W: null, N: null, E: null }

export function isAiSeat(config: AiConfig, seat: Seat): boolean {
  return config[seat] !== null
}

export function countAiSeats(config: AiConfig): number {
  return (['S', 'W', 'N', 'E'] as const).filter((s) => config[s] !== null).length
}

/** Validates data coming back out of localStorage. */
export function parseAiConfig(value: unknown): AiConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const result: Record<Seat, AiLevel | null> = {
    S: null,
    W: null,
    N: null,
    E: null,
  }
  for (const seat of ['S', 'W', 'N', 'E'] as const) {
    const level = record[seat]
    if (level === null || level === undefined) {
      result[seat] = null
    } else if (
      typeof level === 'string' &&
      (AI_LEVELS as readonly string[]).includes(level)
    ) {
      result[seat] = level as AiLevel
    } else {
      return null
    }
  }
  return result
}
