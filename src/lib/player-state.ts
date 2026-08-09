import type { CubeColor } from '@/lib/cube-colors'
import type { ToastOptions } from '@/hooks/use-toast'
import type { CellPosition } from '@/lib/world'

export interface PlayerState {
  position: CellPosition
  // Which grid of the world the player stands on (see GridCoord in
  // world.ts). Everyone spawns on the world's center grid, then moves
  // between grids by crossing a board edge (see moveToGrid).
  gridX: number
  gridY: number
  color: CubeColor
  username: string
}

export type PlayersState = Record<string, PlayerState>

export interface BroadcastToastOptions extends ToastOptions {
  // Non-empty: only these players' toasts. Empty/null/omitted: everyone.
  playerIds?: string[] | null
}
