import { CUBE_COLORS, CUBE_COLOR_PALETTE, type CubeColor } from '@/lib/cube-colors'

// Every function in this file that needs to know the shape of the world
// (how big a single grid's board is, how far its diamond mask reaches,
// how many grids make up the world) takes one of these instead of three
// loose numbers — world generation, world control (grid/board math) and
// collision checking all read from the same shape.
export interface WorldState {
  boardSize: number
  boardRadius: number
  worldSize: number
  // Opaque caller-supplied id, set only via ctx.createGrid's third
  // argument (see ObjectActionInvocationContext.createGrid in
  // game-objects.ts) — conventionally the id of the object that owns
  // this arbitrary grid. When set, game-grid.tsx routes the grid's
  // border triangles to that object's indicator-top/right/bottom/left
  // actions (see GameGrid's neighborMarkers) instead of ordinary
  // grid-to-grid navigation. Undefined for every in-matrix WorldState
  // (the shared matrix, wait room, sandbox) — nothing to own them.
  state?: string
}

export const WAIT_ROOM_WORLD: WorldState = {
  boardSize: 1000,
  boardRadius: 998,
  worldSize: 1,
}

export type GameMode = 'framed' | 'sandbox'

// A big, mostly-full board (see applyGameMode) — kept as named
// constants rather than inline in the override so they're easy to
// find/tune.
export const SANDBOX_BOARD_SIZE = 100
export const SANDBOX_BOARD_RADIUS = 98

// Sandbox mode is a much bigger board, and always exactly one grid
// (no neighboring grids to wander into).
export function applyGameMode(world: WorldState, mode: GameMode): WorldState {
  if (mode === 'sandbox') {
    return { ...world, boardSize: SANDBOX_BOARD_SIZE, boardRadius: SANDBOX_BOARD_RADIUS, worldSize: 1 }
  }
  return world
}

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

// Sentinel grid-x for a grid outside the worldSize x worldSize matrix
// entirely — created on demand (see ctx.createGrid in use-game-world.tsx),
// sized independently, never reachable via ordinary adjacency:
// isGridInWorld/stepInDirection already reject any matrix-neighbor
// offset of one of these (999 ± 1 is nowhere near 0..worldSize for any
// worldSize this codebase actually uses), so nothing about grid-crossing
// or neighbor-marker code needs to special-case it — a grid is simply
// addressed as {x: ARBITRARY_GRID_X, y: <id>}, the same GridCoord shape
// as any other grid.
export const ARBITRARY_GRID_X = 999

export function isArbitraryGrid(grid: GridCoord): boolean {
  return grid.x === ARBITRARY_GRID_X
}

export function isGridInWorld(grid: GridCoord, world: WorldState): boolean {
  return grid.x >= 0 && grid.x < world.worldSize && grid.y >= 0 && grid.y < world.worldSize
}

// The middle grid of the world matrix — where players spawn. For an even
// worldSize there's no single center cell, so this rounds down (e.g.
// worldSize 4 -> index 2 of 0..3).
export function centerGridCoord(world: WorldState): GridCoord {
  const center = Math.floor(world.worldSize / 2)
  return { x: center, y: center }
}

export type GridColors = Record<string, CubeColor>

export function gridKey(grid: GridCoord): string {
  return `${grid.x},${grid.y}`
}

