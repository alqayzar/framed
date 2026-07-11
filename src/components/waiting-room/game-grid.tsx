import * as React from 'react'

import { useAvatarUrl } from '@/hooks/use-avatar-url'
import { cn } from '@/lib/utils'

const BOARD_RADIUS = 2
// Ensures the diamond's tips are at least 2 * MIN_EDGE_HALF_WIDTH + 1 cells wide
// instead of tapering down to a single cell.
const MIN_EDGE_HALF_WIDTH = 1
const BOARD_SIZE = BOARD_RADIUS * 2 + 1

// Reserve for the header (room code/leave button) and the surrounding
// padding above and below the board, so the diamond's top/bottom tips
// always stay within the viewport.
const HEADER_RESERVE_PX = 256
const MIN_BOARD_SIZE_PX = 160
const MAX_BOARD_SIZE_PX = 416

function computeBoardSidePx(viewportHeight: number): number {
  const diagonalBudget = viewportHeight - HEADER_RESERVE_PX
  const side = diagonalBudget / Math.SQRT2
  return Math.min(Math.max(side, MIN_BOARD_SIZE_PX), MAX_BOARD_SIZE_PX)
}

interface CellPosition {
  x: number
  y: number
}

function isOnBoard(cell: CellPosition): boolean {
  return Math.abs(cell.x) + Math.abs(cell.y) <= BOARD_RADIUS + MIN_EDGE_HALF_WIDTH
}

function isAdjacent(a: CellPosition, b: CellPosition): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
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

const BOARD_CELLS = buildBoardCells()

function randomBoardCell(): CellPosition {
  return BOARD_CELLS[Math.floor(Math.random() * BOARD_CELLS.length)]
}

interface GridCellProps {
  cell: CellPosition
  clickable: boolean
  onCellClick: (cell: CellPosition) => void
}

function GridCell(props: GridCellProps) {
  function handleClick() {
    props.onCellClick(props.cell)
  }

  return (
    <button
      type="button"
      disabled={!props.clickable}
      onClick={handleClick}
      aria-label={`Case ${props.cell.x},${props.cell.y}`}
      style={{
        gridColumn: props.cell.x + BOARD_RADIUS + 1,
        gridRow: props.cell.y + BOARD_RADIUS + 1,
      }}
      className={cn(
        'rounded-md border border-transparent bg-game-ink/6 transition-colors',
        props.clickable && 'cursor-pointer border-game-ink/20 hover:bg-game-ink/15'
      )}
    />
  )
}

function GameGrid() {
  const [cube, setCube] = React.useState<CellPosition>(randomBoardCell)
  const [jumpKey, setJumpKey] = React.useState(0)
  const [cellSize, setCellSize] = React.useState(0)
  const [gapSize, setGapSize] = React.useState(0)
  const [boardSize, setBoardSize] = React.useState(() =>
    computeBoardSidePx(typeof window === 'undefined' ? 800 : window.innerHeight)
  )
  const gridRef = React.useRef<HTMLDivElement>(null)
  const avatarUrl = useAvatarUrl()
  const clipId = React.useId()

  React.useEffect(() => {
    function updateBoardSize() {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      setBoardSize(computeBoardSidePx(viewportHeight))
    }

    updateBoardSize()

    window.visualViewport?.addEventListener('resize', updateBoardSize)
    window.addEventListener('resize', updateBoardSize)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateBoardSize)
      window.removeEventListener('resize', updateBoardSize)
    }
  }, [])

  React.useEffect(() => {
    const gridElement = gridRef.current
    if (!gridElement) return

    const updateMetrics = () => {
      const style = window.getComputedStyle(gridElement)
      const columnGap = Number.parseFloat(style.columnGap || '0')
      const rowGap = Number.parseFloat(style.rowGap || '0')
      const gap = Math.max(columnGap, rowGap)
      const availableSize = Math.min(gridElement.clientWidth, gridElement.clientHeight)
      const cell = (availableSize - gap * (BOARD_SIZE - 1)) / BOARD_SIZE

      setCellSize(cell)
      setGapSize(gap)
    }

    updateMetrics()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(gridElement)

    return () => observer.disconnect()
  }, [])

  const handleCellClick = React.useCallback((target: CellPosition) => {
    setCube((current) => {
      if (!isAdjacent(current, target)) return current
      setJumpKey((key) => key + 1)
      return target
    })
  }, [])

  return (
    <div className="relative inline-block rotate-45">
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-2 translate-y-2 rounded-4xl bg-game-ink"
      />
      <div
        className="relative rounded-4xl border-4 border-game-ink bg-white p-3"
        style={{ width: boardSize, height: boardSize }}
      >
        <div
          ref={gridRef}
          className="relative grid size-full gap-1"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {BOARD_CELLS.map((cell) => (
            <GridCell
              key={`${cell.x}-${cell.y}`}
              cell={cell}
              clickable={isAdjacent(cube, cell)}
              onCellClick={handleCellClick}
            />
          ))}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute transition-[left,top] duration-300 ease-out"
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              left: `${(cube.x + BOARD_RADIUS) * (cellSize + gapSize) + cellSize * -0.1}px`,
              top: `${(cube.y + BOARD_RADIUS) * (cellSize + gapSize) - cellSize * 0.08}px`,
            }}
          >
            <div className="size-full p-[0.25%] transition-transform duration-300 ease-out">
              <svg key={jumpKey} viewBox="0 0 100 100" className="cube-jump size-full">
                <defs>
                  <clipPath id={clipId}>
                    <rect x="2" y="2" width="84" height="84" rx="20" />
                  </clipPath>
                </defs>
                <path
                  d="M 2 22 A 20 20 0 0 1 22 2 L 66 2 A 20 20 0 0 1 80.14 7.86 L 92.14 19.86 A 20 20 0 0 1 98 34 L 98 78 A 20 20 0 0 1 78 98 L 34 98 A 20 20 0 0 1 19.86 92.14 L 7.86 80.14 A 20 20 0 0 1 2 66 Z"
                  strokeWidth="6"
                  strokeLinejoin="round"
                  className="fill-game-red-dark stroke-game-ink"
                />
                <rect
                  x="2"
                  y="2"
                  width="84"
                  height="84"
                  rx="20"
                  strokeWidth="6"
                  className="fill-game-red stroke-game-ink"
                />
                {avatarUrl && (
                  <g clipPath={`url(#${clipId})`}>
                    <image
                      href={avatarUrl}
                      x={-16}
                      y={-16}
                      width={120}
                      height={120}
                      preserveAspectRatio="xMidYMid slice"
                      transform="rotate(-45 44 44)"
                    />
                  </g>
                )}
                {/* <line
                  x1="80.14"
                  y1="80.14"
                  x2="92.14"
                  y2="92.14"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="stroke-game-ink"
                /> */}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { GameGrid }
