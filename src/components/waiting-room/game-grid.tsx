import * as React from 'react'
import { Circle, Square, Star, Triangle } from 'lucide-react'

import { type PlayersState } from '@/hooks/use-game-world'
import { CUBE_COLOR_CLASSES, CUBE_COLOR_PALETTE, type CubeColor } from '@/lib/cube-colors'
import {
  inventoryItemForColor,
  inventoryItemForObject,
  inventoryItemForShape,
  type InventoryItem,
} from '@/lib/inventory-items'
import {
  getObjectActionsSource,
  getObjectIconOffset,
  getObjectIconScale,
  getObjectIconUrl,
  type GridObject,
  type ObjectActionDisplay,
  type ObjectType,
} from '@/lib/game-objects'
import { specialCellBackground, type CellShape, type SpecialCell } from '@/lib/special-cells'
import { cn } from '@/lib/utils'
import { ObjectActionDialog } from '@/components/waiting-room/object-action-dialog'
import { PlayerBubbleDialog } from '@/components/waiting-room/player-bubble-dialog'
import {
  boardEdgeDirections,
  boardEdgeRange,
  type CellPosition,
  type GridColors,
  type GridCoord,
  gridColor,
  isAdjacent,
  isArbitraryGrid,
  isCellVisible,
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
// Sized so the worst case still fits the real screen once the whole
// board is rotated 45°: the camera clamp (see the layout effect below)
// guarantees that whenever boardSize > viewBoardSize, a true board-edge
// cell can land exactly at this box's own local edge — i.e. at local
// distance boardSide/2 from its center. After the wrapper's rotate-45,
// a point at local distance d from center reaches sqrt(2)*d on a single
// screen axis (a square's corner rotates onto an axis — this is the
// same geometry that makes a rotated square look like a diamond with
// axis-aligned tips). The player cube itself adds another cellSize/2 of
// local reach beyond that (its own half-width can poke past the edge
// cell's own local position), so the worst case is
// sqrt(2) * (boardSide/2 + cellSize/2), and cellSize is itself
// ~boardSide/viewBoardSize (see the metrics effect below, which sizes
// cells as if there were only viewBoardSize columns). Solving
// worstCase <= BOARD_SAFE_FRACTION * innerWidth/2 for boardSide gives
// the formula below; BOARD_SAFE_FRACTION leaves a bit of the margin
// spare to absorb what this ignores (gaps, the frame's 16px border+
// padding inset, the cube's own -10%/-8% render nudge).
const BOARD_SAFE_FRACTION = 0.9

// How long an object that just got pushed off this grid keeps sliding
// past the board edge before it's dropped from render — matches the
// duration-300 transition on GridObjectBadge so the timeout fires right
// as the slide finishes.
const OBJECT_EXIT_DURATION_MS = 300

// How many cells of the current viewBoardSize window's far edge the
// dead-zone camera keeps clear before it starts panning (see the
// camera useLayoutEffect below) — was a bare "- 1" (pan right at the
// true edge); pulled into a constant so it's easy to tune.
const CAMERA_EDGE_MARGIN = 1

// How long a pointer must rest on a player cube before it counts as a
// long press (see PlayerCube) — and how far it may drift, in pixels,
// before the press is abandoned instead. The drift allowance is what
// keeps a free-camera pan that happens to start on a cube from
// selecting that player.
const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE_TOLERANCE_PX = 10
// The browser-default double-click interval varies slightly by platform;
// this conventional value is only used to recognise the second press
// early enough that it can immediately become a paint stroke.
const DOUBLE_CLICK_MS = 300

// Toggle for the off-screen player indicator bubbles (see the fixed
// layer in GameGrid's return) — flip to false to disable entirely.
const SHOW_OFFSCREEN_INDICATORS = true

// Diameter, in pixels, of each off-screen indicator bubble.
const OFFSCREEN_INDICATOR_SIZE_PX = 32

// How far a bubble's center sits inside the real screen edge, so it
// never renders half cut-off.
const OFFSCREEN_INDICATOR_EDGE_MARGIN_PX = OFFSCREEN_INDICATOR_SIZE_PX / 2 + 8

// Rotates a local (pre-rotation) board-space vector by the same 45°
// the board wrapper itself is rotated by (see the outer div in
// GameGrid's return) — the direction comes from game/board space, but
// the off-screen indicator bubble lives outside the rotated wrapper
// (so it stays upright), so unlike every other position in this file,
// the rotation isn't free via CSS here — it has to be done by hand.
// Used both to check whether a player's real screen position is
// actually visible, and (once it isn't) to place its bubble.
function rotateToScreenSpace(localDx: number, localDy: number): { dx: number; dy: number } {
  const angle = Math.PI / 4
  return {
    dx: localDx * Math.cos(angle) - localDy * Math.sin(angle),
    dy: localDx * Math.sin(angle) + localDy * Math.cos(angle),
  }
}

// Clamps an already-rotated screen-space direction to the real
// screen's rectangle — i.e. finds where a ray from screen-center in
// that direction crosses the screen edge.
function clampToScreenEdge(
  dx: number,
  dy: number,
  screenWidth: number,
  screenHeight: number
): { left: number; top: number } {
  const halfWidth = screenWidth / 2 - OFFSCREEN_INDICATOR_EDGE_MARGIN_PX
  const halfHeight = screenHeight / 2 - OFFSCREEN_INDICATOR_EDGE_MARGIN_PX
  const scaleX = dx !== 0 ? halfWidth / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? halfHeight / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { left: screenWidth / 2 + dx * scale, top: screenHeight / 2 + dy * scale }
}

// Inverse of rotateToScreenSpace above — converts a screen-space drag
// delta back into the board's own local (pre-rotation) axes. Used by
// the free-camera drag-to-pan handlers, since a pointer's clientX/Y
// delta is a screen-space vector but cameraOffset is expressed in the
// board's own local x/y.
function screenToLocalSpace(screenDx: number, screenDy: number): { dx: number; dy: number } {
  const angle = Math.PI / 4
  return {
    dx: screenDx * Math.cos(angle) + screenDy * Math.sin(angle),
    dy: -screenDx * Math.sin(angle) + screenDy * Math.cos(angle),
  }
}

function computeBoardSidePx(viewBoardSize: number): number {
  if (typeof window === 'undefined') return 239
  const reachFactor = Math.SQRT2 * (1 + 1 / viewBoardSize)
  return (window.innerWidth * BOARD_SAFE_FRACTION) / reachFactor
}

// Default for a cell that's never been shaken — direction is unused
// whenever key is 0 (see GridCell/GridShapeBadge's shakeKey > 0 gate).
const NO_SHAKE = { key: 0, direction: { x: 0, y: 0 } }

interface BoardCellRange {
  minX: number
  maxX: number
  minY: number
  maxY: number
  columns: number
  rows: number
  cellCount: number
}

function isPositionInBoardCellRange(position: CellPosition, range: BoardCellRange | null): boolean {
  return (
    range !== null &&
    position.x >= range.minX &&
    position.x <= range.maxX &&
    position.y >= range.minY &&
    position.y <= range.maxY
  )
}

function cellPositionKey(cell: CellPosition): string {
  return `${cell.x}-${cell.y}`
}

// Rasterises a fast pointer jump into every grid cell it crossed. The
// endpoints are included; callers deduplicate them for the duration of a
// paint stroke.
function cellsAlongLine(from: CellPosition, to: CellPosition): CellPosition[] {
  const cells: CellPosition[] = []
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const stepX = from.x < to.x ? 1 : -1
  const stepY = from.y < to.y ? 1 : -1
  let error = dx - dy

  while (true) {
    cells.push({ x, y })
    if (x === to.x && y === to.y) return cells
    const twiceError = error * 2
    if (twiceError > -dy) {
      error -= dy
      x += stepX
    }
    if (twiceError < dx) {
      error += dx
      y += stepY
    }
  }
}

function gridCellFromElement(element: Element | null): CellPosition | null {
  const cellElement = element?.closest<HTMLElement>('[data-grid-cell]')
  if (!cellElement) return null
  const x = Number(cellElement.dataset.gridCellX)
  const y = Number(cellElement.dataset.gridCellY)
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null
}

function gridCellAtPointer(clientX: number, clientY: number): CellPosition | null {
  return gridCellFromElement(document.elementFromPoint(clientX, clientY))
}

// CSS custom properties driving the cell-giggle keyframes (index.css):
// compress along the travel axis, stretch the perpendicular one (same
// asymmetric squash-and-stretch idea as cube-jump), translate toward
// the direction. Local x/y, not screen x/y — GridCell/GridShapeBadge
// already live inside the board's own rotate-45 wrapper, so this lands
// correctly rotated on screen for free, same as GridObjectBadge's own
// position slide.
function shakeStyle(direction: GridCoord): React.CSSProperties {
  const compress = 0.6
  const stretch = 1.25
  const travel = 22 // percent of the cell's own size
  return {
    '--shake-translate-x': `${direction.x * travel}%`,
    '--shake-translate-y': `${direction.y * travel}%`,
    '--shake-scale-x': direction.x !== 0 ? compress : stretch,
    '--shake-scale-y': direction.y !== 0 ? compress : stretch,
  } as React.CSSProperties
}

interface GridCellProps {
  x: number
  y: number
  clickable: boolean
  // Undefined for a plain cell. Only ever a placement constraint (see
  // unavailablePlayerCellsOn in use-game-world.tsx) — a player can end
  // up standing here during normal play, in which case the "you are
  // here" highlight below takes over instead.
  specialColor?: CubeColor
  // Bumped (see specialCellShakeKeys in GameGrid) whenever a punch/pull
  // actually moves something to or from this cell — 0 means "never",
  // so the very first render never plays the animation.
  shakeKey: number
  // Which way the content just moved, for the squash direction (see
  // shakeStyle) — only read while shakeKey > 0, so an unused default is
  // harmless when nothing's shaking.
  shakeDirection: GridCoord
  onCellClick: (cell: CellPosition) => void
}

const GridCell = React.memo(function GridCell(props: GridCellProps) {
  function handleClick() {
    props.onCellClick({ x: props.x, y: props.y })
  }

  return (
    <button
      type="button"
      data-grid-cell
      data-grid-cell-x={props.x}
      data-grid-cell-y={props.y}
      disabled={!props.clickable}
      onClick={handleClick}
      aria-label={`Case ${props.x},${props.y}`}
      style={{ gridColumn: props.x + 1, gridRow: props.y + 1 }}
    >
      {/* Everything visible lives here, not on the button above — so a
          plain (uncolored) cell's own tint moves too when shaken, not
          just a color patch layered on top of a static box. Remounted
          via shakeKey on every push/pull touching this cell to replay
          the squash (see cell-giggle in index.css); shakeDirection
          comes along as CSS custom properties via shakeStyle. */}
      <div
        key={props.shakeKey}
        className={cn(
          'size-full rounded-md border border-transparent bg-game-ink/5 transition-colors',
          props.clickable && 'cursor-pointer bg-game-ink/12',
          props.shakeKey > 0 && 'cell-giggle'
          // isPlayerHere && 'bg-game-yellow'
        )}
        style={{
          backgroundColor: props.specialColor && specialCellBackground(props.specialColor),
          ...(props.shakeKey > 0 ? shakeStyle(props.shakeDirection) : undefined),
        }}
      />
    </button>
  )
})

interface PlayerCubeProps {
  playerId: string
  position: CellPosition
  boardCellRange: BoardCellRange | null
  color: CubeColor
  jumpKey: number
  cellSize: number
  gapSize: number
  avatarUrl: string | null
  isHost: boolean
  isLocalPlayer: boolean
  boardSize: number
  // Placement gestures belong to the cell beneath the cube, not the
  // player-selection control itself.
  placementActive: boolean
  // Fired by a *long* press on the cube, not a tap (see LONG_PRESS_MS)
  // — a short tap does nothing at all.
  onSelect: (playerId: string) => void
}

const PlayerCube = React.memo(function PlayerCube(props: PlayerCubeProps) {
  const clipId = React.useId()
  const isInBoardCellRange = isPositionInBoardCellRange(props.position, props.boardCellRange)
  // Pending long press: the timer that will fire it, plus where the
  // pointer went down, so drifting past the tolerance can abandon it.
  const pressRef = React.useRef<{ timeoutId: number; startX: number; startY: number } | null>(null)

  const cancelPress = React.useCallback(() => {
    if (!pressRef.current) return
    window.clearTimeout(pressRef.current.timeoutId)
    pressRef.current = null
  }, [])

  // A cube can be pushed off the grid (or the whole board can swap) mid
  // press — without this the timer would still fire for a player who is
  // no longer under the finger.
  React.useEffect(() => cancelPress, [cancelPress])
  React.useEffect(() => {
    if (!isInBoardCellRange) cancelPress()
  }, [isInBoardCellRange, cancelPress])

  if (!isInBoardCellRange) return null
  const colorClasses = CUBE_COLOR_CLASSES[props.color]

  function handlePointerDown(event: React.PointerEvent) {
    cancelPress()
    const { playerId, onSelect } = props
    pressRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      timeoutId: window.setTimeout(() => {
        pressRef.current = null
        onSelect(playerId)
      }, LONG_PRESS_MS),
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    const press = pressRef.current
    if (!press) return
    const dx = event.clientX - press.startX
    const dy = event.clientY - press.startY
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) cancelPress()
  }

  return (
    <div
      className="absolute transition-[left,top] duration-300 ease-out"
      style={{
        width: `${props.cellSize}px`,
        height: `${props.cellSize}px`,
        left: `${props.position.x * (props.cellSize + props.gapSize) + props.cellSize * -0.1}px`,
        top: `${props.position.y * (props.cellSize + props.gapSize) - props.cellSize * 0.08}px`,
        zIndex: props.position.y * props.boardSize + props.position.x + 1000
      }}
    >
      {/* Purely visual — the offset above nudges this into a
          neighboring cell on purpose (e.g. the one above); pointer-events-none
          so it never captures a click meant for that cell instead of
          the GridCell button underneath it. The actual click target is
          the separate, inset button below. */}
      <div className="pointer-events-none size-full">
        <div className="size-full p-[0.25%] transition-transform duration-300 ease-out">
          <svg key={props.jumpKey} viewBox="0 0 100 100" className="cube-jump size-full">
            <defs>
              <clipPath id={clipId}>
                <rect
                  x="5"
                  y="5"
                  width="76"
                  height="76"
                  rx="16"
                />
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
              width="83"
              height="83"
              rx="20"
              strokeWidth="8"
              className={cn(colorClasses.fill, 'stroke-game-ink')}
            />
            {/* "This is you" indicator: a thin ring just inside the black
                border, hugging the avatar — sits exactly where the avatar's
                own edge is for everyone else (see the clip rect above,
                shrunk a little further here to leave room for this ring
                instead of overlapping the picture). */}
            {props.isLocalPlayer && (
              <rect
                x="3"
                y="3"
                width="81"
                height="81"
                rx="17"
                fill="none"
                strokeWidth="2"
                className="stroke-(--color-game-yellow)"
              />
            )}
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
            className="absolute z-10 flex h-6 w-6 items-center justify-center"
            style={{ left: '-7px', top: '-8px' }}
          >
            <Star className="h-5 w-5 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-[3] stroke-game-ink" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Actual click target: cancels the wrapper's -10%/-8% offset
          above, so this lands exactly on the player's own true cell —
          the same box GridCell occupies there. */}
      {/* No onClick: a short tap is deliberately inert, only a long
          press selects (see LONG_PRESS_MS). onContextMenu/select-none
          keep a touch long-press from raising the OS context menu or
          selection callout over the cube instead. */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(event) => event.preventDefault()}
        aria-label="Voir ce joueur dans la liste"
        className={cn('absolute cursor-pointer select-none', props.placementActive && 'pointer-events-none')}
        style={{
          left: `${props.cellSize * 0.1}px`,
          top: `${props.cellSize * 0.08}px`,
          width: `${props.cellSize}px`,
          height: `${props.cellSize}px`,
        }}
      />
    </div>
  )
})

