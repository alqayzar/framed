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
