import { type CubeColor, CUBE_COLOR_PALETTE, CUBE_COLORS } from '@/lib/cube-colors'
import { buildBoardCells, type CellPosition, type GridCoord, gridKey, type WorldState } from '@/lib/world'

// Random count of special cells generated per grid; tune to taste.
export const SPECIAL_CELLS_PER_GRID_MIN = 2
export const SPECIAL_CELLS_PER_GRID_MAX = 4

// How strongly a special cell's color shows through, 0 (invisible) to 1
// (opaque) — the one constant to tune for the whole app.
export const SPECIAL_CELL_OPACITY = 0.35

export interface SpecialCell {
  position: CellPosition
  color: CubeColor
}

export type SpecialCellsState = Record<string, SpecialCell[]>

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// Special cells for a single grid: a random count (within the
// configured interval, capped to the number of cells available) of
// randomly colored cells, scattered over random cells — at most one
// color per cell. Entirely independent of objects: a cell may hold both
// a special color and an object, that's expected (only player
// *placement* avoids special cells, see use-game-world.tsx — object
// generation never does).
function generateGridSpecialCells(world: WorldState): SpecialCell[] {
  const boardCells = buildBoardCells(world)
  if (boardCells.length === 0) return []

  const count = Math.min(
    boardCells.length,
    SPECIAL_CELLS_PER_GRID_MIN +
      Math.floor(Math.random() * (SPECIAL_CELLS_PER_GRID_MAX - SPECIAL_CELLS_PER_GRID_MIN + 1))
  )
  const usedCells = new Set<string>()
  const cells: SpecialCell[] = []

  // Bounded retries: guards against spinning forever picking already-used
  // cells as the board fills up.
  const maxAttempts = boardCells.length * 4
  let attempts = 0

  while (cells.length < count && attempts < maxAttempts) {
    attempts += 1
    const cell = randomItem(boardCells)
    const cellKey = gridKey(cell)
    if (usedCells.has(cellKey)) continue
    usedCells.add(cellKey)

    cells.push({
      position: cell,
      color: randomItem(CUBE_COLORS),
    })
  }

  return cells
}

// Rolls special cells for every grid of the world in one pass — mirrors
// generateWorldObjects in game-objects.ts: generated once by the host at
// the start of a game/lobby and persisted (see room-store.ts), not
// derived from coordinates.
export function generateWorldSpecialCells(world: WorldState): SpecialCellsState {
  const state: SpecialCellsState = {}
  for (let y = 0; y < world.worldSize; y++) {
    for (let x = 0; x < world.worldSize; x++) {
      const grid: GridCoord = { x, y }
      state[gridKey(grid)] = generateGridSpecialCells(world)
    }
  }
  return state
}

// CSS color-mix() so SPECIAL_CELL_OPACITY is a real runtime number, not
// a Tailwind-JIT-time literal (a dynamic opacity can't be expressed as a
// static Tailwind class).
export function specialCellBackground(color: CubeColor): string {
  return `color-mix(in srgb, ${CUBE_COLOR_PALETTE[color].bg} ${SPECIAL_CELL_OPACITY * 100}%, transparent)`
}