interface GameGridProps {
  players: PlayersState
  localPlayerId: string | null
  avatarUrls: Record<string, string>
  hostPlayerId: string | null
  world: WorldState
  // Camera zoom — see SharedSettings in game-settings.ts. Separate from
  // world since it's synced independently (identical for every player)
  // rather than being part of the board's own local geometry.
  viewBoardSize: number
  // Hard cap used to choose the player/camera-centered window of cells
  // that become DOM nodes. Owned by the parent so separate GameGrid
  // instances can use different rendering limits.
  maxVisibleCells: number
  gridColors: GridColors
  gridObjects: GridObject[]
  specialCells: SpecialCell[]
  specialCellShake: { grid: GridCoord; position: CellPosition; direction: GridCoord } | null
  // Per-object hop counters (see GameWorldValue.objectJumps) — added to
  // this component's own move-derived objectJumpKeys at the render site.
  objectJumps: Record<string, { grid: GridCoord; count: number }>
  onMove: (position: CellPosition) => void
  onMoveToGrid: (direction: GridCoord, objectId?: string) => void
  onSelectPlayer: (playerId: string) => void
  // Fired from the dialog behind another player's off-screen indicator
  // bubble (see PlayerBubbleDialog) — drops the local player next to
  // them. The host decides the exact landing cell; see teleportToPlayer
  // in use-game-world.tsx.
  onTeleportToPlayer: (targetPlayerId: string) => void
  onTriggerObjectAction: (objectId: string, actionName: string) => void
  resolveObjectActionNames: (objectId: string, objectType: ObjectType) => Promise<ObjectActionDisplay[]>
  // Sandbox mode's Inventaire tool (see game-screen.tsx) — while true,
  // clicks stop meaning "move" and either pick the content already on a
  // cell or place the selected item there instead: every rendered cell
  // becomes clickable (not just ones adjacent to the player).
  // Optional so the waiting-room lobby's own <GameGrid> usage (which
  // knows nothing about the inventory) needs no changes.
  placementActive?: boolean
  selectedInventoryItem?: InventoryItem | null
  onSelectInventoryItem?: (item: InventoryItem) => void
  onPlaceItem?: (cell: CellPosition) => void
  // Wait-room-only free camera pan (see the "Caméra" button in
  // waiting-room.tsx) — while true, the dead-zone follow camera stops
  // reacting to player movement and the drag handlers below own
  // cameraOffset instead; turning it back off snaps the camera back to
  // centered-on-player. Optional so game-screen.tsx's own <GameGrid>
  // usage needs no changes.
  freeCameraActive?: boolean
}

