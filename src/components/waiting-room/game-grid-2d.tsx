import * as React from 'react'
import { Application, extend, useTick } from '@pixi/react'
import 'pixi.js/accessibility'
import {
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from 'pixi.js'

import type { GameGrid as LegacyGameGrid } from '@/components/waiting-room/game-grid'
import { ObjectActionMenu2D } from '@/components/waiting-room/object-action-menu-2d'
import { PlayerBubbleDialog } from '@/components/waiting-room/player-bubble-dialog'
import { CUBE_COLOR_PALETTE, type CubeColor } from '@/lib/cube-colors'
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
  getObjectView,
  MAX_CHANNEL,
  objectAt,
  type GridObject,
} from '@/lib/game-objects'
import { SPECIAL_CELL_OPACITY, type CellShape, type SpecialCell } from '@/lib/special-cells'
import {
  boardEdgeDirections,
  boardEdgeRange,
  gridKey,
  isAdjacent,
  isArbitraryGrid,
  isCellOccupiedByAnotherPlayer,
  isCellVisible,
  isGridInWorld,
  type CellPosition,
  type GridCoord,
} from '@/lib/world'

extend({ Container, Graphics, Sprite, Text })

type GameGrid2DProps = React.ComponentProps<typeof LegacyGameGrid>

const BOARD_SAFE_FRACTION = 0.9
const CAMERA_EDGE_MARGIN = 1
const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE_TOLERANCE_PX = 10
const DOUBLE_CLICK_MS = 300
const OBJECT_EXIT_DURATION_MS = 300
const MOVE_DURATION_MS = 300
const JUMP_DURATION_MS = 280
const SHAKE_DURATION_MS = 220
const CELL_GAP_PX = 4
const FRAME_INSET_PX = 16
const NEIGHBOR_MARKER_GAP_PX = 24
const NEIGHBOR_MARKER_ENABLED_EXTRA_PX = 12
const OFFSCREEN_INDICATOR_SIZE_PX = 32
const OFFSCREEN_INDICATOR_EDGE_MARGIN_PX = OFFSCREEN_INDICATOR_SIZE_PX / 2 + 8
const SHOW_OFFSCREEN_INDICATORS = true
const BOARD_ROTATION = Math.PI / 4
const INK = 0x16171d
const WHITE = 0xffffff
const YELLOW = 0xffd23f
// PixiJS accepts `canvas` in its renderer preference list. @pixi/react
// 8.0.5 narrows this prop's declaration to WebGL/WebGPU even though it
// forwards the value unchanged to PixiJS's Application.init.
const RENDERER_PREFERENCE = ['webgl', 'canvas'] as unknown as React.ComponentProps<typeof Application>['preference']
const releasableTextureUsers = new Map<string, number>()
const releasableTextureUnloadTimers = new Map<string, number>()

const COLOR_VALUES: Record<CubeColor, number> = {
  red: 0xff3b3f,
  purple: 0x8b2fff,
  green: 0x1fc463,
  blue: 0x0ea5ff,
  orange: 0xdb8a3c,
  yellow: YELLOW,
  pink: 0xff4fa3,
  teal: 0x10c6b0,
  lime: 0xb5e61d,
  indigo: 0x5a4fff,
}

const DARK_COLOR_VALUES: Record<CubeColor, number> = {
  red: 0xc4262e,
  purple: 0x6b23c4,
  green: 0x17974c,
  blue: 0x0b7fc7,
  orange: 0xb06f2f,
  yellow: 0xd1a819,
  pink: 0xc43a7d,
  teal: 0x0c9787,
  lime: 0x8fb414,
  indigo: 0x443bc4,
}

const ADJACENT_DIRECTIONS: readonly GridCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

interface BoardCellRange {
  minX: number
  maxX: number
  minY: number
  maxY: number
  columns: number
  rows: number
  cellCount: number
}

interface PlacementGesture {
  pointerId: number
  startX: number
  startY: number
  startCell: CellPosition
  longPressTimeout: number | null
  mode: 'paint' | 'pick'
  itemToPick: InventoryItem | null
  active: boolean
  lastCell: CellPosition
  paintedCells: Set<string>
}

interface AnimationRegistry {
  add(callback: (now: number) => boolean): () => void
  tick(now: number): void
}

interface NeighborMarker {
  offset: GridCoord
  direction: 'top' | 'right' | 'bottom' | 'left'
  position: { x: number; y: number }
  rotation: number
  enabled: boolean
  color: number
  key: string
}

interface OffscreenPlayer {
  playerId: string
  color: CubeColor
  avatarUrl: string | null
  left: number
  top: number
}

function createAnimationRegistry(): AnimationRegistry {
  const callbacks = new Set<(now: number) => boolean>()
  return {
    add(callback) {
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    },
    tick(now) {
      for (const callback of callbacks) {
        if (!callback(now)) callbacks.delete(callback)
      }
    },
  }
}

function AnimationTicker(props: { registry: AnimationRegistry }) {
  const tick = React.useCallback(() => props.registry.tick(performance.now()), [props.registry])
  useTick(tick)
  return null
}

function computeBoardSidePx(viewBoardSize: number, viewportWidth: number): number {
  const reachFactor = Math.SQRT2 * (1 + 1 / viewBoardSize)
  return (viewportWidth * BOARD_SAFE_FRACTION) / reachFactor
}

function centeredCameraOffset(boardSize: number, viewBoardSize: number): GridCoord {
  const maxOffset = Math.max(0, boardSize - viewBoardSize)
  const centeredOffset = (boardSize - viewBoardSize) / 2
  const offset = Math.min(maxOffset, Math.max(0, centeredOffset))
  return { x: offset, y: offset }
}

