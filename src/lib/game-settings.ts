export interface GameSettings {
  boardSize: number
  boardRadius: number
  debugMode: boolean
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  boardSize: 6,
  boardRadius: 4,
  debugMode: false,
}