interface GridObjectBadgeProps {
  object: GridObject
  boardCellRange: BoardCellRange | null
  jumpKey: number
  cellSize: number
  gapSize: number,
  boardSize: number
}

const SHAPE_ICONS: Record<CellShape, React.ComponentType<{ className?: string }>> = {
  circle: Circle,
  triangle: Triangle,
  square: Square,
  star: Star,
}

interface GridShapeBadgeProps {
  cell: SpecialCell
  boardCellRange: BoardCellRange | null
  cellSize: number
  gapSize: number
  // Same convention as GridCell's — bumped whenever a punch/pull
  // actually moves something to or from this cell; 0 means "never".
  shakeKey: number
  shakeDirection: GridCoord
}

const GridShapeBadge = React.memo(function GridShapeBadge(props: GridShapeBadgeProps) {
  if (!props.cell.shape || !isPositionInBoardCellRange(props.cell.position, props.boardCellRange)) return null
  const ShapeIcon = SHAPE_ICONS[props.cell.shape]
  const badgeSize = props.cellSize * 0.85
  const cellLeft = props.cell.position.x * (props.cellSize + props.gapSize)
  const cellTop = props.cell.position.y * (props.cellSize + props.gapSize)

  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center"
      style={{
        width: badgeSize,
        height: badgeSize,
        left: cellLeft + (props.cellSize - badgeSize) / 2,
        top: cellTop + (props.cellSize - badgeSize) / 2,
      }}
    >
      {/* Remounted via shakeKey, same idea as GridObjectBadge's icon
          wrapper below, to replay the squash on a push/pull. */}
      <div
        key={props.shakeKey}
        className={cn('size-full', props.shakeKey > 0 && 'cell-giggle')}
        style={props.shakeKey > 0 ? shakeStyle(props.shakeDirection) : undefined}
      >
        <ShapeIcon
          className={cn(
            'size-full fill-transparent text-game-ink/40 stroke-[2]',
            props.cell.shape === 'star' && 'rotate-45'
          )}
          aria-hidden="true"
        />
      </div>
    </div>
  )
})

const GridObjectBadge = React.memo(function GridObjectBadge(props: GridObjectBadgeProps) {
  if (!isPositionInBoardCellRange(props.object.position, props.boardCellRange)) return null
  const iconScale = getObjectIconScale(props.object.type, props.object.state)
  const iconOffset = getObjectIconOffset(props.object.type, props.object.state)
  const badgeSize = props.cellSize * 0.7 * iconScale
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
        left: cellLeft + (props.cellSize - badgeSize) / 2 + iconOffset.x * props.cellSize,
        top: cellTop + (props.cellSize - badgeSize) / 2 + iconOffset.y * props.cellSize,
        // Linear index from 2D position (row-major): y * boardSize + x,
        // offset by 1000 to sit above base board elements.
        zIndex: props.object.position.y * props.boardSize + props.object.position.x + 1000
      }}
    >
      {/* Same squash-and-hop as PlayerCube's cube-jump (see index.css),
          replayed by remounting on every push via the key. A separate
          element from the icon below so the animation's own transform
          doesn't clobber the icon's static counter-rotation. */}
      <div key={props.jumpKey} className="cube-jump size-full">
        <img
          src={getObjectIconUrl(props.object.type, props.object.state)}
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
// Small triangular markers, apex pointing outward, previewing the
// identifying color of the neighboring grid in that direction. Sides
// without a neighbor (world edge) show nothing. All four share one
// apex-up triangle, rotated per side instead of redrawn. Corners are
// rounded by curving through each vertex (Q) rather than meeting at a
// sharp point, cut back along each edge by a fixed distance from the
// vertex.
const NEIGHBOR_TRIANGLE_PATH =
  'M 42.3,18.1 L 9.7,78 Q 2,92 18,92 L 82,92 Q 98,92 90.3,78 L 57.7,18.1 Q 50,4 42.3,18.1 Z'