function useViewportSize() {
  const [size, setSize] = React.useState(() => ({
    width: typeof window === 'undefined' ? 390 : window.innerWidth,
    height: typeof window === 'undefined' ? 844 : window.innerHeight,
  }))

  React.useEffect(() => {
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return size
}

function isPositionInRange(position: CellPosition, range: BoardCellRange | null): boolean {
  return !!range &&
    position.x >= range.minX &&
    position.x <= range.maxX &&
    position.y >= range.minY &&
    position.y <= range.maxY
}

function cellPositionKey(position: CellPosition): string {
  return `${position.x}-${position.y}`
}

function compareObjectLayers(a: GridObject, b: GridObject): number {
  return getObjectView(a) - getObjectView(b) || a.id.localeCompare(b.id)
}

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

function rotateToScreenSpace(localDx: number, localDy: number): { x: number; y: number } {
  const cosine = Math.cos(BOARD_ROTATION)
  const sine = Math.sin(BOARD_ROTATION)
  return {
    x: localDx * cosine - localDy * sine,
    y: localDx * sine + localDy * cosine,
  }
}

function screenToBoardSpace(screenDx: number, screenDy: number): { x: number; y: number } {
  const cosine = Math.cos(BOARD_ROTATION)
  const sine = Math.sin(BOARD_ROTATION)
  return {
    x: screenDx * cosine + screenDy * sine,
    y: -screenDx * sine + screenDy * cosine,
  }
}

function clampFromPointToScreenEdge(
  originX: number,
  originY: number,
  dx: number,
  dy: number,
  screenWidth: number,
  screenHeight: number
): { left: number; top: number } {
  const minX = OFFSCREEN_INDICATOR_EDGE_MARGIN_PX
  const maxX = screenWidth - OFFSCREEN_INDICATOR_EDGE_MARGIN_PX
  const minY = OFFSCREEN_INDICATOR_EDGE_MARGIN_PX
  const maxY = screenHeight - OFFSCREEN_INDICATOR_EDGE_MARGIN_PX
  const scaleX = dx > 0 ? (maxX - originX) / dx : dx < 0 ? (minX - originX) / dx : Infinity
  const scaleY = dy > 0 ? (maxY - originY) / dy : dy < 0 ? (minY - originY) / dy : Infinity
  const scale = Math.max(0, Math.min(scaleX, scaleY))
  return { left: originX + dx * scale, top: originY + dy * scale }
}

function gridColorValue(grid: GridCoord, colors: GameGrid2DProps['gridColors']): number {
  return COLOR_VALUES[colors[gridKey(grid)] ?? 'red']
}

function jumpTransform(progress: number): { scaleX: number; scaleY: number; y: number; rotation: number } {
  if (progress >= 1) return { scaleX: 1, scaleY: 1, y: 0, rotation: 0 }
  if (progress < 0.2) {
    const p = progress / 0.2
    return { scaleX: 1 + 0.24 * p, scaleY: 1 - 0.24 * p, y: 0.04 * p, rotation: -0.07 * p }
  }
  if (progress < 0.45) {
    const p = (progress - 0.2) / 0.25
    return { scaleX: 1.24 - 0.44 * p, scaleY: 0.76 + 0.44 * p, y: 0.04 - 0.28 * p, rotation: -0.07 + 0.12 * p }
  }
  if (progress < 0.7) {
    const p = (progress - 0.45) / 0.25
    return { scaleX: 0.8 + 0.32 * p, scaleY: 1.2 - 0.3 * p, y: -0.24 + 0.26 * p, rotation: 0.05 - 0.07 * p }
  }
  const p = (progress - 0.7) / 0.3
  return { scaleX: 1.12 - 0.12 * p, scaleY: 0.9 + 0.1 * p, y: 0.02 * (1 - p), rotation: -0.02 * (1 - p) }
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

function useTexture(url: string | null, releaseWhenUnused = false): Texture {
  const [texture, setTexture] = React.useState(Texture.EMPTY)

  React.useEffect(() => {
    let cancelled = false
    if (!url) {
      setTexture(Texture.EMPTY)
      return
    }
    if (releaseWhenUnused) {
      const pendingUnload = releasableTextureUnloadTimers.get(url)
      if (pendingUnload !== undefined) {
        window.clearTimeout(pendingUnload)
        releasableTextureUnloadTimers.delete(url)
      }
      releasableTextureUsers.set(url, (releasableTextureUsers.get(url) ?? 0) + 1)
    }
    void Assets.load<Texture>(url).then((loaded) => {
      if (!cancelled) setTexture(loaded)
    }).catch((error: unknown) => {
      if (!cancelled) console.error(`Failed to load Pixi texture: ${url}`, error)
    })
    return () => {
      cancelled = true
      if (!releaseWhenUnused) return
      const remainingUsers = Math.max(0, (releasableTextureUsers.get(url) ?? 1) - 1)
      if (remainingUsers > 0) {
        releasableTextureUsers.set(url, remainingUsers)
        return
      }
      releasableTextureUsers.delete(url)
      const timeoutId = window.setTimeout(() => {
        releasableTextureUnloadTimers.delete(url)
        if (releasableTextureUsers.has(url)) return
        void Assets.unload(url).catch((error: unknown) => {
          console.error(`Failed to unload Pixi texture: ${url}`, error)
        })
      }, 0)
      releasableTextureUnloadTimers.set(url, timeoutId)
    }
  }, [releaseWhenUnused, url])

  return texture
}

function containTexture(texture: Texture, maxSize: number): { width: number; height: number } {
  const width = Math.max(1, texture.width)
  const height = Math.max(1, texture.height)
  const scale = maxSize / Math.max(width, height)
  return { width: width * scale, height: height * scale }
}

function coverTexture(texture: Texture, size: number): { width: number; height: number } {
  const width = Math.max(1, texture.width)
  const height = Math.max(1, texture.height)
  const scale = size / Math.min(width, height)
  return { width: width * scale, height: height * scale }
}

function AvatarSprite2D(props: { texture: Texture; size: number; x: number; y: number }) {
  const spriteRef = React.useRef<Sprite>(null)
  const maskRef = React.useRef<Graphics>(null)
  const dimensions = coverTexture(props.texture, props.size)
  const drawMask = React.useCallback((graphics: Graphics) => {
    graphics.clear().roundRect(-props.size / 2, -props.size / 2, props.size, props.size, props.size * 0.2).fill(WHITE)
  }, [props.size])

  React.useLayoutEffect(() => {
    const sprite = spriteRef.current
    if (!sprite) return
    sprite.mask = maskRef.current
    return () => {
      sprite.mask = null
    }
  }, [props.texture, props.size])

  return (
    <pixiContainer x={props.x} y={props.y} rotation={-BOARD_ROTATION}>
      <pixiGraphics ref={maskRef} draw={drawMask} />
      <pixiSprite
        ref={spriteRef}
        texture={props.texture}
        anchor={0.5}
        width={dimensions.width}
        height={dimensions.height}
      />
    </pixiContainer>
  )
}

function BoardFrame(props: { contentSize: number; color: number }) {
  const draw = React.useCallback((graphics: Graphics) => {
    graphics.clear()
    graphics
      .roundRect(-FRAME_INSET_PX - 8, -FRAME_INSET_PX - 8, props.contentSize + 48, props.contentSize + 48, 36)
      .stroke({ color: props.color, width: 8, alignment: 0.5 })
      .roundRect(-FRAME_INSET_PX, -FRAME_INSET_PX, props.contentSize + 32, props.contentSize + 32, 32)
      .fill({ color: INK })
      .roundRect(-12, -12, props.contentSize + 24, props.contentSize + 24, 26)
      .fill({ color: WHITE })
  }, [props.color, props.contentSize])

  return <pixiGraphics draw={draw} zIndex={-1000} />
}

interface CellLayerProps {
  range: BoardCellRange | null
  world: GameGrid2DProps['world']
  stride: number
  cellSize: number
  localPlayer: GameGrid2DProps['players'][string] | undefined
  currentGrid: GridCoord
  players: GameGrid2DProps['players']
  localPlayerId: string | null
  placementActive: boolean
  specialCellsByKey: Map<string, SpecialCell>
  shakingCellKeys: ReadonlySet<string>
}

const CellLayer = React.memo(function CellLayer(props: CellLayerProps) {
  const draw = React.useCallback((graphics: Graphics) => {
    graphics.clear()
    const range = props.range
    if (!range) return
    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        const position = { x, y }
        if (!isCellVisible(position, props.world)) continue
        if (props.shakingCellKeys.has(cellPositionKey(position))) continue
        const clickable = !!props.localPlayer && (
          props.placementActive ||
          (isAdjacent(props.localPlayer.position, position) &&
            !isCellOccupiedByAnotherPlayer(position, props.currentGrid, props.players, props.localPlayerId ?? undefined))
        )
        const specialColor = props.specialCellsByKey.get(cellPositionKey(position))?.color
        graphics
          .roundRect(x * props.stride, y * props.stride, props.cellSize, props.cellSize, 6)
          .fill(specialColor
            ? { color: COLOR_VALUES[specialColor], alpha: SPECIAL_CELL_OPACITY }
            : { color: INK, alpha: clickable ? 0.12 : 0.05 })
      }
    }
  }, [props])

  return <pixiGraphics draw={draw} zIndex={0} />
})

const CellShakeOverlay2D = React.memo(function CellShakeOverlay2D(props: {
  position: CellPosition
  color?: CubeColor
  clickable: boolean
  cellSize: number
  stride: number
  direction: GridCoord
  startedAt: number
  registry: AnimationRegistry
}) {
  const ref = React.useRef<Container>(null)
  const draw = React.useCallback((graphics: Graphics) => {
    graphics
      .clear()
      .roundRect(-props.cellSize / 2, -props.cellSize / 2, props.cellSize, props.cellSize, 6)
      .fill(props.color
        ? { color: COLOR_VALUES[props.color], alpha: SPECIAL_CELL_OPACITY }
        : { color: INK, alpha: props.clickable ? 0.12 : 0.05 })
  }, [props.cellSize, props.clickable, props.color])

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    if (performance.now() - props.startedAt >= SHAKE_DURATION_MS) {
      node.visible = false
      return
    }
    node.visible = true
    return props.registry.add((now) => {
      const progress = Math.min(1, (now - props.startedAt) / SHAKE_DURATION_MS)
      const wave = Math.sin(progress * Math.PI * 4) * (1 - progress)
      node.x = props.position.x * props.stride + props.cellSize / 2 + props.direction.x * wave * props.cellSize * 0.16
      node.y = props.position.y * props.stride + props.cellSize / 2 + props.direction.y * wave * props.cellSize * 0.16
      const squeeze = wave * 0.2
      node.scale.set(
        1 + (props.direction.y !== 0 ? squeeze : -squeeze),
        1 + (props.direction.x !== 0 ? squeeze : -squeeze)
      )
      if (progress >= 1) {
        node.position.set(
          props.position.x * props.stride + props.cellSize / 2,
          props.position.y * props.stride + props.cellSize / 2
        )
        node.scale.set(1)
        return false
      }
      return true
    })
  }, [props.cellSize, props.direction.x, props.direction.y, props.position.x, props.position.y, props.registry, props.startedAt, props.stride])

  return (
    <pixiContainer
      ref={ref}
      x={props.position.x * props.stride + props.cellSize / 2}
      y={props.position.y * props.stride + props.cellSize / 2}
      zIndex={50}
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  )
})

