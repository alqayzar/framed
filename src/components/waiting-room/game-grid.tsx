import * as React from 'react'
import { Star } from 'lucide-react'

import { type PlayersState } from '@/hooks/use-room-connection'
import {
  BOARD_CELLS,
  BOARD_RADIUS,
  BOARD_SIZE,
  type CellPosition,
  isAdjacent,
  isCellOccupiedByAnotherPlayer,
} from '@/lib/board'
import { CUBE_COLOR_CLASSES, type CubeColor } from '@/lib/cube-colors'
import { cn } from '@/lib/utils'

// Computed in JS (not via CSS aspect-square) so width and height are
// literally the same number: Safari on iOS can report unequal
// clientWidth/clientHeight for an "aspect-square" box, which throws off
// the per-row cellSize math and makes the cube drift further off-cell
// the further it moves from the top-left corner.
//
// Scaled so the rotated board's diagonal exceeds the viewport width: the
// square's empty corners (no cell sits there, see MIN_EDGE_HALF_WIDTH)
// bleed off the sides of the screen while every real cell stays visible.
const BOARD_BLEED_FACTOR = 1.3

function computeBoardSidePx(): number {
  if (typeof window === 'undefined') return 240
  return (window.innerWidth * BOARD_BLEED_FACTOR) / Math.SQRT2
}

interface GridCellProps {
  cell: CellPosition
  playerPosition: CellPosition,
  clickable: boolean
  onCellClick: (cell: CellPosition) => void
}

const GridCell = React.memo(function GridCell(props: GridCellProps) {
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
        props.clickable && 'cursor-pointer border-game-ink/20 hover:bg-game-ink/15',
        props.cell.x === props.playerPosition.x && props.cell.y === props.playerPosition.y && 'bg-game-yellow'
      )}
    />
  )
})

interface PlayerCubeProps {
  playerId: string
  position: CellPosition
  color: CubeColor
  jumpKey: number
  cellSize: number
  gapSize: number
  avatarUrl: string | null
  isHost: boolean
  onSelect: (playerId: string) => void
}

const PlayerCube = React.memo(function PlayerCube(props: PlayerCubeProps) {
  const clipId = React.useId()
  const colorClasses = CUBE_COLOR_CLASSES[props.color]

  function handleClick() {
    props.onSelect(props.playerId)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Voir la carte du joueur"
      className="absolute cursor-pointer transition-[left,top] duration-300 ease-out"
      style={{
        width: `${props.cellSize}px`,
        height: `${props.cellSize}px`,
        left: `${(props.position.x + BOARD_RADIUS) * (props.cellSize + props.gapSize) + props.cellSize * -0.1}px`,
        top: `${(props.position.y + BOARD_RADIUS) * (props.cellSize + props.gapSize) - props.cellSize * 0.08}px`,
      }}
    >
      <div className="size-full p-[0.25%] transition-transform duration-300 ease-out">
        <svg key={props.jumpKey} viewBox="0 0 100 100" className="cube-jump size-full">
          <defs>
            <clipPath id={clipId}>
              <rect x="2" y="2" width="84" height="84" rx="20" />
            </clipPath>
          </defs>
          <path
            d="M 2 22 A 20 20 0 0 1 22 2 L 66 2 A 20 20 0 0 1 80.14 7.86 L 92.14 19.86 A 20 20 0 0 1 98 34 L 98 78 A 20 20 0 0 1 78 98 L 34 98 A 20 20 0 0 1 19.86 92.14 L 7.86 80.14 A 20 20 0 0 1 2 66 Z"
            strokeWidth="6"
            strokeLinejoin="round"
            className={cn(colorClasses.darkFill, 'stroke-game-ink')}
          />
          <rect
            x="2"
            y="2"
            width="84"
            height="84"
            rx="20"
            strokeWidth="6"
            className={cn(colorClasses.fill, 'stroke-game-ink')}
          />
          {props.avatarUrl && (
            <g clipPath={`url(#${clipId})`}>
              <image
                href={props.avatarUrl}
                x={-16}
                y={-16}
                width={120}
                height={120}
                preserveAspectRatio="xMidYMid slice"
                transform="rotate(-45 44 44)"
              />
            </g>
          )}
        </svg>
      </div>
      {props.isHost && (
        <div
          className="absolute z-10 flex h-8 w-8 items-center justify-center"
          style={{ left: '-8px', top: '-9px' }}
        >
          <Star className="h-7 w-7 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-[1.8] stroke-game-ink" aria-hidden="true" />
        </div>
      )}
    </button>
  )
})