// Pixel gap kept between the true board edge cell and a marker sitting
// just outside it (see the neighborMarkers computation below) — bigger
// once the player is actually standing on that edge (enabled), same
// small "steps toward you" cue the old -12/-15 Tailwind offsets gave,
// just as numeric constants now that position is computed, not static.
const NEIGHBOR_MARKER_GAP_PX = 24
const NEIGHBOR_MARKER_ENABLED_EXTRA_PX = 12

// Rotation only — position is computed per-render in true-board pixel
// space (see neighborMarkers below), since it depends on cellSize, the
// player's own position, and the true board's edge indices, none of
// which a static Tailwind class can express.
// direction: reused by the indicator-marker path below (see
// neighborMarkers/ownerObjectId) to name which of an owned arbitrary
// grid's border actions ('indicator-top' etc., see WorldState.state in
// world.ts) a given triangle invokes.
const NEIGHBOR_GRID_MARKERS: { offset: GridCoord; rotationClassName: string; direction: 'top' | 'right' | 'bottom' | 'left' }[] = [
  { offset: { x: 0, y: -1 }, rotationClassName: '', direction: 'top' },
  { offset: { x: 1, y: 0 }, rotationClassName: 'rotate-90', direction: 'right' },
  { offset: { x: 0, y: 1 }, rotationClassName: 'rotate-180', direction: 'bottom' },
  { offset: { x: -1, y: 0 }, rotationClassName: '-rotate-90', direction: 'left' },
]

interface NeighborGridMarkerProps {
  color: string
  rotationClassName: string
  style: React.CSSProperties
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
      style={props.style}
      className={cn(
        // pointer-events-auto: its parent escape-layer div (see where
        // this renders) is pointer-events-none so it doesn't intercept
        // clicks meant for the board underneath; this opts back in.
        // -translate-x-1/2 -translate-y-1/2: self-centers on the
        // left/top anchor point computed below, composes fine with the
        // rotation class alongside it (Tailwind's transform utilities
        // combine into one transform, unrelated to the inline
        // left/top). z-10: below the ObjectActionDialog escape layer's
        // z-30, above the board's own default-stacked content.
        'pointer-events-auto absolute z-10 size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-[left,top,transform] duration-300 ease-out hover:scale-110',
        props.rotationClassName
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

interface OffScreenPlayerBubbleProps {
  color: CubeColor
  avatarUrl: string | null
  left: number
  top: number
  onClick: () => void
}

// Miniature for the off-screen indicator layer (see SHOW_OFFSCREEN_INDICATORS
// in GameGrid's return) — deliberately not PlayerCube's SVG: that bakes in
// a rotate(-45 ...) counter-rotation that only makes sense inside the
// board's own rotated wrapper (see offScreenBubblePosition's comment).
// Just a plain rounded button, self-centered on its left/top anchor
// point same as NeighborGridMarker — and, like that marker, opting back
// into pointer events its own layer turns off, so the click lands here
// rather than on the board behind it.
const OffScreenPlayerBubble = React.memo(function OffScreenPlayerBubble(props: OffScreenPlayerBubbleProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer overflow-hidden rounded-full border-2 border-game-ink transition-[left,top] duration-300 ease-out"
      style={{
        left: props.left,
        top: props.top,
        width: OFFSCREEN_INDICATOR_SIZE_PX,
        height: OFFSCREEN_INDICATOR_SIZE_PX,
        backgroundColor: CUBE_COLOR_PALETTE[props.color].bg,
      }}
    >
      {props.avatarUrl && (
        <img src={props.avatarUrl} alt="" className="size-full object-cover" />
      )}
    </button>
  )
})

function GameGrid(props: GameGridProps) {
  const [boardSide, setBoardSide] = React.useState(() => computeBoardSidePx(props.viewBoardSize))
  const [cellSize, setCellSize] = React.useState(0)
  const [gapSize, setGapSize] = React.useState(0)
  const [jumpKeys, setJumpKeys] = React.useState<Record<string, number>>({})
  // Which player's off-screen bubble was tapped, if any — drives
  // PlayerBubbleDialog below.
  const [bubblePlayerId, setBubblePlayerId] = React.useState<string | null>(null)
  const [objectJumpKeys, setObjectJumpKeys] = React.useState<Record<string, number>>({})
  const [specialCellShakeKeys, setSpecialCellShakeKeys] = React.useState<
    Record<string, { key: number; direction: GridCoord }>
  >({})
  // Camera window's top-left corner, in cell-index units (see the
  // dead-zone-follow layout effect below).
  const [cameraOffset, setCameraOffset] = React.useState<GridCoord>({ x: 0, y: 0 })
  const prevCameraGridRef = React.useRef<GridCoord>({ x: 0, y: 0 })
  // Tracks freeCameraActive's previous value across renders, purely to
  // detect the true→false edge (see the dead-zone effect below) — the
  // moment it just turned off, not merely "it's currently off."
  const prevFreeCameraRef = React.useRef(false)
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
  // The fixed, on-screen clipping window (see its render below) — cell
  // size is measured from this, not from gridRef, since gridRef now
  // sits inside a frame whose own size is derived FROM cellSize
  // (frameSidePx below); measuring gridRef itself would be circular.
  const viewportRef = React.useRef<HTMLDivElement>(null)
  // Free-camera drag-to-pan (see handlePanPointerDown/Move/Up below) —
  // null whenever no drag is in progress. startOffset/moved let a plain
  // tap-to-move click still pass through: cameraOffset only actually
  // changes once the pointer has moved past a small threshold.
  const dragRef = React.useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffset: GridCoord
    moved: boolean
  } | null>(null)
  // A placement press starts pending: it becomes paint mode after a
  // stationary long press, or immediately on the second press of a
  // double-click. Until then free-camera mode may still claim it as a
  // normal pan. Once active, the stroke owns the pointer until release.
  const paintGestureRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    startCell: CellPosition
    longPressTimeout: number | null
    active: boolean
    lastCell: CellPosition
    paintedCells: Set<string>
  } | null>(null)
  const lastPlacementTapRef = React.useRef<{ cell: CellPosition; timestamp: number } | null>(null)
  // Set true only immediately after a real drag (not a plain tap)
  // releases, and cleared right after via a deferred timeout — long
  // enough for the synthetic click that follows the same pointer-up to
  // still see it and get suppressed (see handleCellClick), but not so
  // long it'd swallow an unrelated later click.
  const justDraggedRef = React.useRef(false)

  const localPlayer = props.localPlayerId ? props.players[props.localPlayerId] : undefined
  const localPlayerX = localPlayer?.position.x
  const localPlayerY = localPlayer?.position.y
  // The displayed grid is the one the local player stands on; only the
  // players sharing it are rendered.
  const currentGrid: GridCoord = { x: localPlayer?.gridX ?? 0, y: localPlayer?.gridY ?? 0 }

  React.useEffect(() => {
    return () => {
      const gesture = paintGestureRef.current
      if (gesture && gesture.longPressTimeout !== null) window.clearTimeout(gesture.longPressTimeout)
    }
  }, [])

  // No diffing here, unlike objectJumpKeys/jumpKeys below — special
  // cells have no stable id to diff by (see use-game-world.tsx's
  // 'special-cell-shake' message), so the host tells us explicitly
  // when a punch/pull actually moved something. props.specialCellShake
  // is always a brand-new object on every shake, so any change in its
  // identity means "a new one just arrived" — filtered to the grid
  // currently on screen, since a stale shake for a grid the player has
  // since left shouldn't play here.
  React.useEffect(() => {
    if (!props.specialCellShake) return
    if (props.specialCellShake.grid.x !== currentGrid.x || props.specialCellShake.grid.y !== currentGrid.y) return
    // Dash-separated, matching this file's own local position-key
    // convention (see specialCellsByKey, GridShapeBadge's key) — not
    // world.ts's gridKey, which is comma-separated and for grid
    // coordinates, not cell positions.
    const key = `${props.specialCellShake.position.x}-${props.specialCellShake.position.y}`
    const direction = props.specialCellShake.direction
    setSpecialCellShakeKeys((current) => ({
      ...current,
      [key]: { key: (current[key]?.key ?? 0) + 1, direction },
    }))
  }, [props.specialCellShake, currentGrid.x, currentGrid.y])