// Randomly assigns every grid of the world a cube color, so grids and
// cubes share one game palette. Generated once by the host at the start
// of a game (see room-store.ts), not derived from coordinates, so the
// layout differs from one game to the next. No two touching grids —
// orthogonal or diagonal — ever share a color.
//
// Processed in row-major order, excluding the 4 already-assigned
// neighbors (west, north, north-west, north-east) from the random pick.
// That's enough to cover all 8 neighbor directions: a pair of touching
// grids always gets checked once, when the later-processed one of the
// two is assigned — e.g. a grid's south-east neighbor isn't excluded
// when the grid itself is placed, but the grid *is* excluded as that
// neighbor's own north-west when its turn comes later.
export function generateGridColors(world: WorldState): GridColors {
  const colors: GridColors = {}
  for (let y = 0; y < world.worldSize; y++) {
    for (let x = 0; x < world.worldSize; x++) {
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
export function isCellVisible(cell: CellPosition, world: WorldState): boolean {
  const center = (world.boardSize - 1) / 2
  return Math.abs(cell.x - center) + Math.abs(cell.y - center) <= world.boardRadius
}

// The smallest and largest row/column index actually reached on the
// board (identical for rows and columns since the board is square).
// Shared by boardEdgeDirections and gridEntryPosition so both agree on
// where the board's edges sit — also exported for game-grid.tsx, which
// needs the same true-edge indices to position the neighbor-grid
// triangles at the real board edge instead of a fixed screen offset.
export function boardEdgeRange(world: WorldState): { minIndex: number; maxIndex: number } {
  const center = (world.boardSize - 1) / 2
  return {
    minIndex: Math.max(0, Math.ceil(center - world.boardRadius)),
    maxIndex: Math.min(world.boardSize - 1, Math.floor(center + world.boardRadius)),
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
export function boardEdgeDirections(cell: CellPosition, world: WorldState): GridCoord[] {
  const { minIndex, maxIndex } = boardEdgeRange(world)
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
  world: WorldState
): CellPosition {
  const { minIndex, maxIndex } = boardEdgeRange(world)
  if (direction.y === -1) return { x: exitPosition.x, y: maxIndex }
  if (direction.y === 1) return { x: exitPosition.x, y: minIndex }
  if (direction.x === 1) return { x: minIndex, y: exitPosition.y }
  return { x: maxIndex, y: exitPosition.y }
}

export function isAdjacent(a: CellPosition, b: CellPosition): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

export interface GridStep {
  grid: GridCoord
  position: CellPosition
}

// Steps one cell from `position` on `grid` in `direction`. When that
// crosses a board edge the cell actually borders, lands on the
// neighboring grid's mirrored entry point instead (see
// gridEntryPosition) — same reasoning as a player's own grid crossing,
// or a pushed object's (pushObjectIfPresent in use-game-world.tsx uses
// the same boardEdgeDirections/gridEntryPosition/isGridInWorld trio,
// inline, alongside occupancy checks this — occupancy-agnostic — helper
// doesn't need). Returns null when there's nowhere to go: off the
// world's edge entirely (no neighboring grid), i.e. a wall.
export function stepInDirection(
  grid: GridCoord,
  position: CellPosition,
  direction: GridCoord,
  world: WorldState
): GridStep | null {
  const crossesToNeighborGrid = boardEdgeDirections(position, world).some(
    (edge) => edge.x === direction.x && edge.y === direction.y
  )
  if (crossesToNeighborGrid) {
    const destGrid: GridCoord = { x: grid.x + direction.x, y: grid.y + direction.y }
    if (!isGridInWorld(destGrid, world)) return null
    return { grid: destGrid, position: gridEntryPosition(position, direction, world) }
  }
  const candidate: CellPosition = { x: position.x + direction.x, y: position.y + direction.y }
  if (!isCellVisible(candidate, world)) return null
  return { grid, position: candidate }
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

export function buildBoardCells(world: WorldState): CellPosition[] {
  const cells: CellPosition[] = []
  for (let y = 0; y < world.boardSize; y++) {
    for (let x = 0; x < world.boardSize; x++) {
      const cell = { x, y }
      if (isCellVisible(cell, world)) cells.push(cell)
    }
  }
  return cells
}

// Same idea as buildBoardCells, but only the cells within `radius` of
// `center` (Chebyshev distance) — for capping how many cells a caller
// actually turns into DOM nodes (see GameGrid's maxVisibleCells prop)
// on a huge board, without ever iterating the full boardSize x boardSize
// square to get there.
export function buildBoardCellsAround(center: CellPosition, radius: number, world: WorldState): CellPosition[] {
  const cells: CellPosition[] = []
  const minX = Math.max(0, center.x - radius)
  const maxX = Math.min(world.boardSize - 1, center.x + radius)
  const minY = Math.max(0, center.y - radius)
  const maxY = Math.min(world.boardSize - 1, center.y + radius)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cell = { x, y }
      if (isCellVisible(cell, world)) cells.push(cell)
    }
  }
  return cells
}

// occupiedCells lets a caller also rule out cells taken by something that
// isn't a player — namely objects (see GridObject in game-objects.ts): a
// player appearing on the board (initial spawn, reconnect, game start)
// should never appear on top of one. Movement is unaffected — walking
// onto an object's cell is allowed and pushes it instead (see
// pushObjectIfPresent in use-game-world.tsx).
// A random free cell near `center`, searched outward: the (2*radius+1)
// square around it (radius 2 = the 5x5 area) first, widening a ring at a
// time until something is free. Used to drop a player next to another
// one without landing on top of anybody — see teleportPlayerToPlayer in
// use-game-world.tsx.
//
// Same occupiedCells convention as randomFreeBoardCell below: objects
// aren't known here, so a caller that wants them to block passes their
// cells in. Teleporting does want that — nothing pushes the object out
// of the way the way a real move would (see pushObjectIfPresent), so
// landing on one would leave a player and an object sharing a cell,
// which no other code path produces.
//
// currentPlayerId is excluded from the occupancy check, so the caller's
// own current cell counts as free. Null only when the entire board is
// taken, which callers treat as "do nothing".
export function randomFreeCellNear<T extends { position: CellPosition; gridX: number; gridY: number }>(
  center: CellPosition,
  players: Record<string, T>,
  grid: GridCoord,
  world: WorldState,
  occupiedCells: CellPosition[] = [],
  currentPlayerId?: string,
  startRadius = 2
): CellPosition | null {
  // boardSize is the widest any ring needs to get: from any cell in the
  // board, that reach already covers every other cell.
  for (let radius = startRadius; radius <= world.boardSize; radius++) {
    const freeCells = buildBoardCellsAround(center, radius, world).filter(
      (cell) =>
        !isCellOccupiedByAnotherPlayer(cell, grid, players, currentPlayerId) &&
        !occupiedCells.some((occupied) => occupied.x === cell.x && occupied.y === cell.y)
    )
    if (freeCells.length > 0) return freeCells[Math.floor(Math.random() * freeCells.length)]
  }
  return null
}

export function randomFreeBoardCell<T extends { position: CellPosition; gridX: number; gridY: number }>(
  players: Record<string, T>,
  grid: GridCoord,
  world: WorldState,
  occupiedCells: CellPosition[] = []
): CellPosition {
  const boardCells = buildBoardCells(world)
  const freeCells = boardCells.filter(
    (cell) =>
      !isCellOccupiedByAnotherPlayer(cell, grid, players) &&
      !occupiedCells.some((occupied) => occupied.x === cell.x && occupied.y === cell.y)
  )
  const pool = freeCells.length > 0 ? freeCells : boardCells
  return pool[Math.floor(Math.random() * pool.length)]
}
