import { type CubeColor, CUBE_COLOR_PALETTE, CUBE_COLORS } from '@/lib/cube-colors'
import { buildBoardCells, type CellPosition, type GridCoord, gridKey, type WorldState } from '@/lib/world'

// Random count of color-tinted cells generated per grid; tune to taste.
export const COLOR_CELLS_PER_GRID_MIN = 2
export const COLOR_CELLS_PER_GRID_MAX = 2

// Random count of shaped cells generated per grid; tune to taste.
export const SHAPE_CELLS_PER_GRID_MIN = 2
export const SHAPE_CELLS_PER_GRID_MAX = 2

// How strongly a special cell's color shows through, 0 (invisible) to 1
// (opaque) — the one constant to tune for the whole app.
export const SPECIAL_CELL_OPACITY = 0.35

export type CellShape = 'circle' | 'triangle' | 'square' | 'star'
export const CELL_SHAPES: CellShape[] = ['circle', 'triangle', 'square', 'star']

export interface SpecialCell {
  position: CellPosition
  color?: CubeColor
  shape?: CellShape
}

export type SpecialCellsState = Record<string, SpecialCell[]>

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// Picks a random count (within [min, max], capped to boardCells.length)
// of distinct cells from the board via bounded-retry scatter — guards
// against spinning forever picking already-used cells as the board fills
// up.
function scatterCells(boardCells: CellPosition[], count: number): CellPosition[] {
  const usedCells = new Set<string>()
  const picked: CellPosition[] = []
  const maxAttempts = boardCells.length * 4
  let attempts = 0

  while (picked.length < count && attempts < maxAttempts) {
    attempts += 1
    const cell = randomItem(boardCells)
    const key = gridKey(cell)
    if (usedCells.has(key)) continue
    usedCells.add(key)
    picked.push(cell)
  }

  return picked
}

function rollCount(min: number, max: number, cap: number): number {
  return Math.min(cap, min + Math.floor(Math.random() * (max - min + 1)))
}

// Special cells for a single grid: colors and shapes are rolled as two
// independent scatters over the board and merged by position — a cell
// can end up with just a color, just a shape, or (when both scatters
// happen to land on it) both. Entirely independent of objects: a cell
// may hold a special color/shape and an object, that's expected (only
// player *placement* avoids special cells, see use-game-world.tsx —
// object generation never does).
function generateGridSpecialCells(world: WorldState): SpecialCell[] {
  const boardCells = buildBoardCells(world)
  if (boardCells.length === 0) return []

  const cellsByKey = new Map<string, SpecialCell>()

  const colorCount = rollCount(COLOR_CELLS_PER_GRID_MIN, COLOR_CELLS_PER_GRID_MAX, boardCells.length)
  for (const position of scatterCells(boardCells, colorCount)) {
    cellsByKey.set(gridKey(position), { position, color: randomItem(CUBE_COLORS) })
  }

  const shapeCount = rollCount(SHAPE_CELLS_PER_GRID_MIN, SHAPE_CELLS_PER_GRID_MAX, boardCells.length)
  for (const position of scatterCells(boardCells, shapeCount)) {
    const key = gridKey(position)
    const existing = cellsByKey.get(key)
    if (existing) existing.shape = randomItem(CELL_SHAPES)
    else cellsByKey.set(key, { position, shape: randomItem(CELL_SHAPES) })
  }

  return Array.from(cellsByKey.values())
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
