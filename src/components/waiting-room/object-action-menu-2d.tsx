import * as React from 'react'
import { extend } from '@pixi/react'
import {
  CanvasTextMetrics,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Text as PixiText,
  TextStyle,
  type TextStyleOptions,
} from 'pixi.js'

import { CUBE_COLOR_PALETTE, type CubeColor } from '@/lib/cube-colors'
import { type GridObject, type ObjectActionDisplay, type ObjectType } from '@/lib/game-objects'
import type { CellPosition } from '@/lib/world'

extend({ Container, Graphics, Text: PixiText })

interface ObjectActionMenu2DProps {
  object: GridObject
  playerPosition: CellPosition
  cellSize: number
  gapSize: number
  onTriggerAction: (objectId: string, actionName: string) => void
  resolveActionNames: (objectId: string, objectType: ObjectType) => Promise<ObjectActionDisplay[]>
}

type HorizontalAnchor = 'left' | 'center' | 'right'
type VerticalAnchor = 'top' | 'center' | 'bottom'
type NeighborCell = 'top' | 'bottom' | 'left' | 'right'

interface ActionMenuPlacement {
  horizontalOffset: number
  verticalOffset: number
  anchor: { horizontal: HorizontalAnchor; vertical: VerticalAnchor }
}

interface ActionButtonLayout {
  action: ObjectActionDisplay
  width: number
}

const ACTION_MENU_PLACEMENTS: Record<NeighborCell, ActionMenuPlacement> = {
  top: { horizontalOffset: -0.2, verticalOffset: 0.5, anchor: { horizontal: 'left', vertical: 'top' } },
  bottom: { horizontalOffset: 0.5, verticalOffset: -0.5, anchor: { horizontal: 'right', vertical: 'bottom' } },
  left: { horizontalOffset: 0.4, verticalOffset: 0.5, anchor: { horizontal: 'right', vertical: 'top' } },
  right: { horizontalOffset: -0.5, verticalOffset: -0.5, anchor: { horizontal: 'left', vertical: 'bottom' } },
}

const ACTION_FONT_FAMILY = 'Geist Variable'
const ACTION_FONT_SIZE = 12
const ACTION_LINE_HEIGHT = 16
const ACTION_FONT_WEIGHT = '700'
const ACTION_HORIZONTAL_PADDING = 10
const ACTION_BUTTON_HEIGHT = 26
const ACTION_BUTTON_GAP = 4
const ACTION_BORDER_WIDTH = 1
const ACTION_SHADOW_OFFSET = 1.5
const GAME_INK = '#16171d'

const COLOR_FALLBACKS: Record<CubeColor, string> = {
  red: '#ff3b3f',
  purple: '#8b2fff',
  green: '#1fc463',
  blue: '#0ea5ff',
  orange: '#db8a3c',
  yellow: '#ffd23f',
  pink: '#ff4fa3',
  teal: '#10c6b0',
  lime: '#b5e61d',
  indigo: '#5a4fff',
}

const MEASURE_TEXT_STYLE = new TextStyle({
  fontFamily: ACTION_FONT_FAMILY,
  fontSize: ACTION_FONT_SIZE,
  fontWeight: ACTION_FONT_WEIGHT,
  lineHeight: ACTION_LINE_HEIGHT,
})

function resolveCssColor(value: string, fallback: string): string {
  const match = /^var\((--[^)]+)\)$/.exec(value)
  if (!match || typeof document === 'undefined') return match ? fallback : value

  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || fallback
}

function measureActionWidth(label: string): number {
  const measuredWidth =
    typeof document === 'undefined'
      ? label.length * ACTION_FONT_SIZE * 0.6
      : CanvasTextMetrics.measureText(label, MEASURE_TEXT_STYLE).width

  return Math.ceil(measuredWidth) + ACTION_HORIZONTAL_PADDING * 2 + ACTION_BORDER_WIDTH * 2
}

function horizontalBlockOffset(anchor: HorizontalAnchor, blockWidth: number): number {
  if (anchor === 'center') return -blockWidth / 2
  if (anchor === 'right') return -blockWidth
  return 0
}

function verticalBlockOffset(anchor: VerticalAnchor, blockHeight: number): number {
  if (anchor === 'center') return -blockHeight / 2
  if (anchor === 'bottom') return -blockHeight
  return 0
}

function buttonOffset(anchor: HorizontalAnchor, blockWidth: number, buttonWidth: number): number {
  if (anchor === 'center') return (blockWidth - buttonWidth) / 2
  if (anchor === 'right') return blockWidth - buttonWidth
  return 0
}

interface ActionButton2DProps {
  action: ObjectActionDisplay
  objectId: string
  width: number
  x: number
  y: number
  onTriggerAction: ObjectActionMenu2DProps['onTriggerAction']
}