function drawStar(graphics: Graphics, radius: number) {
  const points: number[] = []
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5 + Math.PI / 4
    const pointRadius = index % 2 === 0 ? radius : radius * 0.45
    points.push(Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius)
  }
  graphics.poly(points, true)
}

const ShapeBadge2D = React.memo(function ShapeBadge2D(props: {
  cell: SpecialCell
  cellSize: number
  stride: number
  shakeKey: number
  shakeDirection: GridCoord
  registry: AnimationRegistry
}) {
  const ref = React.useRef<Container>(null)
  const size = props.cellSize * 0.85
  const draw = React.useCallback((graphics: Graphics) => {
    graphics.clear()
    const half = size / 2
    const stroke = { color: INK, alpha: 0.4, width: 2 }
    switch (props.cell.shape as CellShape) {
      case 'circle':
        graphics.circle(0, 0, half * 0.88).stroke(stroke)
        break
      case 'triangle':
        graphics.poly([0, -half, half * 0.9, half, -half * 0.9, half], true).stroke(stroke)
        break
      case 'square':
        graphics.rect(-half * 0.78, -half * 0.78, half * 1.56, half * 1.56).stroke(stroke)
        break
      case 'star':
        drawStar(graphics, half)
        graphics.stroke(stroke)
        break
    }
  }, [props.cell.shape, size])

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node || props.shakeKey <= 0) return
    const startedAt = performance.now()
    return props.registry.add((now) => {
      const progress = Math.min(1, (now - startedAt) / SHAKE_DURATION_MS)
      const wave = Math.sin(progress * Math.PI * 4) * (1 - progress)
      node.x = props.cell.position.x * props.stride + props.cellSize / 2 + props.shakeDirection.x * wave * props.cellSize * 0.16
      node.y = props.cell.position.y * props.stride + props.cellSize / 2 + props.shakeDirection.y * wave * props.cellSize * 0.16
      const squeeze = wave * 0.2
      node.scale.set(
        1 + (props.shakeDirection.y !== 0 ? squeeze : -squeeze),
        1 + (props.shakeDirection.x !== 0 ? squeeze : -squeeze)
      )
      if (progress >= 1) {
        node.scale.set(1)
        return false
      }
      return true
    })
  }, [props.cell.position.x, props.cell.position.y, props.cellSize, props.registry, props.shakeDirection.x, props.shakeDirection.y, props.shakeKey, props.stride])

  return (
    <pixiContainer
      ref={ref}
      x={props.cell.position.x * props.stride + props.cellSize / 2}
      y={props.cell.position.y * props.stride + props.cellSize / 2}
      zIndex={100}
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  )
})

const ObjectSprite2D = React.memo(function ObjectSprite2D(props: {
  object: GridObject
  cellSize: number
  stride: number
  boardSize: number
  animationToken: string
  appearedAt: number | undefined
  registry: AnimationRegistry
  initialPosition?: CellPosition
}) {
  const texture = useTexture(getObjectIconUrl(props.object.type, props.object.state))
  const ref = React.useRef<Container>(null)
  const targetX = props.object.position.x * props.stride + props.cellSize / 2
  const targetY = props.object.position.y * props.stride + props.cellSize / 2
  const initial = React.useRef(props.initialPosition ?? props.object.position)
  const initialPixels = React.useRef({
    x: initial.current.x * props.stride + props.cellSize / 2,
    y: initial.current.y * props.stride + props.cellSize / 2,
  })
  const assignRef = React.useCallback((node: Container | null) => {
    ref.current = node
    if (node) node.position.set(initialPixels.current.x, initialPixels.current.y)
  }, [])
  const lastTokenRef = React.useRef(props.animationToken)
  const iconScale = getObjectIconScale(props.object.type, props.object.state)
  const iconOffset = getObjectIconOffset(props.object.type, props.object.state)
  const badgeSize = props.cellSize * 0.7 * iconScale
  const iconDimensions = containTexture(texture, badgeSize)

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const fromX = node.x
    const fromY = node.y
    const tokenChanged = lastTokenRef.current !== props.animationToken
    lastTokenRef.current = props.animationToken
    const appearedRecently = props.appearedAt !== undefined && performance.now() - props.appearedAt < JUMP_DURATION_MS
    const shouldMove = Math.abs(fromX - targetX) > 0.01 || Math.abs(fromY - targetY) > 0.01
    const shouldJump = tokenChanged || appearedRecently || props.initialPosition !== undefined || shouldMove
    if (!shouldMove && !shouldJump) return
    const startedAt = performance.now()
    return props.registry.add((now) => {
      const moveProgress = Math.min(1, (now - startedAt) / MOVE_DURATION_MS)
      const eased = easeOutCubic(moveProgress)
      node.x = fromX + (targetX - fromX) * eased
      node.y = fromY + (targetY - fromY) * eased
      if (shouldJump) {
        const jumpProgress = Math.min(1, (now - startedAt) / JUMP_DURATION_MS)
        const transform = jumpTransform(jumpProgress)
        node.scale.set(transform.scaleX, transform.scaleY)
        node.pivot.y = transform.y * props.cellSize
        node.rotation = transform.rotation
      }
      if (moveProgress >= 1 && (!shouldJump || now - startedAt >= JUMP_DURATION_MS)) {
        node.position.set(targetX, targetY)
        node.scale.set(1)
        node.pivot.set(0)
        node.rotation = 0
        return false
      }
      return true
    })
  }, [props.animationToken, props.appearedAt, props.cellSize, props.initialPosition, props.registry, targetX, targetY])

  return (
    <pixiContainer
      ref={assignRef}
      zIndex={
        1000 +
        (props.object.position.y * props.boardSize + props.object.position.x) * MAX_CHANNEL +
        (MAX_CHANNEL - 1 - getObjectView(props.object))
      }
    >
      <pixiSprite
        texture={texture}
        anchor={0.5}
        x={iconOffset.x * props.cellSize}
        y={iconOffset.y * props.cellSize}
        width={iconDimensions.width}
        height={iconDimensions.height}
        rotation={-BOARD_ROTATION}
      />
    </pixiContainer>
  )
})

