import { CUBE_COLORS, CUBE_COLOR_PALETTE, type CubeColor } from '@/lib/cube-colors'

export interface CellPosition {
  x: number
  y: number
}

// The world is a worldSize x worldSize matrix of identical grids; only
// one grid is displayed at a time. Grid coordinates use the same screen
// convention as cells: x grows eastward, y grows southward, so the
// north neighbor of (gx, gy) is (gx, gy - 1).
export interface GridCoord {
  x: number
  y: number
}

export function isGridInWorld(grid: GridCoord, worldSize: number): boolean {
  return grid.x >= 0 && grid.x < worldSize && grid.y >= 0 && grid.y < worldSize
}

// The middle grid of the world matrix — where players spawn. For an even
// worldSize there's no single center cell, so this rounds down (e.g.
// worldSize 4 -> index 2 of 0..3).
export function centerGridCoord(worldSize: number): GridCoord {
  const center = Math.floor(worldSize / 2)
  return { x: center, y: center }
}

export type GridColors = Record<string, CubeColor>

export function gridKey(grid: GridCoord): string {
  return `${grid.x},${grid.y}`
}

// Randomly assigns every grid of a worldSize x worldSize world a cube
// color, so grids and cubes share one game palette. Generated once by
// the host at the start of a game (see room-store.ts), not derived from
// coordinates, so the layout differs from one game to the next. No two
// touching grids — orthogonal or diagonal — ever share a color.
//
// Processed in row-major order, excluding the 4 already-assigned
// neighbors (west, north, north-west, north-east) from the random pick.
// That's enough to cover all 8 neighbor directions: a pair of touching
// grids always gets checked once, when the later-processed one of the
// two is assigned — e.g. a grid's south-east neighbor isn't excluded
// when the grid itself is placed, but the grid *is* excluded as that
// neighbor's own north-west when its turn comes later.
export function generateGridColors(worldSize: number): GridColors {
  const colors: GridColors = {}
  for (let y = 0; y < worldSize; y++) {
    for (let x = 0; x < worldSize; x++) {
      const excluded = new Set<CubeColor>()
      for (const neighbor of [
        { x: x - 1, y },
        { x: x - 2, y },
        { x, y: y - 1 },
        { x, y: y - 2 },
        { x: x - 1, y: y - 1 },
        { x: x + 1, y: y - 1 },
      ]) {
        const color = colors[gridKey(neighbor)]
        if (color) excluded.add(color)
      }
      const available = CUBE_COLORS.filter((color) => !excluded.has(color))
      const pool = available.length > 0 ? available : CUBE_COLORS
      colors[gridKey({ x, y })] = pool[Math.floor(Math.random() * pool.length)]
    }
  }
  return colors
}

// Looks up a grid's assigned color (see generateGridColors) as a raw CSS
// value. Falls back to the first palette color for a grid missing from
// the map (shouldn't normally happen once the host has generated one).
export function gridColor(grid: GridCoord, colors: GridColors): string {
  const color = colors[gridKey(grid)] ?? CUBE_COLORS[0]
  return CUBE_COLOR_PALETTE[color].bg
}

// A cell is visible when its Manhattan distance to the grid's geometric
// center is at most boardRadius; the others are masked, which carves a
// diamond out of the boardSize x boardSize square. The center is
// (boardSize - 1) / 2 — fractional for even sizes (between four cells) —
// so the diamond stays symmetric whatever the parity of boardSize.
export function isCellVisible(
  cell: CellPosition,
  boardSize: number,
  boardRadius: number
): boolean {
  const center = (boardSize - 1) / 2
  return Math.abs(cell.x - center) + Math.abs(cell.y - center) <= boardRadius
}

// The smallest and largest row/column index actually reached on the
// board (identical for rows and columns since the board is square).
// Shared by boardEdgeDirections and gridEntryPosition so both agree on
// where the board's edges sit.
function boardEdgeRange(boardSize: number, boardRadius: number): { minIndex: number; maxIndex: number } {
  const center = (boardSize - 1) / 2
  return {
    minIndex: Math.max(0, Math.ceil(center - boardRadius)),
    maxIndex: Math.min(boardSize - 1, Math.floor(center + boardRadius)),
  }
}

// The world-grid direction(s) a board edge cell borders. Whole rows/
// columns border an edge, not just individual cells' immediate
// neighbors: a cell is on the north edge when its y is the smallest row
// index reached anywhere on the board (not when its specific north
// neighbor happens to be off-board), and likewise for the other three.
// A cell can border two edges at once (e.g. both north and west) only
// where those extremes coincide — which the diamond mask always clips
// away, so in practice this stays a single direction.
export function boardEdgeDirections(
  cell: CellPosition,
  boardSize: number,
  boardRadius: number
): GridCoord[] {
  const { minIndex, maxIndex } = boardEdgeRange(boardSize, boardRadius)
  const directions: GridCoord[] = []
  if (cell.y === minIndex) directions.push({ x: 0, y: -1 })
  if (cell.x === maxIndex) directions.push({ x: 1, y: 0 })
  if (cell.y === maxIndex) directions.push({ x: 0, y: 1 })
  if (cell.x === minIndex) directions.push({ x: -1, y: 0 })
  return directions
}

// Where a player naturally reappears on the neighboring grid after
// crossing the border in the given direction: the mirrored entry point
// on the opposite edge, preserving the coordinate along that edge (e.g.
// leaving north at column x arrives from the south at the same column
// x), so the crossing feels continuous.
export function gridEntryPosition(
  exitPosition: CellPosition,
  direction: GridCoord,
  boardSize: number,
  boardRadius: number
): CellPosition {
  const { minIndex, maxIndex } = boardEdgeRange(boardSize, boardRadius)
  if (direction.y === -1) return { x: exitPosition.x, y: maxIndex }
  if (direction.y === 1) return { x: exitPosition.x, y: minIndex }
  if (direction.x === 1) return { x: minIndex, y: exitPosition.y }
  return { x: maxIndex, y: exitPosition.y }
}

export function isAdjacent(a: CellPosition, b: CellPosition): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

// Players are scattered across the whole world, but a cell coordinate is
// only meaningful within a single grid — the same (x, y) exists on every
// grid. So a cell only counts as occupied by a player who's both on the
// given grid and at that position; someone standing on the same cell
// coordinates on a different grid must not block it.
export function isCellOccupiedByAnotherPlayer<T extends { position: CellPosition; gridX: number; gridY: number }>(
  target: CellPosition,
  grid: GridCoord,
  players: Record<string, T>,
  currentPlayerId?: string
): boolean {
  return Object.entries(players).some(([playerId, player]) => {
    if (currentPlayerId && playerId === currentPlayerId) return false
    return (
      player.gridX === grid.x &&
      player.gridY === grid.y &&
      player.position.x === target.x &&
      player.position.y === target.y
    )
  })
}

export function buildBoardCells(boardSize: number, boardRadius: number): CellPosition[] {
  const cells: CellPosition[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const cell = { x, y }
      if (isCellVisible(cell, boardSize, boardRadius)) cells.push(cell)
    }
  }
  return cells
}

export function randomFreeBoardCell<T extends { position: CellPosition; gridX: number; gridY: number }>(
  players: Record<string, T>,
  grid: GridCoord,
  boardSize: number,
  boardRadius: number
): CellPosition {
  const boardCells = buildBoardCells(boardSize, boardRadius)
  const freeCells = boardCells.filter(
    (cell) => !isCellOccupiedByAnotherPlayer(cell, grid, players)
  )
  const pool = freeCells.length > 0 ? freeCells : boardCells
  return pool[Math.floor(Math.random() * pool.length)]
}
