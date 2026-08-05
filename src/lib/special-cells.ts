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

// The special cell on a given grid's given position, if any. Note a
// returned cell may carry only a shape, only a color, or both (the two
// are independent scatters, see generateGridSpecialCells) — so a caller
// after a color must check .color rather than treat any hit as colored.
export function specialCellAt(
  cells: SpecialCellsState,
  grid: GridCoord,
  position: CellPosition
): SpecialCell | undefined {
  return (cells[gridKey(grid)] ?? []).find(
    (cell) => cell.position.x === position.x && cell.position.y === position.y
  )
}

// Behavior union rather than a TS `enum`, matching this codebase's
// existing convention for closed string sets (CubeColor, CellShape,
// ValueLifetime) — no `enum` keyword is used anywhere else here.
export type SpecialCellMoveBehavior = 'REPLACE' | 'BLOCK' | 'MERGE_CELL'

// Moves whatever's at `from` (in fromCells) to `to` (in toCells) —
// fromCells and toCells may be the very same array (a same-grid move) or
// two different ones (from crossed into a neighboring grid, see
// stepInDirection in world.ts). Returns both arrays back, updated — or,
// on a no-op (from is empty, or the move is blocked), the very same
// references passed in, so a caller can cheaply test
// `result.fromCells === fromCells && result.toCells === toCells` to
// detect nothing changed. `behavior` decides what happens when `to`
// already holds something:
//   - REPLACE: `to`'s existing color/shape are entirely overwritten by
//     `from`'s.
//   - BLOCK: if `to` holds anything at all (color and/or shape),
//     nothing moves.
//   - MERGE_CELL: color and shape move independently, but never in the
//     same call — color is tried first, and shape is only even
//     considered when color didn't move (because `from` has none, or
//     `to`'s color slot is already occupied). A cell holding both takes
//     two pushes to fully relocate: the first moves the color and
//     leaves the shape at `from`; a second push (from now holds only
//     the shape) moves it. (E.g. `from` has both, `to` has only a
//     color: color is blocked, so shape moves instead — still just the
//     one attribute.)
export function moveSpecialCell(
  fromCells: SpecialCell[],
  toCells: SpecialCell[],
  from: CellPosition,
  to: CellPosition,
  behavior: SpecialCellMoveBehavior
): { fromCells: SpecialCell[]; toCells: SpecialCell[] } {
  const sameArray = fromCells === toCells
  const fromCell = fromCells.find((cell) => cell.position.x === from.x && cell.position.y === from.y)
  if (!fromCell || (!fromCell.color && !fromCell.shape)) return { fromCells, toCells }
  const toCell = toCells.find((cell) => cell.position.x === to.x && cell.position.y === to.y)

  let nextFrom: SpecialCell | null
  let nextTo: SpecialCell

  if (behavior === 'BLOCK' && toCell) {
    return { fromCells, toCells }
  } else if (behavior === 'REPLACE' || behavior === 'BLOCK') {
    nextFrom = null
    nextTo = { position: to, color: fromCell.color, shape: fromCell.shape }
  } else {
    let fromColor = fromCell.color
    let toColor = toCell?.color
    let fromShape = fromCell.shape
    let toShape = toCell?.shape
    let moved = false

    if (fromCell.color && !toCell?.color) {
      toColor = fromCell.color
      fromColor = undefined
      moved = true
    } else if (fromCell.shape && !toCell?.shape) {
      toShape = fromCell.shape
      fromShape = undefined
      moved = true
    }

    if (!moved) return { fromCells, toCells }
    nextFrom = fromColor || fromShape ? { position: from, color: fromColor, shape: fromShape } : null
    nextTo = { position: to, color: toColor, shape: toShape }
  }

  if (sameArray) {
    const merged = [
      ...fromCells.filter(
        (cell) =>
          !(cell.position.x === from.x && cell.position.y === from.y) &&
          !(cell.position.x === to.x && cell.position.y === to.y)
      ),
      ...(nextFrom ? [nextFrom] : []),
      nextTo,
    ]
    return { fromCells: merged, toCells: merged }
  }

  return {
    fromCells: [
      ...fromCells.filter((cell) => !(cell.position.x === from.x && cell.position.y === from.y)),
      ...(nextFrom ? [nextFrom] : []),
    ],
    toCells: [...toCells.filter((cell) => !(cell.position.x === to.x && cell.position.y === to.y)), nextTo],
  }
}

// CSS color-mix() so SPECIAL_CELL_OPACITY is a real runtime number, not
// a Tailwind-JIT-time literal (a dynamic opacity can't be expressed as a
// static Tailwind class).
export function specialCellBackground(color: CubeColor): string {
  return `color-mix(in srgb, ${CUBE_COLOR_PALETTE[color].bg} ${SPECIAL_CELL_OPACITY * 100}%, transparent)`
}