  // Replaying an object's own move-hop animation on demand (see
  // ObjectActionDefinition.animate) needs no effect of its own:
  // props.objectJumps already arrives as a monotonic per-object counter,
  // so it's simply added to the move-derived objectJumpKeys at the render
  // site below. It used to be converted here from a single latest-jump
  // slot, which silently dropped every jump but one whenever a single
  // cell change animated two neighbors at once.

  // Dead-zone follow camera, in cell-index units (converted to pixels
  // below): within viewBoardSize - CAMERA_EDGE_MARGIN cells of the
  // current window's near edge the player moves freely with no camera
  // motion; stepping past that slides the window by exactly the amount
  // needed to keep the
  // player just inside it, clamped to the *true* board's own bounds
  // (boardSize) — never viewBoardSize — so the camera stops panning
  // exactly when the player reaches a real board edge, which is also
  // when a NeighborGridMarker becomes enabled (see
  // boardEdgeDirections in world.ts, keyed the same way).
  //
  // Suspended entirely while freeCameraActive (see the drag handlers
  // below, which own cameraOffset instead during that time) — the
  // moment it turns back off, this recenters on the player using the
  // same "fresh grid" math below, instead of resuming a slide from
  // wherever the free-panned camera happened to be left.
  React.useLayoutEffect(() => {
    if (!localPlayer) return
    const mapSize = props.world.boardSize
    const viewSize = props.viewBoardSize
    const maxOffset = Math.max(0, mapSize - viewSize)

    const freeCameraJustDisabled = prevFreeCameraRef.current && !props.freeCameraActive
    prevFreeCameraRef.current = !!props.freeCameraActive

    if (props.freeCameraActive) {
      return
    }

    const gridChanged = prevCameraGridRef.current.x !== currentGrid.x || prevCameraGridRef.current.y !== currentGrid.y
    prevCameraGridRef.current = currentGrid

    if (gridChanged || freeCameraJustDisabled) {
      // Fresh grid (or camera mode just turned off): recenter on the
      // player instead of sliding from wherever the camera happened to
      // sit before.
      const center = Math.floor((viewSize - 1) / 2)
      setCameraOffset({
        x: Math.min(maxOffset, Math.max(0, localPlayer.position.x - center)),
        y: Math.min(maxOffset, Math.max(0, localPlayer.position.y - center)),
      })
      return
    }

    function clampAxis(playerPos: number, current: number): number {
      if (playerPos < current) return Math.max(0, playerPos)
      if (playerPos > current + viewSize - CAMERA_EDGE_MARGIN) return Math.min(maxOffset, playerPos - (viewSize - CAMERA_EDGE_MARGIN))
      return Math.min(current, maxOffset)
    }

    setCameraOffset((current) => ({
      x: clampAxis(localPlayer.position.x, current.x),
      y: clampAxis(localPlayer.position.y, current.y),
    }))
  }, [localPlayer?.position.x, localPlayer?.position.y, currentGrid.x, currentGrid.y, props.world.boardSize, props.viewBoardSize, props.freeCameraActive])

  React.useEffect(() => {
    function updateBoardSide() {
      setBoardSide(computeBoardSidePx(props.viewBoardSize))
    }

    updateBoardSide()
    window.addEventListener('resize', updateBoardSide)
    window.visualViewport?.addEventListener('resize', updateBoardSide)

    return () => {
      window.removeEventListener('resize', updateBoardSide)
      window.visualViewport?.removeEventListener('resize', updateBoardSide)
    }
  }, [props.viewBoardSize])

  React.useEffect(() => {
    const gridElement = gridRef.current
    const viewportElement = viewportRef.current
    if (!gridElement || !viewportElement) return

    const updateMetrics = () => {
      // Gap is a static CSS value (the gap-1 class), so reading it off
      // gridRef's computed style is safe regardless of gridRef's own
      // rendered size.
      const style = window.getComputedStyle(gridElement)
      const columnGap = Number.parseFloat(style.columnGap || '0')
      const rowGap = Number.parseFloat(style.rowGap || '0')
      const gap = Math.max(columnGap, rowGap)
      // Measured from the fixed viewport, not gridRef — gridRef now
      // sits inside the frame, whose own size is derived FROM cellSize
      // (see frameSidePx below), so measuring gridRef here would be
      // circular (it would never bootstrap past 0). The viewport's box
      // is unaffected by boardSize/cellSize, exactly like the old
      // card's was.
      const availableSize = Math.min(viewportElement.clientWidth, viewportElement.clientHeight)
      // Divides by viewBoardSize (the camera's zoom level), not
      // boardSize (the board's actual dimensions) — this is the whole
      // decoupling: a cell is sized as if there were only viewBoardSize
      // columns, however many there actually are.
      const cell = (availableSize - gap * (props.viewBoardSize - 1)) / props.viewBoardSize

      setCellSize(cell)
      setGapSize(gap)
    }

    updateMetrics()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(viewportElement)

    return () => observer.disconnect()
  }, [props.viewBoardSize])

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