const ActionButton2D = React.memo(function ActionButton2D(props: ActionButton2DProps) {
  const { action, objectId, onTriggerAction, width } = props
  const backgroundColor = action.color
    ? resolveCssColor(CUBE_COLOR_PALETTE[action.color].bg, COLOR_FALLBACKS[action.color])
    : 'white'
  const foregroundColor = action.color
    ? resolveCssColor(CUBE_COLOR_PALETTE[action.color].fg, GAME_INK)
    : GAME_INK

  const hitArea = React.useMemo(() => new Rectangle(0, 0, width, ACTION_BUTTON_HEIGHT), [width])
  const textStyle = React.useMemo<TextStyleOptions>(
    () => ({
      align: 'center',
      fill: foregroundColor,
      fontFamily: ACTION_FONT_FAMILY,
      fontSize: ACTION_FONT_SIZE,
      fontWeight: ACTION_FONT_WEIGHT,
      lineHeight: ACTION_LINE_HEIGHT,
    }),
    [foregroundColor]
  )
  const drawPill = React.useCallback(
    (graphics: Graphics) => {
      const radius = ACTION_BUTTON_HEIGHT / 2

      graphics.clear()
      graphics
        .roundRect(ACTION_SHADOW_OFFSET, ACTION_SHADOW_OFFSET, width, ACTION_BUTTON_HEIGHT, radius)
        .fill(GAME_INK)
      graphics
        .roundRect(
          ACTION_BORDER_WIDTH / 2,
          ACTION_BORDER_WIDTH / 2,
          width - ACTION_BORDER_WIDTH,
          ACTION_BUTTON_HEIGHT - ACTION_BORDER_WIDTH,
          radius - ACTION_BORDER_WIDTH / 2
        )
        .fill(backgroundColor)
        .stroke({ color: GAME_INK, width: ACTION_BORDER_WIDTH })
    },
    [backgroundColor, width]
  )
  const handlePointerTap = React.useCallback(
    (event: FederatedPointerEvent) => {
      event.stopPropagation()
      onTriggerAction(objectId, action.name)
    },
    [action.name, objectId, onTriggerAction]
  )
  const stopPointerEvent = React.useCallback((event: FederatedPointerEvent) => {
    event.stopPropagation()
  }, [])

  return (
    <pixiContainer
      x={props.x}
      y={props.y}
      eventMode="static"
      cursor="pointer"
      hitArea={hitArea}
      label={`Action ${action.name}`}
      accessible
      accessibleTitle={action.name}
      accessibleType="button"
      tabIndex={0}
      onPointerDown={stopPointerEvent}
      onPointerUp={stopPointerEvent}
      onPointerUpOutside={stopPointerEvent}
      onPointerTap={handlePointerTap}
    >
      <pixiGraphics eventMode="none" draw={drawPill} />
      <pixiText
        eventMode="none"
        x={width / 2}
        y={ACTION_BUTTON_HEIGHT / 2}
        anchor={0.5}
        text={action.name}
        style={textStyle}
      />
    </pixiContainer>
  )
})

// Pixi counterpart of ObjectActionDialog. The parent world container is
// rotated by +45 degrees; this component positions itself in that local
// board space, then counter-rotates its pill contents so labels stay upright.
const ObjectActionMenu2D = React.memo(function ObjectActionMenu2D(props: ObjectActionMenu2DProps) {
  const [actions, setActions] = React.useState<ObjectActionDisplay[]>([])
  const objectId = props.object.id
  const objectType = props.object.type
  const objectX = props.object.position.x
  const objectY = props.object.position.y
  const resolveActionNames = props.resolveActionNames

  React.useEffect(() => {
    let cancelled = false
    void resolveActionNames(objectId, objectType).then((resolved) => {
      if (!cancelled) setActions(resolved)
    })

    return () => {
      cancelled = true
    }
    // Position deliberately participates: dynamic action builders may
    // derive their labels/colors from the cell currently under the object.
  }, [objectId, objectType, objectX, objectY, resolveActionNames])

  const buttonLayouts = React.useMemo<ActionButtonLayout[]>(
    () => actions.map((action) => ({ action, width: measureActionWidth(action.name) })),
    [actions]
  )

  if (buttonLayouts.length === 0) return null

  const dx = props.playerPosition.x - props.object.position.x
  const dy = props.playerPosition.y - props.object.position.y
  const neighborCell: NeighborCell = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === 1 ? 'bottom' : 'top'
  const placement = ACTION_MENU_PLACEMENTS[neighborCell]

  const cellCenterX = props.object.position.x * (props.cellSize + props.gapSize) + props.cellSize / 2
  const cellCenterY = props.object.position.y * (props.cellSize + props.gapSize) + props.cellSize / 2
  const screenX = placement.horizontalOffset * props.cellSize
  const screenY = placement.verticalOffset * props.cellSize
  const anchorX = cellCenterX + (screenX + screenY) / Math.SQRT2
  const anchorY = cellCenterY + (screenY - screenX) / Math.SQRT2

  const blockWidth = Math.max(...buttonLayouts.map((button) => button.width))
  const blockHeight =
    buttonLayouts.length * ACTION_BUTTON_HEIGHT + (buttonLayouts.length - 1) * ACTION_BUTTON_GAP
  const blockX = horizontalBlockOffset(placement.anchor.horizontal, blockWidth)
  const blockY = verticalBlockOffset(placement.anchor.vertical, blockHeight)

  return (
    <pixiContainer x={anchorX} y={anchorY} rotation={-Math.PI / 4}>
      <pixiContainer x={blockX} y={blockY}>
        {buttonLayouts.map(({ action, width }, index) => (
          <ActionButton2D
            key={action.name}
            action={action}
            objectId={props.object.id}
            width={width}
            x={buttonOffset(placement.anchor.horizontal, blockWidth, width)}
            y={index * (ACTION_BUTTON_HEIGHT + ACTION_BUTTON_GAP)}
            onTriggerAction={props.onTriggerAction}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  )
})

export { ObjectActionMenu2D }
export type { ObjectActionMenu2DProps }