const PlayerSprite2D = React.memo(function PlayerSprite2D(props: {
  playerId: string
  position: CellPosition
  color: CubeColor
  avatarUrl: string | null
  cellSize: number
  stride: number
  boardSize: number
  currentGridKey: string
  appearedAt: number | undefined
  registry: AnimationRegistry
  isHost: boolean
  isLocal: boolean
}) {
  const avatarTexture = useTexture(props.avatarUrl, true)
  const ref = React.useRef<Container>(null)
  const initialTarget = React.useRef({
    x: props.position.x * props.stride + props.cellSize * 0.4,
    y: props.position.y * props.stride + props.cellSize * 0.42,
  })
  const assignRef = React.useCallback((node: Container | null) => {
    ref.current = node
    if (node) node.position.set(initialTarget.current.x, initialTarget.current.y)
  }, [])
  const targetX = props.position.x * props.stride + props.cellSize * 0.4
  const targetY = props.position.y * props.stride + props.cellSize * 0.42
  const drawBody = React.useCallback((graphics: Graphics) => {
    const size = props.cellSize
    graphics.clear()
    graphics
      .roundRect(-size * 0.38, -size * 0.37, size * 0.92, size * 0.92, size * 0.18)
      .fill({ color: DARK_COLOR_VALUES[props.color] })
      .stroke({ color: INK, width: Math.max(2, size * 0.06) })
      .roundRect(-size * 0.5, -size * 0.5, size * 0.83, size * 0.83, size * 0.18)
      .fill({ color: COLOR_VALUES[props.color] })
      .stroke({ color: INK, width: Math.max(3, size * 0.075) })
    if (props.isLocal) {
      graphics
        .roundRect(-size * 0.47, -size * 0.47, size * 0.77, size * 0.77, size * 0.16)
        .stroke({ color: YELLOW, width: Math.max(1.5, size * 0.025) })
    }
  }, [props.cellSize, props.color, props.isLocal])

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const fromX = node.x
    const fromY = node.y
    const appearedRecently = props.appearedAt !== undefined && performance.now() - props.appearedAt < JUMP_DURATION_MS
    const shouldMove = Math.abs(fromX - targetX) > 0.01 || Math.abs(fromY - targetY) > 0.01
    if (!shouldMove && !appearedRecently) return
    const startedAt = performance.now()
    return props.registry.add((now) => {
      const moveProgress = Math.min(1, (now - startedAt) / MOVE_DURATION_MS)
      const eased = easeOutCubic(moveProgress)
      node.x = fromX + (targetX - fromX) * eased
      node.y = fromY + (targetY - fromY) * eased
      const transform = jumpTransform(Math.min(1, (now - startedAt) / JUMP_DURATION_MS))
      node.scale.set(transform.scaleX, transform.scaleY)
      node.pivot.y = transform.y * props.cellSize
      node.rotation = transform.rotation
      if (moveProgress >= 1 && now - startedAt >= JUMP_DURATION_MS) {
        node.position.set(targetX, targetY)
        node.scale.set(1)
        node.pivot.set(0)
        node.rotation = 0
        return false
      }
      return true
    })
  }, [props.appearedAt, props.cellSize, props.registry, targetX, targetY])

  return (
    <pixiContainer
      key={`${props.playerId}:${props.currentGridKey}`}
      ref={assignRef}
      zIndex={
        1000 +
        (props.position.y * props.boardSize + props.position.x) * MAX_CHANNEL +
        (MAX_CHANNEL - 1)
      }
    >
      <pixiGraphics draw={drawBody} />
      {props.avatarUrl && (
        <AvatarSprite2D
          texture={avatarTexture}
          x={-props.cellSize * 0.09}
          y={-props.cellSize * 0.09}
          size={props.cellSize * 0.62}
        />
      )}
      {props.isHost && (
        <pixiText
          text="★"
          anchor={0.5}
          x={-props.cellSize * 0.48}
          y={-props.cellSize * 0.5}
          rotation={-BOARD_ROTATION}
          style={{
            fontFamily: 'Geist Variable, sans-serif',
            fontSize: Math.max(12, props.cellSize * 0.27),
            fontWeight: '900',
            fill: YELLOW,
            stroke: { color: INK, width: 3 },
          }}
        />
      )}
    </pixiContainer>
  )
})

const ObjectLayer2D = React.memo(function ObjectLayer2D(props: {
  objects: GridObject[]
  exitingObjects: Record<string, { object: GridObject; from: CellPosition }>
  objectJumps: GameGrid2DProps['objectJumps']
  currentGrid: GridCoord
  appearedAt: Map<string, number>
  cellSize: number
  stride: number
  boardSize: number
  registry: AnimationRegistry
}) {
  function animationToken(object: GridObject): string {
    const hostJump = props.objectJumps[object.id]
    const hostCount = hostJump &&
      hostJump.grid.x === props.currentGrid.x &&
      hostJump.grid.y === props.currentGrid.y
      ? hostJump.count
      : 0
    return String(hostCount)
  }

  return (
    <>
      {props.objects.map((object) => (
        <ObjectSprite2D
          key={object.id}
          object={object}
          cellSize={props.cellSize}
          stride={props.stride}
          boardSize={props.boardSize}
          animationToken={animationToken(object)}
          appearedAt={props.appearedAt.get(object.id) ?? performance.now()}
          registry={props.registry}
        />
      ))}
      {Object.values(props.exitingObjects).map(({ object, from }) => (
        <ObjectSprite2D
          key={`exit:${object.id}`}
          object={object}
          initialPosition={from}
          cellSize={props.cellSize}
          stride={props.stride}
          boardSize={props.boardSize}
          animationToken={animationToken(object)}
          appearedAt={undefined}
          registry={props.registry}
        />
      ))}
    </>
  )
})

const PlayerLayer2D = React.memo(function PlayerLayer2D(props: {
  entries: [string, GameGrid2DProps['players'][string]][]
  boardCellRange: BoardCellRange | null
  currentGridKey: string
  appearedAt: Map<string, number>
  avatarUrls: GameGrid2DProps['avatarUrls']
  hostPlayerId: string | null
  localPlayerId: string | null
  cellSize: number
  stride: number
  boardSize: number
  registry: AnimationRegistry
}) {
  return (
    <>
      {props.entries.filter(([, player]) => isPositionInRange(player.position, props.boardCellRange)).map(([playerId, player]) => (
        <PlayerSprite2D
          key={`${playerId}:${props.currentGridKey}`}
          playerId={playerId}
          position={player.position}
          color={player.color}
          avatarUrl={props.avatarUrls[playerId] ?? null}
          cellSize={props.cellSize}
          stride={props.stride}
          boardSize={props.boardSize}
          currentGridKey={props.currentGridKey}
          appearedAt={props.appearedAt.get(playerId) ?? performance.now()}
          registry={props.registry}
          isHost={playerId === props.hostPlayerId}
          isLocal={playerId === props.localPlayerId}
        />
      ))}
    </>
  )
})

function NeighborMarker2D(props: { marker: NeighborMarker; onClick: () => void }) {
  const size = 44
  const draw = React.useCallback((graphics: Graphics) => {
    graphics.clear()
    graphics
      .poly([0, -size * 0.5, size * 0.42, size * 0.42, -size * 0.42, size * 0.42], true)
      .fill({ color: props.marker.color, alpha: props.marker.enabled ? 1 : 0.45 })
      .stroke({ color: INK, width: 4, join: 'round' })
  }, [props.marker.color, props.marker.enabled])

  const stop = React.useCallback((event: FederatedPointerEvent) => event.stopPropagation(), [])
  const handleTap = React.useCallback((event: FederatedPointerEvent) => {
    event.stopPropagation()
    if (props.marker.enabled) props.onClick()
  }, [props])

  return (
    <pixiGraphics
      draw={draw}
      x={props.marker.position.x}
      y={props.marker.position.y}
      rotation={props.marker.rotation}
      zIndex={2_000_000_000}
      eventMode={props.marker.enabled ? 'static' : 'none'}
      cursor={props.marker.enabled ? 'pointer' : 'default'}
      accessible={props.marker.enabled}
      accessibleTitle="Grille voisine"
      accessibleType="button"
      tabIndex={props.marker.enabled ? 0 : -1}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerTap={handleTap}
    />
  )
}

function OffscreenPlayerBubble(props: OffscreenPlayer & { onClick: () => void }) {
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
      aria-label="Voir le joueur hors écran"
    >
      {props.avatarUrl && <img src={props.avatarUrl} alt="" className="size-full object-cover" />}
    </button>
  )
}

