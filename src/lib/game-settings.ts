import { idbGet, idbSet } from '@/lib/idb-store'

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
  boardSize: 6,
  boardRadius: 4,
  worldSize: 3,
  saboteurCount: 1,
  debugMode: false,
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