  const boardCellRange = React.useMemo(() => {
    if (localPlayerX === undefined || localPlayerY === undefined) return null
    const radius = Math.floor(props.maxVisibleCells / 2)
    // Centered on the camera instead of the player while free-panning
    // — otherwise this DOM-node cap (still player-centered by default)
    // would leave panned-to cells unmounted, showing empty gaps.
    const center = props.freeCameraActive
      ? {
          x: Math.round(cameraOffset.x + (props.viewBoardSize - 1) / 2),
          y: Math.round(cameraOffset.y + (props.viewBoardSize - 1) / 2),
        }
      : { x: localPlayerX, y: localPlayerY }
    const minX = Math.max(0, center.x - radius)
    const maxX = Math.min(props.world.boardSize - 1, center.x + radius)
    const minY = Math.max(0, center.y - radius)
    const maxY = Math.min(props.world.boardSize - 1, center.y + radius)
    const columns = Math.max(0, maxX - minX + 1)
    const rows = Math.max(0, maxY - minY + 1)

    return {
      minX,
      maxX,
      minY,
      maxY,
      columns,
      rows,
      cellCount: columns * rows,
    }
  }, [
    props.world.boardSize,
    localPlayerX,
    localPlayerY,
    props.freeCameraActive,
    cameraOffset.x,
    cameraOffset.y,
    props.viewBoardSize,
    props.maxVisibleCells,
  ])
  const specialCellsByKey = React.useMemo(() => {
    const map = new Map<string, SpecialCell>()
    for (const cell of props.specialCells) map.set(`${cell.position.x}-${cell.position.y}`, cell)
    return map
  }, [props.specialCells])
  const gridObjectsByKey = React.useMemo(() => {
    const map = new Map<string, GridObject>()
    for (const object of props.gridObjects) map.set(`${object.position.x}-${object.position.y}`, object)
    return map
  }, [props.gridObjects])
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
  // Positioned in true-board pixel space (same convention as
  // GridShapeBadge's cellLeft/cellTop), not the fixed viewBoardSize
  // viewport — so a marker sits right at the real edge cell in its
  // direction, panning with the camera instead of following the player
  // at a fixed screen distance (see the escape-layer div these render
  // into, below). The parallel (toward-the-edge) axis uses
  // boardEdgeRange's true min/max index; the perpendicular axis tracks
  // the player's own position, per direction ask.
  // Set only on an arbitrary grid created with a third ctx.createGrid
  // argument (see WorldState.state in world.ts) — routes the grid's own
  // border triangles to that owner object's indicator-<direction>
  // actions below, instead of ordinary grid-to-grid navigation.
  const ownerObjectId = isArbitraryGrid(currentGrid) ? props.world.state : undefined
  const neighborMarkers = localPlayer
    ? (() => {
        const { minIndex, maxIndex } = boardEdgeRange(props.world)
        const cellStride = cellSize + gapSize
        const playerCenterX = localPlayer.position.x * cellStride + cellSize / 2
        const playerCenterY = localPlayer.position.y * cellStride + cellSize / 2
        const markers = NEIGHBOR_GRID_MARKERS.map(({ offset, rotationClassName, direction }) => {
          // Indicator markers are permanent buttons on the owner's
          // grid, not a "walk to the edge to cross" cue — always
          // enabled, regardless of the player's own position.
          const enabled = playerEdgeDirections.some((d) => d.x === offset.x && d.y === offset.y)
          const gap = NEIGHBOR_MARKER_GAP_PX + (enabled ? NEIGHBOR_MARKER_ENABLED_EXTRA_PX : 0)
          let left: number
          let top: number
          if (offset.y === -1) {
            left = playerCenterX
            top = minIndex * cellStride - gap
          } else if (offset.x === 1) {
            left = maxIndex * cellStride + cellSize + gap
            top = playerCenterY
          } else if (offset.y === 1) {
            left = playerCenterX
            top = maxIndex * cellStride + cellSize + gap
          } else {
            left = minIndex * cellStride - gap
            top = playerCenterY
          }
          return {
            offset,
            direction,
            rotationClassName,
            enabled,
            style: { left, top },
            grid: { x: currentGrid.x + offset.x, y: currentGrid.y + offset.y },
          }
        })
        // The in-matrix filter only makes sense without an owner to
        // route to — an owned arbitrary grid always shows all 4, since
        // it never has real neighbors for isGridInWorld to accept.
        return ownerObjectId ? markers : markers.filter(({ grid }) => isGridInWorld(grid, props.world))
      })()
    : []

  const handleCellClick = React.useCallback(
    (target: CellPosition) => {
      // A drag that just released over this cell shouldn't also count
      // as a click-to-move — see justDraggedRef's own comment above.
      if (justDraggedRef.current) {
        justDraggedRef.current = false
        return
      }
      if (!localPlayer) return
      if (props.placementActive) {
        if (props.selectedInventoryItem?.kind !== 'eraser') {
          const key = `${target.x}-${target.y}`
          const object = gridObjectsByKey.get(key)
          if (object) {
            props.onSelectInventoryItem?.(inventoryItemForObject(object))
            return
          }
          const specialCell = specialCellsByKey.get(key)
          if (specialCell?.color) {
            props.onSelectInventoryItem?.(inventoryItemForColor(specialCell.color))
            return
          }
          if (specialCell?.shape) {
            props.onSelectInventoryItem?.(inventoryItemForShape(specialCell.shape))
            return
          }
        }
        props.onPlaceItem?.(target)
        return
      }
      if (
        !isAdjacent(localPlayer.position, target) ||
        isCellOccupiedByAnotherPlayer(target, currentGrid, props.players, props.localPlayerId ?? undefined)
      ) {
        return
      }
      props.onMove(target)
    },
    [
      localPlayer,
      props.localPlayerId,
      props.players,
      props.onMove,
      props.placementActive,
      props.selectedInventoryItem,
      props.onSelectInventoryItem,
      props.onPlaceItem,
      gridObjectsByKey,
      specialCellsByKey,
      currentGrid.x,
      currentGrid.y,
    ]
  )

  const handleNeighborGridClick = React.useCallback(
    (offset: GridCoord) => {
      props.onMoveToGrid(offset, ownerObjectId)
    },
    [props.onMoveToGrid, ownerObjectId]
  )

  const paintCell = React.useCallback((gesture: NonNullable<typeof paintGestureRef.current>, cell: CellPosition) => {
    const key = cellPositionKey(cell)
    if (gesture.paintedCells.has(key)) return
    gesture.paintedCells.add(key)
    // Painting intentionally bypasses normal placement-mode picking: a
    // stroke keeps its initially held item even when crossing content.
    props.onPlaceItem?.(cell)
  }, [props.onPlaceItem])

  const activatePaintGesture = React.useCallback((gesture: NonNullable<typeof paintGestureRef.current>) => {
    if (gesture.longPressTimeout !== null) window.clearTimeout(gesture.longPressTimeout)
    gesture.longPressTimeout = null
    gesture.active = true
    // A long press/double-click stroke wins over free-camera panning as
    // soon as it activates, even if the pending pointer began in camera
    // mode.
    dragRef.current = null
    paintCell(gesture, gesture.startCell)
    viewportRef.current?.setPointerCapture(gesture.pointerId)
  }, [paintCell])

