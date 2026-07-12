export const BOARD_RADIUS = 2
// Ensures the diamond's tips are at least 2 * MIN_EDGE_HALF_WIDTH + 1 cells wide
// instead of tapering down to a single cell.
export const MIN_EDGE_HALF_WIDTH = 1
export const BOARD_SIZE = BOARD_RADIUS * 2 + 1

export interface CellPosition {
  x: number
  y: number
}

export function isOnBoard(cell: CellPosition): boolean {
  return Math.abs(cell.x) + Math.abs(cell.y) <= BOARD_RADIUS + MIN_EDGE_HALF_WIDTH
}

export function isAdjacent(a: CellPosition, b: CellPosition): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

export function isCellOccupiedByAnotherPlayer<T extends { position: CellPosition }>(
  target: CellPosition,
  players: Record<string, T>,
  currentPlayerId?: string
): boolean {
  return Object.entries(players).some(([playerId, player]) => {
    if (currentPlayerId && playerId === currentPlayerId) return false
    return player.position.x === target.x && player.position.y === target.y
  })
}

function buildBoardCells(): CellPosition[] {
  const cells: CellPosition[] = []
  for (let y = -BOARD_RADIUS; y <= BOARD_RADIUS; y++) {
    for (let x = -BOARD_RADIUS; x <= BOARD_RADIUS; x++) {
      const cell = { x, y }
      if (isOnBoard(cell)) cells.push(cell)
    }
  }
  return cells
}

export const BOARD_CELLS = buildBoardCells()

export function randomBoardCell(): CellPosition {
  return BOARD_CELLS[Math.floor(Math.random() * BOARD_CELLS.length)]
}

export function randomFreeBoardCell<T extends { position: CellPosition }>(
  players: Record<string, T>
): CellPosition {
  const freeCells = BOARD_CELLS.filter(
    (cell) => !isCellOccupiedByAnotherPlayer(cell, players)
  )
  const pool = freeCells.length > 0 ? freeCells : BOARD_CELLS
  return pool[Math.floor(Math.random() * pool.length)]
}
