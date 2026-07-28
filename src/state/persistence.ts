/**
 * localStorage save/resume. All access is wrapped: private browsing, quota
 * errors, and corrupted or old-version saves must never crash the app — they
 * just mean "no save".
 */

import type { GameState } from '../engine/types'
import { serialize, deserialize } from '../engine/serialize'
import { parseAiConfig, type AiConfig } from './aiConfig'

const SAVE_KEY = 'chards:save'
const AI_KEY = 'chards:ai'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function saveGame(state: GameState): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(SAVE_KEY, serialize(state))
  } catch {
    // Quota or serialization failure — a lost save is not worth a crash.
  }
}

export function loadGame(): GameState | null {
  const store = storage()
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(SAVE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  const state = deserialize(raw)
  if (!state) {
    // Corrupt or written by an older schema — discard it so Home starts clean.
    clearSave()
    return null
  }
  return state
}

export function clearSave(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(SAVE_KEY)
    store.removeItem(AI_KEY)
  } catch {
    // ignore
  }
}

/** Saved next to the game so a resumed game keeps its computer players. */
export function saveAiConfig(config: AiConfig): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(AI_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

export function loadAiConfig(): AiConfig | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(AI_KEY)
    if (!raw) return null
    return parseAiConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function hasSave(): boolean {
  return loadGame() !== null
}