  // Free-camera drag-to-pan and placement painting share the viewport.
  // A placement press is pending until it becomes a long-press/double
  // click stroke; an active stroke owns the pointer and takes priority
  // over camera movement.
  const handlePanPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      const startCell = gridCellFromElement(event.target instanceof Element ? event.target : null)
      if (props.placementActive && startCell) {
        const now = Date.now()
        const previousTap = lastPlacementTapRef.current
        const isDoubleClick =
          previousTap !== null &&
          now - previousTap.timestamp <= DOUBLE_CLICK_MS &&
          previousTap.cell.x === startCell.x &&
          previousTap.cell.y === startCell.y
        const gesture = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startCell,
          longPressTimeout: null as number | null,
          active: false,
          lastCell: startCell,
          paintedCells: new Set<string>(),
        }
        paintGestureRef.current = gesture
        if (isDoubleClick) {
          lastPlacementTapRef.current = null
          activatePaintGesture(gesture)
          return
        }
        gesture.longPressTimeout = window.setTimeout(() => {
          if (paintGestureRef.current === gesture) activatePaintGesture(gesture)
        }, LONG_PRESS_MS)
      }
      if (!props.freeCameraActive) return
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOffset: cameraOffset,
        moved: false,
      }
    },
    [props.placementActive, props.freeCameraActive, cameraOffset, activatePaintGesture]
  )

  const handlePanPointerMove = React.useCallback(
    (event: React.PointerEvent) => {
      const paintGesture = paintGestureRef.current
      if (paintGesture?.pointerId === event.pointerId) {
        if (paintGesture.active) {
          const cell = gridCellAtPointer(event.clientX, event.clientY)
          if (!cell) return
          for (const crossedCell of cellsAlongLine(paintGesture.lastCell, cell)) paintCell(paintGesture, crossedCell)
          paintGesture.lastCell = cell
          return
        }
        const dx = event.clientX - paintGesture.startX
        const dy = event.clientY - paintGesture.startY
        if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
          if (paintGesture.longPressTimeout !== null) window.clearTimeout(paintGesture.longPressTimeout)
          paintGestureRef.current = null
        }
      }
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const screenDx = event.clientX - drag.startClientX
      const screenDy = event.clientY - drag.startClientY
      // Below this, treat it as a tap rather than a drag — lets a plain
      // click-to-move still land cleanly despite tiny pointer jitter.
      if (!drag.moved && Math.hypot(screenDx, screenDy) < 4) return
      drag.moved = true
      const { dx, dy } = screenToLocalSpace(screenDx, screenDy)
      const cellPx = cellSize + gapSize
      if (cellPx <= 0) return
      const maxOffset = Math.max(0, props.world.boardSize - props.viewBoardSize)
      setCameraOffset({
        x: Math.min(maxOffset, Math.max(0, drag.startOffset.x - dx / cellPx)),
        y: Math.min(maxOffset, Math.max(0, drag.startOffset.y - dy / cellPx)),
      })
    },
    [cellSize, gapSize, props.world.boardSize, props.viewBoardSize, paintCell]
  )

  const handlePanPointerUp = React.useCallback((event: React.PointerEvent) => {
    const paintGesture = paintGestureRef.current
    if (paintGesture?.pointerId === event.pointerId) {
      paintGestureRef.current = null
      if (paintGesture.longPressTimeout !== null) window.clearTimeout(paintGesture.longPressTimeout)
      if (paintGesture.active) {
        // Pointer-up is followed by a synthetic click; it must not pick
        // or place a second time after the completed paint stroke.
        justDraggedRef.current = true
        setTimeout(() => {
          justDraggedRef.current = false
        }, 0)
        return
      }
      lastPlacementTapRef.current = { cell: paintGesture.startCell, timestamp: Date.now() }
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.moved) {
      // Deferred so the click event that immediately follows this
      // pointer-up (same gesture, same target) still sees this as true
      // and gets suppressed by handleCellClick — otherwise releasing a
      // drag over a cell button would also fire its click and move the
      // player there.
      justDraggedRef.current = true
      setTimeout(() => {
        justDraggedRef.current = false
      }, 0)
    }
  }, [])

  // Camera offset converted from cell-index units to pixels, applied as
  // a translate to both gridRef and the escape-layer div below (see
  // their comments) — negative because panning to reveal cells further
  // right/down means sliding the content left/up underneath the fixed
  // viewport window.
  const cameraOffsetPx = {
    x: cameraOffset.x * (cellSize + gapSize),
    y: cameraOffset.y * (cellSize + gapSize),
  }

  // The true board's full rendered content size — what gridRef actually
  // needs to hold all boardSize cells at the current (viewBoardSize-
  // derived) cellSize.
  const trueContentSizePx = props.world.boardSize * cellSize + (props.world.boardSize - 1) * gapSize
  // The frame's own outer (border-box) size: content size plus its
  // border-4 (4px) + p-3 (12px) on each side — the same 16px inset the
  // escape-layer div below already replicates via its own borderWidth
  // trick.
  const frameSidePx = trueContentSizePx + 32

  // Same-grid players currently outside the rendered board-cell range
  // or the real visible screen each get an off-screen indicator bubble.
  // The screen check is not the same as
  // "outside boardSide" (the small viewBoardSize camera reference
  // window): content bleeding past that window still renders and is
  // genuinely visible on screen (see the viewport's own comment
  // above), so visibility has to be checked in real screen space, via
  // the same rotation used to place the bubble — otherwise a player
  // who's still plainly on screen gets a bubble anyway.
  const offScreenPlayers =
    SHOW_OFFSCREEN_INDICATORS && localPlayer
      ? playerEntries.reduce<
          { playerId: string; color: CubeColor; avatarUrl: string | null; left: number; top: number }[]
        >((bubbles, [playerId, player]) => {
          if (playerId === props.localPlayerId) return bubbles
          const cameraCenterLocalX = cameraOffsetPx.x + boardSide / 2
          const cameraCenterLocalY = cameraOffsetPx.y + boardSide / 2
          const localDx = player.position.x * (cellSize + gapSize) - cameraCenterLocalX
          const localDy = player.position.y * (cellSize + gapSize) - cameraCenterLocalY
          const { dx, dy } = rotateToScreenSpace(localDx, localDy)
          const screenX = window.innerWidth / 2 + dx
          const screenY = window.innerHeight / 2 + dy
          const isVisible =
            isPositionInBoardCellRange(player.position, boardCellRange) &&
            screenX >= 0 &&
            screenX <= window.innerWidth &&
            screenY >= 0 &&
            screenY <= window.innerHeight
          if (isVisible) return bubbles
          const { left, top } = clampToScreenEdge(dx, dy, window.innerWidth, window.innerHeight)
          bubbles.push({ playerId, color: player.color, avatarUrl: props.avatarUrls[playerId] ?? null, left, top })
          return bubbles
        }, [])
      : []

  // Resolved fresh every render rather than captured when the bubble was
  // tapped, so the dialog closes on its own if that player leaves or
  // moves to another grid while it's open.
  const bubblePlayer = bubblePlayerId ? props.players[bubblePlayerId] : undefined

  // An object hops when either counter moves: objectJumpKeys (this
  // component's own, bumped by a real position change) or props.objectJumps
  // (the host's explicit "replay it" signal). Both only ever increase, so
  // their sum only ever increases too — and any increase remounts the
  // cube-jump wrapper, which is what actually replays the animation. The
  // grid check is what the deleted objectJump effect used to do: a bump
  // that arrived while the player was elsewhere must not fire on return.
  function objectJumpKeyFor(objectId: string): number {
    const jump = props.objectJumps[objectId]
    const hostBump = jump && jump.grid.x === currentGrid.x && jump.grid.y === currentGrid.y ? jump.count : 0
    return (objectJumpKeys[objectId] ?? 0) + hostBump
  }

  return (
    <>
    <div className="relative inline-block rotate-45">
        <div
          aria-hidden="true"
          className="absolute rounded-4xl bg-game-ink transition-transform duration-300 ease-out"
          style={{
            width: frameSidePx,
            height: frameSidePx,
            transform: `translate(${16 - cameraOffsetPx.x}px, ${16 - cameraOffsetPx.y}px)`,
          }}
        />
        {/* Escape layer for the neighbor-grid triangles: same trick as
            the ObjectActionDialog layer further below (transparent
            borderWidth: 16 reproduces gridRef's content-box origin, so
            each marker's left/top — computed in true-board pixel space,
            see neighborMarkers above — lands on the right spot), same
            camera translate so markers pan in lockstep with the board
            instead of following the player at a fixed screen distance.
            pointer-events-none on the wrapper, opted back in per-marker
            (see NeighborGridMarker), so it doesn't intercept clicks
            meant for the board. z-10: below the dialog layer's z-30,
            above the board's own default-stacked content. */}
        <div
          className="pointer-events-none absolute inset-0 z-10 border-transparent transition-transform duration-300 ease-out"
          style={{
            width: boardSide,
            height: boardSide,
            borderWidth: 16,
            transform: `translate(${-cameraOffsetPx.x}px, ${-cameraOffsetPx.y}px)`,
          }}
        >
          {neighborMarkers.map((marker) => (
            <NeighborGridMarker
              key={ownerObjectId ? marker.direction : `${marker.grid.x}-${marker.grid.y}`}
              rotationClassName={marker.rotationClassName}
              style={marker.style}
              color={ownerObjectId ? gridColor(currentGrid, props.gridColors) : gridColor(marker.grid, props.gridColors)}
              enabled={marker.enabled}
              onClick={() => handleNeighborGridClick(marker.offset)}
            />
          ))}
        </div>
        {/* Sizing reference only, not a clip: fixes the pixel size of a
            viewBoardSize-wide window so the metrics effect (cellSize)
            and the camera dead-zone/pan math both have something fixed
            to measure against. Deliberately has no overflow-hidden of
            its own — cells beyond the current viewBoardSize window must
            stay visible (spilling into the surrounding page/UI when
            boardSize > viewBoardSize), not be clipped away until
            panned exactly into place. Only the frame inside clips
            (overflow-hidden), and only at the true board edge, for the
            unrelated exit-slide animation. */}
        <div
          ref={viewportRef}
          className="relative"
          style={{
            width: boardSide,
            height: boardSide,
            touchAction: props.freeCameraActive || props.placementActive ? 'none' : undefined,
            cursor: props.freeCameraActive ? 'grab' : undefined,
          }}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={handlePanPointerUp}
          onPointerCancel={handlePanPointerUp}
        >
          <div
            className="relative rounded-4xl border-4 border-game-ink bg-white p-3 transition-transform duration-300 ease-out"
            // Current-grid indicator: an outline (not a second border, which
            // CSS doesn't support stacking) sitting flush just outside the
            // black border, following the same rounded corners.
            // overflow-hidden: clips an exiting object (see the layout
            // effect above) at the frame's own bounds — the *true* board
            // edge now (this frame is sized to boardSize, not the
            // viewport) — so it still visually slides under the border
            // and disappears, just correctly anchored to the real edge
            // instead of the viewport's.
            // The pan lives here, not on gridRef: this whole frame
            // slides underneath the fixed viewport above as the camera
            // moves.
            style={{
              width: frameSidePx,
              height: frameSidePx,
              outlineStyle: 'ridge',
              outlineWidth: '8px',
              outlineColor: gridColor(currentGrid, props.gridColors),
              transform: `translate(${-cameraOffsetPx.x}px, ${-cameraOffsetPx.y}px)`,
            }}
          >
            <div
              ref={gridRef}
              className="relative grid size-full gap-1"
              style={{
                // 1fr, not explicit px: the frame above is now sized to
                // fit exactly boardSize cells at cellSize each, so
                // auto-fill tracks compute the same size explicit px
                // tracks would have — simpler, and matches how this
                // worked before viewBoardSize existed.
                gridTemplateColumns: `repeat(${props.world.boardSize}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${props.world.boardSize}, minmax(0, 1fr))`,
              }}
            >
            {boardCellRange &&
              Array.from({ length: boardCellRange.cellCount }, (_, index) => {
                const x = boardCellRange.minX + (index % boardCellRange.columns)
                const y = boardCellRange.minY + Math.floor(index / boardCellRange.columns)
                const cell = { x, y }
                if (!isCellVisible(cell, props.world)) return null

                const key = `${x}-${y}`
                const shake = specialCellShakeKeys[key] ?? NO_SHAKE
                return (
                  <GridCell
                    key={key}
                    x={x}
                    y={y}
                    specialColor={specialCellsByKey.get(key)?.color}
                    shakeKey={shake.key}
                    shakeDirection={shake.direction}
                    clickable={
                      !!localPlayer &&
                      (props.placementActive ||
                        (isAdjacent(localPlayer.position, cell) &&
                          !isCellOccupiedByAnotherPlayer(
                            cell,
                            currentGrid,
                            props.players,
                            props.localPlayerId ?? undefined
                          )))
                    }
                    onCellClick={handleCellClick}
                  />
                )
              })}

            {props.specialCells.filter((cell) => cell.shape).map((cell) => (
              <GridShapeBadge
                key={`${cell.position.x}-${cell.position.y}`}
                cell={cell}
                boardCellRange={boardCellRange}
                cellSize={cellSize}
                gapSize={gapSize}
                shakeKey={(specialCellShakeKeys[`${cell.position.x}-${cell.position.y}`] ?? NO_SHAKE).key}
                shakeDirection={(specialCellShakeKeys[`${cell.position.x}-${cell.position.y}`] ?? NO_SHAKE).direction}
              />
            ))}

            {[...props.gridObjects, ...Object.values(exitingObjects)].map((object) => (
              <GridObjectBadge
                key={`${object.id}`}
                object={object}
                boardCellRange={boardCellRange}
                jumpKey={objectJumpKeyFor(object.id)}
                cellSize={cellSize}
                gapSize={gapSize}
                boardSize={props.world.boardSize}
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
                boardCellRange={boardCellRange}
                color={player.color}
                jumpKey={jumpKeys[playerId] ?? 0}
                cellSize={cellSize}
                gapSize={gapSize}
                avatarUrl={props.avatarUrls[playerId] ?? null}
                isHost={playerId === props.hostPlayerId}
                isLocalPlayer={playerId === props.localPlayerId}
                boardSize={props.world.boardSize}
                placementActive={!!props.placementActive}
                onSelect={props.onSelectPlayer}
              />
            ))}
            </div>
          </div>
        </div>
        {/* Sibling of the viewport, rendered after it (unlike the
            neighbor markers above, which render before): NeighborGridMarker
            only needs to sit outside the viewport's rounded edge, but this
            needs to visually paint on top of it too, since a dialog offset
            near a board edge overlaps the viewport's own body. A
            transparent border matching the frame's own border-4 + p-3
            (16px total — not padding, which absolutely-positioned children
            ignore) reproduces gridRef's content-box origin here, so
            ObjectActionDialog's cellLeft/cellTop math (unchanged) still
            lands on the right cell despite rendering one level up, clear
            of the frame's own overflow-hidden clip (see its comment
            above) — the viewport itself doesn't clip.
            z-30: rendering last isn't enough on its own — the host star
            badge and the neighbor markers are z-10, and a positive
            z-index always paints above z-index:auto siblings whatever
            the DOM order says. This only competes inside this wrapper's
            own stacking context (its rotate-45 creates one), so the
            value answers the board's z-10s alone and deliberately
            doesn't chase the room chrome's z-20 — that same stacking
            context puts it out of reach at any value. Same translate as
            gridRef, same amount: this div starts at the same origin
            relative to the outer wrapper (both are direct children of
            it), so panning both by the identical vector keeps
            ObjectActionDialog's math lined up with gridRef's content
            without touching that math itself. */}
        <div
          className="pointer-events-none absolute inset-0 z-30 border-transparent transition-transform duration-300 ease-out"
          style={{
            width: boardSide,
            height: boardSide,
            borderWidth: 16,
            transform: `translate(${-cameraOffsetPx.x}px, ${-cameraOffsetPx.y}px)`,
          }}
        >
          {!props.placementActive && localPlayer &&
            props.gridObjects
              .filter(
                (object) =>
                  getObjectActionsSource(object.type) !== undefined && isAdjacent(localPlayer.position, object.position)
              )
              .map((object) => (
                <ObjectActionDialog
                  key={object.id}
                  object={object}
                  playerPosition={localPlayer.position}
                  cellSize={cellSize}
                  gapSize={gapSize}
                  onTriggerAction={props.onTriggerObjectAction}
                  resolveActionNames={props.resolveObjectActionNames}
                />
              ))}
        </div>
      </div>
    {SHOW_OFFSCREEN_INDICATORS && (
      <div className="pointer-events-none fixed inset-0 z-10">
        {offScreenPlayers.map((bubble) => (
          <OffScreenPlayerBubble
            key={bubble.playerId}
            color={bubble.color}
            avatarUrl={bubble.avatarUrl}
            left={bubble.left}
            top={bubble.top}
            onClick={() => setBubblePlayerId(bubble.playerId)}
          />
        ))}
      </div>
    )}
    {/* Driven off the player still being in props.players rather than
        bubblePlayerId alone: someone who leaves (or crosses into another
        grid) mid-dialog would otherwise leave it open with an empty
        title, and the teleport behind it would no-op anyway. */}
    {bubblePlayer && (
      <PlayerBubbleDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) setBubblePlayerId(null)
        }}
        username={bubblePlayer.username || 'Joueur'}
        onTeleport={() => props.onTeleportToPlayer(bubblePlayerId!)}
      />
    )}
    </>
  )
}

export { GameGrid }
