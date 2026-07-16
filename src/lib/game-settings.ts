import { idbGet, idbSet } from '@/lib/idb-store'

export interface GameSettings {
  boardSize: number
  boardRadius: number
  worldSize: number
  debugMode: boolean
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  boardSize: 6,
  boardRadius: 4,
  worldSize: 3,
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
