import { idbGet, idbSet } from '@/lib/idb-store'
import type { GameMode } from '@/lib/world'

export interface GameSettings {
  boardSize: number
  boardRadius: number
  worldSize: number
  // How many players are assigned the Saboteur identity when the game
  // starts (see assignIdentities in identities.ts) — clamped against
  // maxSaboteurs(playerCount) at that point, since the configured value
  // may exceed what the actual player count supports.
  saboteurCount: number
  debugMode: boolean
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  boardSize: 16,
  boardRadius: 14,
  worldSize: 3,
  saboteurCount: 1,
  debugMode: false,
}

// Settings that must be identical for every connected player rather
// than each client reading its own independently-configured copy —
// broadcast by the host whenever changed (see the 'settings-sync'
// RoomMessage in use-game-world.tsx). Add a field here to make
// another setting shared the same way — no new message type needed.
export interface SharedSettings {
  // Camera zoom — the board is scaled as if it had this many
  // columns/rows, independent of boardSize (see WorldState in
  // world.ts). When boardSize exceeds this, the extra cells sit outside
  // the viewport and a follow-camera pans to reveal them.
  viewBoardSize: number
  // 'sandbox' swaps in a much bigger board with no spawned objects or
  // special cells once the game starts (see applyGameMode in
  // world.ts) — a room-level property, not a personal preference, so
  // it lives here rather than in GameSettings.
  mode: GameMode
}

export const DEFAULT_SHARED_SETTINGS: SharedSettings = {
  viewBoardSize: 4,
  mode: 'framed',
}

const GAME_SETTINGS_KEY = 'game-settings'

export function saveGameSettings(settings: GameSettings): Promise<void> {
  return idbSet(GAME_SETTINGS_KEY, settings)
}

// Merges over the defaults so settings saved before a new field was
// introduced (e.g. worldSize) still come back complete.
export async function loadGameSettings(): Promise<GameSettings> {
  const stored = await idbGet<Partial<GameSettings>>(GAME_SETTINGS_KEY)
  return { ...DEFAULT_GAME_SETTINGS, ...stored }
}