interface GameGridProps {
  players: PlayersState
  localPlayerId: string | null
  avatarUrls: Record<string, string>
  hostPlayerId: string | null
  onMove: (position: CellPosition) => void
  onSelectPlayer: (playerId: string) => void
}

function GameGrid(props: GameGridProps) {
  const [boardSide, setBoardSide] = React.useState(computeBoardSidePx)
  const [cellSize, setCellSize] = React.useState(0)
  const [gapSize, setGapSize] = React.useState(0)
  const [jumpKeys, setJumpKeys] = React.useState<Record<string, number>>({})
  const prevPositionsRef = React.useRef<Record<string, CellPosition>>({})
  const gridRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function updateBoardSide() {
      setBoardSide(computeBoardSidePx())
    }

    updateBoardSide()
    window.addEventListener('resize', updateBoardSide)
    window.visualViewport?.addEventListener('resize', updateBoardSide)

    return () => {
      window.removeEventListener('resize', updateBoardSide)
      window.visualViewport?.removeEventListener('resize', updateBoardSide)
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

  React.useEffect(() => {
    const prev = prevPositionsRef.current
    const changedIds: string[] = []
    for (const [playerId, player] of Object.entries(props.players)) {
      const prevPos = prev[playerId]
      if (prevPos && (prevPos.x !== player.position.x || prevPos.y !== player.position.y)) {
        changedIds.push(playerId)
      }
    }
    prevPositionsRef.current = Object.fromEntries(
      Object.entries(props.players).map(([id, player]) => [id, player.position])
    )
    if (changedIds.length > 0) {
      setJumpKeys((current) => {
        const next = { ...current }
        for (const id of changedIds) next[id] = (next[id] ?? 0) + 1
        return next
      })
    }
  }, [props.players])

  const localPlayer = props.localPlayerId ? props.players[props.localPlayerId] : undefined
  const boardCells = React.useMemo(() => BOARD_CELLS, [])
  const playerEntries = React.useMemo(() => Object.entries(props.players), [props.players])

  const handleCellClick = React.useCallback(
    (target: CellPosition) => {
      if (
        !localPlayer ||
        !isAdjacent(localPlayer.position, target) ||
        isCellOccupiedByAnotherPlayer(target, props.players, props.localPlayerId ?? undefined)
      ) {
        return
      }
      props.onMove(target)
    },
    [localPlayer, props.localPlayerId, props.players, props.onMove]
  )

  return (
    <div className="relative inline-block rotate-45">
        <span
          aria-hidden="true"
          className="absolute inset-0 translate-x-4 translate-y-4 rounded-4xl bg-game-ink"
        />
        <div
          className="relative rounded-4xl border-4 border-game-ink bg-white p-3"
          style={{ width: boardSide, height: boardSide }}
        >
          <div
            ref={gridRef}
            className="relative grid size-full gap-1"
            style={{
              gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            }}
          >
            {boardCells.map((cell) => (
              <GridCell
                key={`${cell.x}-${cell.y}`}
                cell={cell}
                playerPosition={localPlayer?.position ?? {x: -1, y: -1}}
                clickable={
                  !!localPlayer &&
                  isAdjacent(localPlayer.position, cell) &&
                  !isCellOccupiedByAnotherPlayer(cell, props.players, props.localPlayerId ?? undefined)
                }
                onCellClick={handleCellClick}
              />
            ))}

            {playerEntries.map(([playerId, player]) => (
              <PlayerCube
                key={playerId}
                playerId={playerId}
                position={player.position}
                color={player.color}
                jumpKey={jumpKeys[playerId] ?? 0}
                cellSize={cellSize}
                gapSize={gapSize}
                avatarUrl={props.avatarUrls[playerId] ?? null}
                isHost={playerId === props.hostPlayerId}
                onSelect={props.onSelectPlayer}
              />
            ))}
          </div>
        </div>
      </div>
  )
}

export { GameGrid }
