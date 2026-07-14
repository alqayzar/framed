export interface CellPosition {
  x: number
  y: number
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

export function randomFreeBoardCell<T extends { position: CellPosition }>(
  players: Record<string, T>,
  boardSize: number,
  boardRadius: number
): CellPosition {
  const boardCells = buildBoardCells(boardSize, boardRadius)
  const freeCells = boardCells.filter(
    (cell) => !isCellOccupiedByAnotherPlayer(cell, players)
  )
  const pool = freeCells.length > 0 ? freeCells : boardCells
  return pool[Math.floor(Math.random() * pool.length)]
}
