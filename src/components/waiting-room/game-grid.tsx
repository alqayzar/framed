import * as React from 'react'
import { Star } from 'lucide-react'

import { type PlayersState } from '@/hooks/use-game-world'
import { CUBE_COLOR_CLASSES, type CubeColor } from '@/lib/cube-colors'
import { getObjectIconUrl, type GridObject } from '@/lib/game-objects'
import { cn } from '@/lib/utils'
import {
  boardEdgeDirections,
  buildBoardCells,
  type CellPosition,
  type GridColors,
  type GridCoord,
  gridColor,
  isAdjacent,
  isCellOccupiedByAnotherPlayer,
  isGridInWorld,
  type WorldState,
} from '@/lib/world'

// Computed in JS (not via CSS aspect-square) so width and height are
// literally the same number: Safari on iOS can report unequal
// clientWidth/clientHeight for an "aspect-square" box, which throws off
// the per-row cellSize math and makes the cube drift further off-cell
// the further it moves from the top-left corner.
//
// Scaled so the rotated board's diagonal exceeds the viewport width: the
// square's corners (masked cells outside the diamond, see isCellVisible)
// bleed off the sides of the screen while every visible cell stays on it.
const BOARD_BLEED_FACTOR = 1.3

// How long an object that just got pushed off this grid keeps sliding
// past the board edge before it's dropped from render — matches the
// duration-300 transition on GridObjectBadge so the timeout fires right
// as the slide finishes.
const OBJECT_EXIT_DURATION_MS = 300

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
        gridColumn: props.cell.x + 1,
        gridRow: props.cell.y + 1,
      }}
      className={cn(
        'rounded-md border border-transparent bg-game-ink/5 transition-colors',
        props.clickable && 'cursor-pointer bg-game-ink/12',
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
        left: `${props.position.x * (props.cellSize + props.gapSize) + props.cellSize * -0.1}px`,
        top: `${props.position.y * (props.cellSize + props.gapSize) - props.cellSize * 0.08}px`,
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
  world: WorldState
  gridColors: GridColors
  gridObjects: GridObject[]
  onMove: (position: CellPosition) => void
  onMoveToGrid: (direction: GridCoord) => void
  onSelectPlayer: (playerId: string) => void
}

interface GridObjectBadgeProps {
  object: GridObject
  jumpKey: number
  cellSize: number
  gapSize: number
}

const GridObjectBadge = React.memo(function GridObjectBadge(props: GridObjectBadgeProps) {
  const badgeSize = props.cellSize * 0.7
  const cellLeft = props.object.position.x * (props.cellSize + props.gapSize)
  const cellTop = props.object.position.y * (props.cellSize + props.gapSize)

  return (
    <div
      // Purely decorative: never intercepts clicks meant for the cell
      // button underneath (moving onto an occupied cell is allowed).
      // Same slide animation as PlayerCube when pushed to a new cell;
      // since the badge is keyed by the object's stable id (see the
      // .map() below), React keeps this node across the position change
      // instead of remounting it, so the transition actually plays.
      className="pointer-events-none absolute flex items-center justify-center transition-[left,top] duration-300 ease-out"
      style={{
        width: badgeSize,
        height: badgeSize,
        left: cellLeft + (props.cellSize - badgeSize) / 2,
        top: cellTop + (props.cellSize - badgeSize) / 2,
      }}
    >
      {/* Same squash-and-hop as PlayerCube's cube-jump (see index.css),
          replayed by remounting on every push via the key. A separate
          element from the icon below so the animation's own transform
          doesn't clobber the icon's static counter-rotation. */}
      <div key={props.jumpKey} className="cube-jump size-full">
        <img
          src={getObjectIconUrl(props.object.type)}
          alt=""
          // Counter-rotates the board's own rotate-45 (see the outer div in
          // GameGrid's return) so the icon reads upright, same idea as the
          // avatar's rotate(-45) inside PlayerCube's svg.
          className="size-full -rotate-45 object-contain"
        />
      </div>
    </div>
  )
})
// Small triangular markers centered on each side of the board, apex
// pointing outward, previewing the identifying color of the neighboring
// grid in that direction. Sides without a neighbor (world edge) show
// nothing. Positioned just outside the border (offset by exactly the
// marker's own size) so they read as pointers, not part of the board.
// All four share one apex-up triangle, rotated per side instead of
// redrawn. Corners are rounded by curving through each vertex (Q) rather
// than meeting at a sharp point, cut back along each edge by a fixed
// distance from the vertex.
const NEIGHBOR_TRIANGLE_PATH =
  'M 42.3,18.1 L 9.7,78 Q 2,92 18,92 L 82,92 Q 98,92 90.3,78 L 57.7,18.1 Q 50,4 42.3,18.1 Z'
// disabledClassName applies when the local player isn't standing on one
// of the edge cells for that side (see isOnGridEdge); enabledClassName
// applies when they are. Both hold the same value for now — no visual
// distinction yet, this just wires up the enabled/disabled state ahead
// of styling it.
const NEIGHBOR_GRID_MARKERS: {
  offset: { x: number; y: number }
  disabledClassName: string
  enabledClassName: string
}[] = [
  {
    offset: { x: 0, y: -1 },
    disabledClassName: '-top-12 left-1/2 -translate-x-1/2',
    enabledClassName: '-top-15 left-1/2 -translate-x-1/2',
  },
  {
    offset: { x: 1, y: 0 },
    disabledClassName: '-right-12 top-1/2 -translate-y-1/2 rotate-90',
    enabledClassName: '-right-15 top-1/2 -translate-y-1/2 rotate-90',
  },
  {
    offset: { x: 0, y: 1 },
    disabledClassName: '-bottom-12 left-1/2 -translate-x-1/2 rotate-180',
    enabledClassName: '-bottom-15 left-1/2 -translate-x-1/2 rotate-180',
  },
  {
    offset: { x: -1, y: 0 },
    disabledClassName: '-left-12 top-1/2 -translate-y-1/2 -rotate-90',
    enabledClassName: '-left-15 top-1/2 -translate-y-1/2 -rotate-90',
  },
]

interface NeighborGridMarkerProps {
  color: string
  className: string
  enabled: boolean
  onClick: () => void
}

const NeighborGridMarker = React.memo(function NeighborGridMarker(props: NeighborGridMarkerProps) {
  return (
    <button
      type="button"
      disabled={!props.enabled}
      onClick={props.onClick}
      aria-label="Grille voisine"
      className={cn(
        // z-10: now a sibling of the card (see the comment where it's
        // rendered), not a child of it, so without an explicit z-index
        // it would paint behind the card wherever they geometrically
        // overlap near the shared edge — this keeps it on top.
        'absolute z-10 size-11 cursor-pointer transition-[top,right,bottom,left,transform] duration-300 ease-out hover:scale-110',
        props.className
      )}
    >
      <svg viewBox="0 0 100 100" className="size-full overflow-visible">
        <path
          d={NEIGHBOR_TRIANGLE_PATH}
          fill={props.color}
          stroke="var(--color-game-ink)"
          strokeWidth={8}
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
})

function GameGrid(props: GameGridProps) {
  const [boardSide, setBoardSide] = React.useState(computeBoardSidePx)
  const [cellSize, setCellSize] = React.useState(0)
  const [gapSize, setGapSize] = React.useState(0)
  const [jumpKeys, setJumpKeys] = React.useState<Record<string, number>>({})
  const [objectJumpKeys, setObjectJumpKeys] = React.useState<Record<string, number>>({})
  // Objects that just left this grid (pushed into a neighbor — see
  // pushObjectIfPresent in use-game-world.tsx): kept rendered a moment
  // longer, past the board edge they crossed, purely so they visibly
  // slide off instead of popping out of existence. The underlying data
  // already moved them instantly; this is decoration only.
  const [exitingObjects, setExitingObjects] = React.useState<Record<string, GridObject>>({})
  const prevPositionsRef = React.useRef<Record<string, CellPosition>>({})
  const prevObjectsRef = React.useRef<Record<string, GridObject>>({})
  const prevGridRef = React.useRef<GridCoord>({ x: 0, y: 0 })
  const exitTimeoutsRef = React.useRef<Record<string, number>>({})
  const gridRef = React.useRef<HTMLDivElement>(null)

  const localPlayer = props.localPlayerId ? props.players[props.localPlayerId] : undefined
  // The displayed grid is the one the local player stands on; only the
  // players sharing it are rendered.
  const currentGrid: GridCoord = { x: localPlayer?.gridX ?? 0, y: localPlayer?.gridY ?? 0 }

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
      const cell = (availableSize - gap * (props.world.boardSize - 1)) / props.world.boardSize

      setCellSize(cell)
      setGapSize(gap)
    }

    updateMetrics()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(gridElement)

    return () => observer.disconnect()
  }, [props.world.boardSize])

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

  // Same idea as the player jump keys above, but keyed by object id: a
  // push (see pushObjectIfPresent in use-game-world.tsx) changes an
  // object's position without changing its identity, so this replays the
  // hop animation on the pushed object only. Also detects objects that
  // disappeared from this grid entirely — pushed into a neighboring grid
  // — and keeps them around briefly (see exitingObjects) so they slide
  // out past the edge instead of vanishing instantly. Runs as a layout
  // effect, synchronously before paint, so an exiting object's removal
  // from props.gridObjects and its reappearance in exitingObjects land in
  // the same paint — otherwise it would flicker out for a frame first.
  React.useLayoutEffect(() => {
    const prevGrid = prevGridRef.current
    const gridChanged = prevGrid.x !== currentGrid.x || prevGrid.y !== currentGrid.y
    prevGridRef.current = currentGrid

    const prevObjects = prevObjectsRef.current
    const nextObjects: Record<string, GridObject> = {}
    for (const object of props.gridObjects) nextObjects[object.id] = object
    prevObjectsRef.current = nextObjects

    if (gridChanged) {
      // The local player just switched grids — the whole board changed
      // at once (matches PlayerCube's own instant-teleport behavior on a
      // grid switch), so any "missing" objects are simply the previous
      // grid's, not pushed anywhere. Drop any leftover exit animation
      // instead of starting new ones.
      Object.values(exitTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId))
      exitTimeoutsRef.current = {}
      setExitingObjects({})
      return
    }

    const changedIds: string[] = []
    for (const [id, object] of Object.entries(nextObjects)) {
      const prevObject = prevObjects[id]
      if (prevObject && (prevObject.position.x !== object.position.x || prevObject.position.y !== object.position.y)) {
        changedIds.push(id)
      }
    }

    const newlyExited: Record<string, GridObject> = {}
    for (const [id, prevObject] of Object.entries(prevObjects)) {
      if (id in nextObjects) continue
      const [direction = { x: 0, y: 0 }] = boardEdgeDirections(prevObject.position, props.world)
      newlyExited[id] = {
        ...prevObject,
        position: { x: prevObject.position.x + direction.x, y: prevObject.position.y + direction.y },
      }
    }
    const exitedIds = Object.keys(newlyExited)

    if (changedIds.length > 0 || exitedIds.length > 0) {
      setObjectJumpKeys((current) => {
        const next = { ...current }
        for (const id of [...changedIds, ...exitedIds]) next[id] = (next[id] ?? 0) + 1
        return next
      })
    }

    if (exitedIds.length > 0) {
      setExitingObjects((current) => ({ ...current, ...newlyExited }))
      for (const id of exitedIds) {
        exitTimeoutsRef.current[id] = window.setTimeout(() => {
          delete exitTimeoutsRef.current[id]
          setExitingObjects((current) => {
            if (!(id in current)) return current
            const next = { ...current }
            delete next[id]
            return next
          })
        }, OBJECT_EXIT_DURATION_MS)
      }
    }
  }, [props.gridObjects, props.world, currentGrid.x, currentGrid.y])

  // Pending exit timeouts must not fire after unmount.
  React.useEffect(() => {
    return () => {
      Object.values(exitTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [])

  const boardCells = React.useMemo(
    () => buildBoardCells(props.world),
    [props.world]
  )
  const playerEntries = React.useMemo(
    () =>
      Object.entries(props.players).filter(
        ([, player]) => player.gridX === currentGrid.x && player.gridY === currentGrid.y
      ),
    [props.players, currentGrid.x, currentGrid.y]
  )
  const playerEdgeDirections = localPlayer
    ? boardEdgeDirections(localPlayer.position, props.world)
    : []
  const neighborMarkers = NEIGHBOR_GRID_MARKERS.map(({ offset, disabledClassName, enabledClassName }) => {
    const enabled = playerEdgeDirections.some(
      (direction) => direction.x === offset.x && direction.y === offset.y
    )
    return {
      offset,
      enabled,
      className: enabled ? enabledClassName : disabledClassName,
      grid: { x: currentGrid.x + offset.x, y: currentGrid.y + offset.y },
    }
  }).filter(({ grid }) => isGridInWorld(grid, props.world))

  const handleCellClick = React.useCallback(
    (target: CellPosition) => {
      if (
        !localPlayer ||
        !isAdjacent(localPlayer.position, target) ||
        isCellOccupiedByAnotherPlayer(target, currentGrid, props.players, props.localPlayerId ?? undefined)
      ) {
        return
      }
      props.onMove(target)
    },
    [localPlayer, props.localPlayerId, props.players, props.onMove, currentGrid.x, currentGrid.y]
  )

  const handleNeighborGridClick = React.useCallback(
    (offset: GridCoord) => {
      props.onMoveToGrid(offset)
    },
    [props.onMoveToGrid]
  )

  return (
    <div className="relative inline-block rotate-45">
        <span
          aria-hidden="true"
          className="absolute inset-0 translate-x-4 translate-y-4 rounded-4xl bg-game-ink"
        />
        {/* Sibling of the card below, not a child of it: the card clips
            its own overflow (see its comment) so an exiting object
            disappears under its edge, but these markers are meant to
            poke out past that same edge — living up here, one level
            above the clip, keeps them visible. The card has no explicit
            width/height class of its own beyond the inline style, so its
            box matches this wrapper's exactly and every marker's
            existing offset (e.g. -top-12) still lines up the same. */}
        {neighborMarkers.map(({ offset, className, enabled, grid }) => (
          <NeighborGridMarker
            key={`${grid.x}-${grid.y}`}
            className={className}
            color={gridColor(grid, props.gridColors)}
            enabled={enabled}
            onClick={() => handleNeighborGridClick(offset)}
          />
        ))}
        <div
          className="relative overflow-hidden rounded-4xl border-4 border-game-ink bg-white p-3"
          // Current-grid indicator: an outline (not a second border, which
          // CSS doesn't support stacking) sitting flush just outside the
          // black border, following the same rounded corners.
          // overflow-hidden: clips an exiting object (see the layout
          // effect above) at the card's own bounds, so it visually
          // slides under the border and disappears instead of floating
          // outside it.
          style={{
            width: boardSide,
            height: boardSide,
            outlineStyle: 'ridge',
            outlineWidth: '8px',
            outlineColor: gridColor(currentGrid, props.gridColors),
          }}
        >
          <div
            ref={gridRef}
            className="relative grid size-full gap-1"
            style={{
              gridTemplateColumns: `repeat(${props.world.boardSize}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${props.world.boardSize}, minmax(0, 1fr))`,
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
                  !isCellOccupiedByAnotherPlayer(cell, currentGrid, props.players, props.localPlayerId ?? undefined)
                }
                onCellClick={handleCellClick}
              />
            ))}

            {[...props.gridObjects, ...Object.values(exitingObjects)].map((object) => (
              <GridObjectBadge
                key={object.id}
                object={object}
                jumpKey={objectJumpKeys[object.id] ?? 0}
                cellSize={cellSize}
                gapSize={gapSize}
              />
            ))}

            {playerEntries.map(([playerId, player]) => (
              <PlayerCube
                // Includes the grid so switching grids remounts the cube
                // instead of updating left/top on the existing node — a
                // fresh mount paints at the new cell immediately instead
                // of sliding there, while same-grid moves (key unchanged)
                // still animate smoothly via the transition below.
                key={`${playerId}:${player.gridX},${player.gridY}`}
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