function GameGrid2D(props: GameGrid2DProps) {
  const {
    freeCameraActive,
    localPlayerId,
    onMove,
    onPlaceItem,
    onSelectInventoryItem,
    onSelectPlayer,
    placementActive,
    players,
    selectedInventoryItem,
  } = props
  const viewport = useViewportSize()
  const boardSide = computeBoardSidePx(props.viewBoardSize, viewport.width)
  const gapSize = CELL_GAP_PX
  const cellSize = Math.max(1, (boardSide - gapSize * (props.viewBoardSize - 1)) / props.viewBoardSize)
  const stride = cellSize + gapSize
  const contentSize = props.world.boardSize * cellSize + (props.world.boardSize - 1) * gapSize
  const canvasWidth = viewport.width
  const canvasHeight = Math.min(viewport.height, Math.max(boardSide, boardSide * Math.SQRT2 + 160))
  const [canvasElement, setCanvasElement] = React.useState<HTMLCanvasElement | null>(null)
  const [canvasBounds, setCanvasBounds] = React.useState<{ left: number; top: number } | null>(null)
  const boardContentRef = React.useRef<Container>(null)
  const boardMaskRef = React.useRef<Graphics>(null)
  const animationRegistry = React.useMemo(createAnimationRegistry, [])
  const [cameraOffset, setCameraOffset] = React.useState<GridCoord>(() => (
    centeredCameraOffset(props.world.boardSize, props.viewBoardSize)
  ))
  const [bubblePlayerId, setBubblePlayerId] = React.useState<string | null>(null)
  const [specialCellShakeKeys, setSpecialCellShakeKeys] = React.useState<Record<string, { key: number; direction: GridCoord; startedAt: number }>>({})
  const [exitingObjects, setExitingObjects] = React.useState<Record<string, { object: GridObject; from: CellPosition }>>({})
  const prevCameraGridRef = React.useRef<GridCoord>({ x: 0, y: 0 })
  const prevFreeCameraRef = React.useRef(false)
  const prevPlayersRef = React.useRef(props.players)
  const prevObjectsRef = React.useRef(props.gridObjects.objectsById)
  const prevGridRef = React.useRef<GridCoord>({ x: 0, y: 0 })
  const exitTimeoutsRef = React.useRef<Record<string, number>>({})
  const specialShakeTimeoutsRef = React.useRef<Record<string, number>>({})
  const objectAppearedAtRef = React.useRef(new Map<string, number>())
  const playerAppearedAtRef = React.useRef(new Map<string, number>())
  const initializedAppearancesRef = React.useRef(false)
  const dragRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    startOffset: GridCoord
    moved: boolean
  } | null>(null)
  const pointerDownRef = React.useRef<{ pointerId: number; cell: CellPosition | null; blockedByPlayer: boolean } | null>(null)
  const playerPressRef = React.useRef<{
    playerId: string
    cell: CellPosition
    pointerId: number
    startX: number
    startY: number
    timeoutId: number
  } | null>(null)
  const placementGestureRef = React.useRef<PlacementGesture | null>(null)
  const lastPlacementTapRef = React.useRef<{ cell: CellPosition; timestamp: number } | null>(null)

  const localPlayer = localPlayerId ? players[localPlayerId] : undefined
  const currentGrid = React.useMemo<GridCoord>(
    () => ({ x: localPlayer?.gridX ?? 0, y: localPlayer?.gridY ?? 0 }),
    [localPlayer?.gridX, localPlayer?.gridY]
  )
  const currentGridKey = gridKey(currentGrid)
  const localPlayerX = localPlayer?.position.x
  const localPlayerY = localPlayer?.position.y
  const gridObjectIdsByPosition = props.gridObjects.objectsByPosition[currentGridKey]

  if (!initializedAppearancesRef.current) {
    const now = typeof performance === 'undefined' ? 0 : performance.now()
    for (const objectId of Object.keys(props.gridObjects.objectsById)) objectAppearedAtRef.current.set(objectId, now)
    for (const playerId of Object.keys(props.players)) playerAppearedAtRef.current.set(playerId, now)
    initializedAppearancesRef.current = true
  }

  React.useEffect(() => {
    const exitTimeouts = exitTimeoutsRef.current
    const shakeTimeouts = specialShakeTimeoutsRef.current
    return () => {
      const placement = placementGestureRef.current
      if (placement && placement.longPressTimeout !== null) window.clearTimeout(placement.longPressTimeout)
      if (playerPressRef.current) window.clearTimeout(playerPressRef.current.timeoutId)
      Object.values(exitTimeouts).forEach((timeoutId) => window.clearTimeout(timeoutId))
      Object.values(shakeTimeouts).forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [])

  React.useLayoutEffect(() => {
    if (!canvasElement) return
    const canvas = canvasElement
    let animationFrame = 0
    function measureCanvas() {
      const rect = canvas.getBoundingClientRect()
      setCanvasBounds((current) => current?.left === rect.left && current.top === rect.top
        ? current
        : { left: rect.left, top: rect.top })
    }
    animationFrame = window.requestAnimationFrame(measureCanvas)
    const observer = new ResizeObserver(measureCanvas)
    observer.observe(canvas)
    window.addEventListener('scroll', measureCanvas, true)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('scroll', measureCanvas, true)
    }
  }, [canvasElement, canvasHeight, canvasWidth])

  React.useLayoutEffect(() => {
    const maxOffset = Math.max(0, props.world.boardSize - props.viewBoardSize)
    const freeCameraJustDisabled = prevFreeCameraRef.current && !props.freeCameraActive
    prevFreeCameraRef.current = !!props.freeCameraActive
    if (props.freeCameraActive) return

    if (!localPlayer) {
      const centered = centeredCameraOffset(props.world.boardSize, props.viewBoardSize)
      setCameraOffset((current) => (
        current.x === centered.x && current.y === centered.y ? current : centered
      ))
      return
    }

    const gridChanged = prevCameraGridRef.current.x !== currentGrid.x || prevCameraGridRef.current.y !== currentGrid.y
    prevCameraGridRef.current = currentGrid
    if (gridChanged || freeCameraJustDisabled) {
      const center = Math.floor((props.viewBoardSize - 1) / 2)
      setCameraOffset({
        x: Math.min(maxOffset, Math.max(0, localPlayer.position.x - center)),
        y: Math.min(maxOffset, Math.max(0, localPlayer.position.y - center)),
      })
      return
    }

    function clampAxis(playerPosition: number, current: number): number {
      if (playerPosition < current) return Math.max(0, playerPosition)
      if (playerPosition > current + props.viewBoardSize - CAMERA_EDGE_MARGIN) {
        return Math.min(maxOffset, playerPosition - (props.viewBoardSize - CAMERA_EDGE_MARGIN))
      }
      return Math.min(current, maxOffset)
    }

    setCameraOffset((current) => ({
      x: clampAxis(localPlayer.position.x, current.x),
      y: clampAxis(localPlayer.position.y, current.y),
    }))
  }, [currentGrid, localPlayer, props.freeCameraActive, props.viewBoardSize, props.world.boardSize])

  React.useEffect(() => {
    if (!props.specialCellShake) return
    if (props.specialCellShake.grid.x !== currentGrid.x || props.specialCellShake.grid.y !== currentGrid.y) return
    const key = cellPositionKey(props.specialCellShake.position)
    const startedAt = performance.now()
    if (specialShakeTimeoutsRef.current[key]) window.clearTimeout(specialShakeTimeoutsRef.current[key])
    setSpecialCellShakeKeys((current) => ({
      ...current,
      [key]: {
        key: (current[key]?.key ?? 0) + 1,
        direction: props.specialCellShake!.direction,
        startedAt,
      },
    }))
    specialShakeTimeoutsRef.current[key] = window.setTimeout(() => {
      delete specialShakeTimeoutsRef.current[key]
      setSpecialCellShakeKeys((current) => {
        if (current[key]?.startedAt !== startedAt) return current
        const copy = { ...current }
        delete copy[key]
        return copy
      })
    }, SHAKE_DURATION_MS + 20)
  }, [currentGrid, props.specialCellShake])

  React.useLayoutEffect(() => {
    const previous = prevPlayersRef.current
    const now = performance.now()
    for (const playerId of Object.keys(props.players)) {
      const prior = previous[playerId]
      if (!prior) playerAppearedAtRef.current.set(playerId, now)
    }
    for (const playerId of Object.keys(previous)) {
      if (!(playerId in props.players)) playerAppearedAtRef.current.delete(playerId)
    }
    prevPlayersRef.current = props.players
  }, [props.players])

  React.useLayoutEffect(() => {
    const previousGrid = prevGridRef.current
    const gridChanged = previousGrid.x !== currentGrid.x || previousGrid.y !== currentGrid.y
    prevGridRef.current = currentGrid
    const previous = prevObjectsRef.current
    const nextObjects = props.gridObjects.objectsById
    prevObjectsRef.current = nextObjects

    if (gridChanged) {
      const now = performance.now()
      for (const objectId of Object.keys(nextObjects)) objectAppearedAtRef.current.set(objectId, now)
      Object.values(exitTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId))
      for (const objectId of Object.keys(exitTimeoutsRef.current)) delete exitTimeoutsRef.current[objectId]
      setExitingObjects({})
      return
    }

    const now = performance.now()
    for (const objectId of Object.keys(nextObjects)) {
      const prior = previous[objectId]
      if (!prior) objectAppearedAtRef.current.set(objectId, now)
      if (objectId in exitTimeoutsRef.current) {
        window.clearTimeout(exitTimeoutsRef.current[objectId])
        delete exitTimeoutsRef.current[objectId]
        setExitingObjects((current) => {
          if (!(objectId in current)) return current
          const copy = { ...current }
          delete copy[objectId]
          return copy
        })
      }
    }

    const newlyExited: Record<string, { object: GridObject; from: CellPosition }> = {}
    for (const [objectId, previousObject] of Object.entries(previous)) {
      if (objectId in nextObjects) continue
      const [direction = { x: 0, y: 0 }] = boardEdgeDirections(previousObject.position, props.world)
      newlyExited[objectId] = {
        from: previousObject.position,
        object: {
          ...previousObject,
          position: {
            x: previousObject.position.x + direction.x,
            y: previousObject.position.y + direction.y,
          },
        },
      }
    }
    const exitedIds = Object.keys(newlyExited)
    if (exitedIds.length > 0) {
      setExitingObjects((current) => ({ ...current, ...newlyExited }))
      for (const objectId of exitedIds) {
        exitTimeoutsRef.current[objectId] = window.setTimeout(() => {
          delete exitTimeoutsRef.current[objectId]
          objectAppearedAtRef.current.delete(objectId)
          setExitingObjects((current) => {
            if (!(objectId in current)) return current
            const copy = { ...current }
            delete copy[objectId]
            return copy
          })
        }, OBJECT_EXIT_DURATION_MS)
      }
    }
  }, [currentGrid, props.gridObjects.objectsById, props.world])

  const cameraRangeCenterX = Math.round(cameraOffset.x + (props.viewBoardSize - 1) / 2)
  const cameraRangeCenterY = Math.round(cameraOffset.y + (props.viewBoardSize - 1) / 2)
  const renderRangeCenterX = props.freeCameraActive || localPlayerX === undefined
    ? cameraRangeCenterX
    : localPlayerX
  const renderRangeCenterY = props.freeCameraActive || localPlayerY === undefined
    ? cameraRangeCenterY
    : localPlayerY

  const boardCellRange = React.useMemo<BoardCellRange>(() => {
    const radius = Math.floor(props.maxVisibleCells / 2)
    const minX = Math.max(0, renderRangeCenterX - radius)
    const maxX = Math.min(props.world.boardSize - 1, renderRangeCenterX + radius)
    const minY = Math.max(0, renderRangeCenterY - radius)
    const maxY = Math.min(props.world.boardSize - 1, renderRangeCenterY + radius)
    const columns = Math.max(0, maxX - minX + 1)
    const rows = Math.max(0, maxY - minY + 1)
    return { minX, maxX, minY, maxY, columns, rows, cellCount: columns * rows }
  }, [props.maxVisibleCells, props.world.boardSize, renderRangeCenterX, renderRangeCenterY])

  const specialCellsByKey = React.useMemo(() => {
    const cells = new Map<string, SpecialCell>()
    for (const cell of props.specialCells) cells.set(cellPositionKey(cell.position), cell)
    return cells
  }, [props.specialCells])
  const shakingCellKeys = React.useMemo(
    () => new Set(Object.keys(specialCellShakeKeys)),
    [specialCellShakeKeys]
  )

  const playerEntries = React.useMemo(() => Object.entries(props.players).filter(([, player]) => (
    player.gridX === currentGrid.x && player.gridY === currentGrid.y
  )), [currentGrid, props.players])

  React.useEffect(() => {
    const press = playerPressRef.current
    if (!press) return
    const player = props.players[press.playerId]
    const stillUnderPointer = !!player &&
      player.gridX === currentGrid.x &&
      player.gridY === currentGrid.y &&
      player.position.x === press.cell.x &&
      player.position.y === press.cell.y &&
      isPositionInRange(player.position, boardCellRange)
    if (stillUnderPointer) return
    window.clearTimeout(press.timeoutId)
    playerPressRef.current = null
  }, [boardCellRange, currentGrid.x, currentGrid.y, props.players])

  const visibleObjects = React.useMemo(() => {
    const objects: GridObject[] = []
    if (!boardCellRange) return objects
    for (let y = boardCellRange.minY; y <= boardCellRange.maxY; y += 1) {
      for (let x = boardCellRange.minX; x <= boardCellRange.maxX; x += 1) {
        const position = { x, y }
        if (!isCellVisible(position, props.world)) continue
        const idsByChannel = gridObjectIdsByPosition?.[gridKey(position)]
        for (const objectId of Object.values(idsByChannel ?? {})) {
          const object = props.gridObjects.objectsById[objectId]
          if (object) objects.push(object)
        }
      }
    }
    return objects
  }, [boardCellRange, gridObjectIdsByPosition, props.gridObjects.objectsById, props.world])

  const adjacentActionObjects = React.useMemo(() => {
    if (!localPlayer || props.placementActive) return []
    const objects: GridObject[] = []
    for (const direction of ADJACENT_DIRECTIONS) {
      const object = objectAt(props.gridObjects, currentGrid, {
        x: localPlayer.position.x + direction.x,
        y: localPlayer.position.y + direction.y,
      })
      if (object && getObjectActionsSource(object.type) !== undefined) objects.push(object)
    }
    return objects
  }, [currentGrid, localPlayer, props.gridObjects, props.placementActive])

  const cameraOffsetPx = React.useMemo(() => ({ x: cameraOffset.x * stride, y: cameraOffset.y * stride }), [cameraOffset.x, cameraOffset.y, stride])
  const worldOrigin = React.useMemo(() => ({
    x: -boardSide / 2 - cameraOffsetPx.x,
    y: -boardSide / 2 - cameraOffsetPx.y,
  }), [boardSide, cameraOffsetPx.x, cameraOffsetPx.y])

  const screenPointToCell = React.useCallback((screenX: number, screenY: number): CellPosition | null => {
    const board = screenToBoardSpace(screenX - canvasWidth / 2, screenY - canvasHeight / 2)
    const localX = board.x + boardSide / 2 + cameraOffsetPx.x
    const localY = board.y + boardSide / 2 + cameraOffsetPx.y
    const x = Math.floor(localX / stride)
    const y = Math.floor(localY / stride)
    if (x < 0 || y < 0 || x >= props.world.boardSize || y >= props.world.boardSize) return null
    if (localX - x * stride > cellSize || localY - y * stride > cellSize) return null
    const position = { x, y }
    if (!isPositionInRange(position, boardCellRange) || !isCellVisible(position, props.world)) return null
    return position
  }, [boardCellRange, boardSide, cameraOffsetPx.x, cameraOffsetPx.y, canvasHeight, canvasWidth, cellSize, props.world, stride])

  const inventoryItemAt = React.useCallback((position: CellPosition): InventoryItem | null => {
    const idsByChannel = gridObjectIdsByPosition?.[gridKey(position)]
    const channelZeroId = idsByChannel?.['0']
    const channelZeroObject = channelZeroId ? props.gridObjects.objectsById[channelZeroId] : undefined
    const object = channelZeroObject ?? Object.values(idsByChannel ?? {})
      .map((objectId) => props.gridObjects.objectsById[objectId])
      .filter((candidate): candidate is GridObject => !!candidate)
      .sort(compareObjectLayers)[0]
    if (object) return inventoryItemForObject(object)
    const specialCell = specialCellsByKey.get(cellPositionKey(position))
    if (specialCell?.color) return inventoryItemForColor(specialCell.color)
    if (specialCell?.shape) return inventoryItemForShape(specialCell.shape)
    return null
  }, [gridObjectIdsByPosition, props.gridObjects.objectsById, specialCellsByKey])

  const paintCell = React.useCallback((gesture: PlacementGesture, position: CellPosition) => {
    const key = cellPositionKey(position)
    if (gesture.paintedCells.has(key)) return
    gesture.paintedCells.add(key)
    onPlaceItem?.(position)
  }, [onPlaceItem])

  const activatePaintGesture = React.useCallback((gesture: PlacementGesture) => {
    if (gesture.longPressTimeout !== null) window.clearTimeout(gesture.longPressTimeout)
    gesture.longPressTimeout = null
    gesture.active = true
    dragRef.current = null
    paintCell(gesture, gesture.startCell)
  }, [paintCell])

  const activatePickGesture = React.useCallback((gesture: PlacementGesture) => {
    if (gesture.longPressTimeout !== null) window.clearTimeout(gesture.longPressTimeout)
    gesture.longPressTimeout = null
    gesture.active = true
    dragRef.current = null
    if (gesture.itemToPick) onSelectInventoryItem?.(gesture.itemToPick)
  }, [onSelectInventoryItem])

  const playerAtCell = React.useCallback((position: CellPosition) => playerEntries.find(([, player]) => (
    player.position.x === position.x && player.position.y === position.y
  )), [playerEntries])

  const handlePointerDown = React.useCallback((event: FederatedPointerEvent) => {
    const startCell = screenPointToCell(event.global.x, event.global.y)
    const playerEntry = !placementActive && startCell ? playerAtCell(startCell) : undefined
    pointerDownRef.current = { pointerId: event.pointerId, cell: startCell, blockedByPlayer: !!playerEntry }

    if (placementActive && startCell) {
      const now = Date.now()
      const previousTap = lastPlacementTapRef.current
      const isDoubleClick = !!previousTap &&
        now - previousTap.timestamp <= DOUBLE_CLICK_MS &&
        previousTap.cell.x === startCell.x &&
        previousTap.cell.y === startCell.y
      const itemToPick = selectedInventoryItem?.kind !== 'eraser' && onSelectInventoryItem
        ? inventoryItemAt(startCell)
        : null
      const gesture: PlacementGesture = {
        pointerId: event.pointerId,
        startX: event.global.x,
        startY: event.global.y,
        startCell,
        longPressTimeout: null,
        mode: itemToPick && !isDoubleClick ? 'pick' : 'paint',
        itemToPick,
        active: false,
        lastCell: startCell,
        paintedCells: new Set(),
      }
      placementGestureRef.current = gesture
      if (isDoubleClick) {
        lastPlacementTapRef.current = null
        activatePaintGesture(gesture)
      } else {
        gesture.longPressTimeout = window.setTimeout(() => {
          if (placementGestureRef.current !== gesture) return
          if (gesture.mode === 'pick') activatePickGesture(gesture)
          else activatePaintGesture(gesture)
        }, LONG_PRESS_MS)
      }
    } else if (playerEntry) {
      const [playerId] = playerEntry
      const press = {
        playerId,
        cell: startCell!,
        pointerId: event.pointerId,
        startX: event.global.x,
        startY: event.global.y,
        timeoutId: window.setTimeout(() => {
          if (playerPressRef.current !== press) return
          playerPressRef.current = null
          onSelectPlayer(playerId)
        }, LONG_PRESS_MS),
      }
      playerPressRef.current = press
    }

    if (freeCameraActive) {
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.global.x,
        startY: event.global.y,
        startOffset: cameraOffset,
        moved: false,
      }
    }
  }, [activatePaintGesture, activatePickGesture, cameraOffset, freeCameraActive, inventoryItemAt, onSelectInventoryItem, onSelectPlayer, placementActive, playerAtCell, screenPointToCell, selectedInventoryItem])

  const handlePointerMove = React.useCallback((event: FederatedPointerEvent) => {
    const placement = placementGestureRef.current
    if (placement?.pointerId === event.pointerId) {
      if (placement.active) {
        if (placement.mode === 'paint') {
          const cell = screenPointToCell(event.global.x, event.global.y)
          if (cell) {
            for (const crossedCell of cellsAlongLine(placement.lastCell, cell)) paintCell(placement, crossedCell)
            placement.lastCell = cell
          }
        }
        return
      }
      if (Math.hypot(event.global.x - placement.startX, event.global.y - placement.startY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
        if (placement.longPressTimeout !== null) window.clearTimeout(placement.longPressTimeout)
        placementGestureRef.current = null
      }
    }

    const playerPress = playerPressRef.current
    if (playerPress?.pointerId === event.pointerId &&
      Math.hypot(event.global.x - playerPress.startX, event.global.y - playerPress.startY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      window.clearTimeout(playerPress.timeoutId)
      playerPressRef.current = null
    }

    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.global.x - drag.startX
    const dy = event.global.y - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    const local = screenToBoardSpace(dx, dy)
    const maxOffset = Math.max(0, props.world.boardSize - props.viewBoardSize)
    setCameraOffset({
      x: Math.min(maxOffset, Math.max(0, drag.startOffset.x - local.x / stride)),
      y: Math.min(maxOffset, Math.max(0, drag.startOffset.y - local.y / stride)),
    })
  }, [paintCell, props.viewBoardSize, props.world.boardSize, screenPointToCell, stride])

  const clearPointer = React.useCallback((pointerId: number) => {
    const placement = placementGestureRef.current
    if (placement?.pointerId === pointerId) {
      if (placement.longPressTimeout !== null) window.clearTimeout(placement.longPressTimeout)
      placementGestureRef.current = null
    }
    const playerPress = playerPressRef.current
    if (playerPress?.pointerId === pointerId) {
      window.clearTimeout(playerPress.timeoutId)
      playerPressRef.current = null
    }
    if (dragRef.current?.pointerId === pointerId) dragRef.current = null
    if (pointerDownRef.current?.pointerId === pointerId) pointerDownRef.current = null
  }, [])

  const handlePointerUp = React.useCallback((event: FederatedPointerEvent) => {
    const placement = placementGestureRef.current
    const drag = dragRef.current
    const playerPress = playerPressRef.current
    const down = pointerDownRef.current

    if (placement?.pointerId === event.pointerId) {
      if (placement.longPressTimeout !== null) window.clearTimeout(placement.longPressTimeout)
      placementGestureRef.current = null
      if (!placement.active) {
        lastPlacementTapRef.current = { cell: placement.startCell, timestamp: Date.now() }
        onPlaceItem?.(placement.startCell)
      }
      clearPointer(event.pointerId)
      return
    }

    if (playerPress?.pointerId === event.pointerId) {
      window.clearTimeout(playerPress.timeoutId)
      playerPressRef.current = null
      clearPointer(event.pointerId)
      return
    }

    if (drag?.pointerId === event.pointerId && drag.moved) {
      clearPointer(event.pointerId)
      return
    }

    if (!placementActive && down?.pointerId === event.pointerId && !down.blockedByPlayer && down.cell && localPlayer) {
      const endCell = screenPointToCell(event.global.x, event.global.y)
      if (endCell?.x === down.cell.x && endCell.y === down.cell.y &&
        isAdjacent(localPlayer.position, endCell) &&
        !isCellOccupiedByAnotherPlayer(endCell, currentGrid, players, localPlayerId ?? undefined)) {
        onMove(endCell)
      }
    }
    clearPointer(event.pointerId)
  }, [clearPointer, currentGrid, localPlayer, localPlayerId, onMove, onPlaceItem, placementActive, players, screenPointToCell])

  const handlePointerCancel = React.useCallback((event: FederatedPointerEvent) => clearPointer(event.pointerId), [clearPointer])

  const ownerObjectId = isArbitraryGrid(currentGrid) ? props.world.state : undefined
  const neighborMarkers = React.useMemo<NeighborMarker[]>(() => {
    if (!localPlayer) return []
    const { minIndex, maxIndex } = boardEdgeRange(props.world)
    const playerCenterX = localPlayer.position.x * stride + cellSize / 2
    const playerCenterY = localPlayer.position.y * stride + cellSize / 2
    const edgeDirections = boardEdgeDirections(localPlayer.position, props.world)
    const definitions: { offset: GridCoord; direction: NeighborMarker['direction']; rotation: number }[] = [
      { offset: { x: 0, y: -1 }, direction: 'top', rotation: 0 },
      { offset: { x: 1, y: 0 }, direction: 'right', rotation: Math.PI / 2 },
      { offset: { x: 0, y: 1 }, direction: 'bottom', rotation: Math.PI },
      { offset: { x: -1, y: 0 }, direction: 'left', rotation: -Math.PI / 2 },
    ]
    return definitions.flatMap((definition) => {
      const grid = { x: currentGrid.x + definition.offset.x, y: currentGrid.y + definition.offset.y }
      if (!ownerObjectId && !isGridInWorld(grid, props.world)) return []
      const enabled = edgeDirections.some((direction) => direction.x === definition.offset.x && direction.y === definition.offset.y)
      const gap = NEIGHBOR_MARKER_GAP_PX + (enabled ? NEIGHBOR_MARKER_ENABLED_EXTRA_PX : 0)
      let x = playerCenterX
      let y = playerCenterY
      if (definition.offset.y === -1) y = minIndex * stride - gap
      else if (definition.offset.x === 1) x = maxIndex * stride + cellSize + gap
      else if (definition.offset.y === 1) y = maxIndex * stride + cellSize + gap
      else x = minIndex * stride - gap
      return [{
        ...definition,
        position: { x, y },
        enabled,
        color: gridColorValue(ownerObjectId ? currentGrid : grid, props.gridColors),
        key: ownerObjectId ? definition.direction : gridKey(grid),
      }]
    })
  }, [cellSize, currentGrid, localPlayer, ownerObjectId, props.gridColors, props.world, stride])

  const canvasCenter = {
    x: (canvasBounds?.left ?? (viewport.width - canvasWidth) / 2) + canvasWidth / 2,
    y: (canvasBounds?.top ?? (viewport.height - canvasHeight) / 2) + canvasHeight / 2,
  }
  const offscreenPlayers = React.useMemo<OffscreenPlayer[]>(() => {
    if (!SHOW_OFFSCREEN_INDICATORS || !localPlayer) return []
    const result: OffscreenPlayer[] = []
    for (const [playerId, player] of playerEntries) {
      if (playerId === props.localPlayerId) continue
      const localX = player.position.x * stride + cellSize / 2 - cameraOffsetPx.x - boardSide / 2
      const localY = player.position.y * stride + cellSize / 2 - cameraOffsetPx.y - boardSide / 2
      const rotated = rotateToScreenSpace(localX, localY)
      const screenX = canvasCenter.x + rotated.x
      const screenY = canvasCenter.y + rotated.y
      const visible = isPositionInRange(player.position, boardCellRange) &&
        screenX >= 0 && screenX <= viewport.width && screenY >= 0 && screenY <= viewport.height
      if (visible) continue
      const clamped = clampFromPointToScreenEdge(canvasCenter.x, canvasCenter.y, rotated.x, rotated.y, viewport.width, viewport.height)
      result.push({
        playerId,
        color: player.color,
        avatarUrl: props.avatarUrls[playerId] ?? null,
        ...clamped,
      })
    }
    return result
  }, [boardCellRange, boardSide, cameraOffsetPx.x, cameraOffsetPx.y, canvasCenter.x, canvasCenter.y, cellSize, localPlayer, playerEntries, props.avatarUrls, props.localPlayerId, stride, viewport.height, viewport.width])

  const bubblePlayer = bubblePlayerId ? props.players[bubblePlayerId] : undefined
  const hitArea = React.useMemo(() => new Rectangle(0, 0, canvasWidth, canvasHeight), [canvasHeight, canvasWidth])
  const frameColor = gridColorValue(currentGrid, props.gridColors)
  const drawBoardMask = React.useCallback((graphics: Graphics) => {
    graphics
      .clear()
      .roundRect(-12, -12, contentSize + 24, contentSize + 24, 26)
      .fill(WHITE)
  }, [contentSize])

  React.useLayoutEffect(() => {
    const content = boardContentRef.current
    if (!content) return
    content.mask = boardMaskRef.current
    return () => {
      content.mask = null
    }
  }, [contentSize])

  return (
    <>
      <div
        className="relative inline-block"
        style={{
          width: boardSide,
          height: boardSide,
          cursor: props.freeCameraActive ? 'grab' : undefined,
          touchAction: props.freeCameraActive || props.placementActive ? 'none' : undefined,
        }}
      >
        <Application
          width={canvasWidth}
          height={canvasHeight}
          resolution={Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 2)}
          autoDensity
          antialias
          backgroundAlpha={0}
          // WebGL remains the normal fast path. Canvas2D keeps the board
          // usable in browsers where a WebGL context is unavailable or
          // blocked, rather than leaving an empty canvas.
          preference={RENDERER_PREFERENCE}
          powerPreference="high-performance"
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
            props.freeCameraActive || props.placementActive ? 'touch-none' : 'touch-auto'
          }`}
          onInit={(application) => {
            const canvas = application.canvas as HTMLCanvasElement
            canvas.setAttribute('role', 'application')
            canvas.setAttribute('aria-label', 'Plateau de jeu')
            canvas.oncontextmenu = (event) => event.preventDefault()
            setCanvasElement(canvas)
          }}
        >
          <AnimationTicker registry={animationRegistry} />
          <pixiContainer
            eventMode="static"
            hitArea={hitArea}
            onPointerDown={handlePointerDown}
            onGlobalPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerUpOutside={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <pixiContainer x={canvasWidth / 2} y={canvasHeight / 2} rotation={BOARD_ROTATION}>
              <pixiContainer x={worldOrigin.x} y={worldOrigin.y} sortableChildren>
              <BoardFrame contentSize={contentSize} color={frameColor} />
              <pixiGraphics ref={boardMaskRef} draw={drawBoardMask} zIndex={-900} />
              <pixiContainer ref={boardContentRef} sortableChildren zIndex={0}>
              <CellLayer
                range={boardCellRange}
                world={props.world}
                stride={stride}
                cellSize={cellSize}
                localPlayer={localPlayer}
                currentGrid={currentGrid}
                players={props.players}
                localPlayerId={props.localPlayerId}
                placementActive={!!props.placementActive}
                specialCellsByKey={specialCellsByKey}
                shakingCellKeys={shakingCellKeys}
              />
              {Object.entries(specialCellShakeKeys).map(([key, shake]) => {
                const [x, y] = key.split('-').map(Number)
                const position = { x, y }
                if (!Number.isInteger(x) || !Number.isInteger(y) || !isPositionInRange(position, boardCellRange)) return null
                return (
                  <CellShakeOverlay2D
                    key={key}
                    position={position}
                    color={specialCellsByKey.get(key)?.color}
                    clickable={!!localPlayer && (
                      !!props.placementActive ||
                      (isAdjacent(localPlayer.position, position) &&
                        !isCellOccupiedByAnotherPlayer(
                          position,
                          currentGrid,
                          props.players,
                          props.localPlayerId ?? undefined
                        ))
                    )}
                    cellSize={cellSize}
                    stride={stride}
                    direction={shake.direction}
                    startedAt={shake.startedAt}
                    registry={animationRegistry}
                  />
                )
              })}
              {props.specialCells.filter((cell) => cell.shape && isPositionInRange(cell.position, boardCellRange)).map((cell) => {
                const shake = specialCellShakeKeys[cellPositionKey(cell.position)] ?? { key: 0, direction: { x: 0, y: 0 } }
                return (
                  <ShapeBadge2D
                    key={cellPositionKey(cell.position)}
                    cell={cell}
                    cellSize={cellSize}
                    stride={stride}
                    shakeKey={shake.key}
                    shakeDirection={shake.direction}
                    registry={animationRegistry}
                  />
                )
              })}
              <ObjectLayer2D
                objects={visibleObjects}
                exitingObjects={exitingObjects}
                objectJumps={props.objectJumps}
                currentGrid={currentGrid}
                appearedAt={objectAppearedAtRef.current}
                cellSize={cellSize}
                stride={stride}
                boardSize={props.world.boardSize}
                registry={animationRegistry}
              />
              <PlayerLayer2D
                entries={playerEntries}
                boardCellRange={boardCellRange}
                currentGridKey={currentGridKey}
                appearedAt={playerAppearedAtRef.current}
                avatarUrls={props.avatarUrls}
                hostPlayerId={props.hostPlayerId}
                localPlayerId={props.localPlayerId}
                cellSize={cellSize}
                stride={stride}
                boardSize={props.world.boardSize}
                registry={animationRegistry}
              />
              </pixiContainer>
              {neighborMarkers.map((marker) => (
                <NeighborMarker2D
                  key={marker.key}
                  marker={marker}
                  onClick={() => props.onMoveToGrid(marker.offset, ownerObjectId)}
                />
              ))}
              {!props.placementActive && localPlayer && adjacentActionObjects.map((object) => (
                <pixiContainer key={object.id} zIndex={2_100_000_000}>
                  <ObjectActionMenu2D
                    object={object}
                    playerPosition={localPlayer.position}
                    cellSize={cellSize}
                    gapSize={gapSize}
                    onTriggerAction={props.onTriggerObjectAction}
                    resolveActionNames={props.resolveObjectActionNames}
                  />
                </pixiContainer>
              ))}
              </pixiContainer>
            </pixiContainer>
          </pixiContainer>
        </Application>
      </div>

      {SHOW_OFFSCREEN_INDICATORS && (
        <div className="pointer-events-none fixed inset-0 z-10">
          {offscreenPlayers.map((player) => (
            <OffscreenPlayerBubble
              key={player.playerId}
              {...player}
              onClick={() => setBubblePlayerId(player.playerId)}
            />
          ))}
        </div>
      )}

      {bubblePlayer && (
        <PlayerBubbleDialog
          open
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

export { GameGrid2D }
