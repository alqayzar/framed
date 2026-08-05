import * as React from 'react'

import { CUBE_COLOR_PALETTE } from '@/lib/cube-colors'
import { type GridObject, type ObjectActionDisplay, type ObjectType } from '@/lib/game-objects'
import type { CellPosition } from '@/lib/world'

interface ObjectActionDialogProps {
  object: GridObject
  playerPosition: CellPosition
  cellSize: number
  gapSize: number
  onTriggerAction: (objectId: string, actionName: string) => void
  resolveActionNames: (objectId: string, objectType: ObjectType) => Promise<ObjectActionDisplay[]>
}

type HorizontalAnchor = 'left' | 'center' | 'right'
type VerticalAnchor = 'top' | 'center' | 'bottom'
// Which neighbor cell the player is standing on, in grid terms — not
// screen ones: the board is drawn rotated 45°, so e.g. the 'top' cell
// (y - 1) actually appears up-and-to-the-right of the object on screen.
type NeighborCell = 'top' | 'bottom' | 'left' | 'right'

interface ActionDialogPlacement {
  // Screen-space offset from the object's cell center, in multiples of
  // cellSize: positive horizontal = right on screen, positive vertical =
  // down on screen, whatever the board's rotation is doing. Converted to
  // the board's own rotated axes by the component (see anchorLeft below),
  // so these read exactly as they look.
  horizontalOffset: number
  verticalOffset: number
  // Which edge/corner of the button block lands on that offset point
  // (e.g. horizontal 'right' puts the block's right edge there, so it
  // extends leftward), and how the stacked buttons line up with each
  // other when their labels differ in width.
  anchor: { horizontal: HorizontalAnchor; vertical: VerticalAnchor }
}

// One independent placement per neighbor cell the player can stand on.
// Tune each freely — nothing here is shared between the four.
const ACTION_DIALOG_PLACEMENTS: Record<NeighborCell, ActionDialogPlacement> = {
  top: { horizontalOffset: -0.2, verticalOffset: 0.5, anchor: { horizontal: 'left', vertical: 'top' } },
  bottom: { horizontalOffset: 0.5, verticalOffset: -0.5, anchor: { horizontal: 'right', vertical: 'bottom' } },
  left: { horizontalOffset: 0.4, verticalOffset: 0.5, anchor: { horizontal: 'right', vertical: 'top' } },
  right: { horizontalOffset: -0.5, verticalOffset: -0.5, anchor: { horizontal: 'left', vertical: 'bottom' } },
}

// Pulls the named edge of the block onto the anchor point. Percentages
// resolve against the block's own box, so this holds whatever width the
// action labels end up needing.
const ANCHOR_TRANSLATE_X: Record<HorizontalAnchor, string> = { left: '0%', center: '-50%', right: '-100%' }
const ANCHOR_TRANSLATE_Y: Record<VerticalAnchor, string> = { top: '0%', center: '-50%', bottom: '-100%' }
const ANCHOR_ALIGN_ITEMS: Record<HorizontalAnchor, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
}

// Floats above an object once the local player is adjacent to it (see
// game-grid.tsx's isAdjacent + getObjectActionsSource filter).
// Resolution itself (static vs. host round-trip for a dynamic source)
// happens in resolveActionNames (GameWorldValue.resolveObjectActionNames)
// — this component only renders whatever list comes back and relays a
// click; it never runs anything itself.
function ObjectActionDialog(props: ObjectActionDialogProps) {
  const [actions, setActions] = React.useState<ObjectActionDisplay[]>([])

  React.useEffect(() => {
    let cancelled = false
    void props.resolveActionNames(props.object.id, props.object.type).then((resolved) => {
      if (!cancelled) setActions(resolved)
    })
    return () => {
      cancelled = true
    }
    // Position included on purpose: a builder may vary its answer by
    // what the object is standing on (the text object borrows its cell's
    // color), and walking into an object pushes it one cell on while
    // leaving the player adjacent — so without this the dialog would
    // keep showing the cell the object just left.
  }, [props.object.id, props.object.type, props.object.position.x, props.object.position.y, props.resolveActionNames])

  if (actions.length === 0) return null

  // isAdjacent at the call site (see game-grid.tsx) guarantees a
  // Manhattan distance of exactly 1, so precisely one of these is
  // non-zero; the final branch doubles as the fallback.
  const dx = props.playerPosition.x - props.object.position.x
  const dy = props.playerPosition.y - props.object.position.y
  const neighborCell: NeighborCell = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === 1 ? 'bottom' : 'top'
  const placement = ACTION_DIALOG_PLACEMENTS[neighborCell]

  const cellCenterLeft = props.object.position.x * (props.cellSize + props.gapSize) + props.cellSize / 2
  const cellCenterTop = props.object.position.y * (props.cellSize + props.gapSize) + props.cellSize / 2
  // GameGrid's outer wrapper rotates the whole board 45°, so the local
  // (pre-rotation) axes this `absolute` box is positioned in run
  // diagonally on screen — a plain Δtop lands down-and-left, not down.
  // The placement above is written in honest screen terms instead, so
  // undo that rotation here to get back to local axes.
  const screenX = placement.horizontalOffset * props.cellSize
  const screenY = placement.verticalOffset * props.cellSize
  const anchorLeft = cellCenterLeft + (screenX + screenY) / Math.SQRT2
  const anchorTop = cellCenterTop + (screenY - screenX) / Math.SQRT2

  return (
    // Zero-size anchor point, placed in the board's local space.
    <div className="pointer-events-none absolute w-max" style={{ left: anchorLeft, top: anchorTop }}>
      {/* Counter-rotates the board's own rotate-45 (see GameGrid's outer
          wrapper), same idea as GridObjectBadge's icon — so the buttons
          read upright, and everything inside here is back in screen-
          aligned space. origin-top-left pivots that rotation exactly on
          the anchor point above rather than the default center, which is
          what lets the block below measure its offset from that point. */}
      <div className="w-max -rotate-45 origin-top-left">
        {/* Screen-aligned by the counter-rotation above, so this
            translate moves in real screen directions: it pulls whichever
            edge `anchor` names onto the anchor point. */}
        <div
          className="pointer-events-auto flex w-max flex-col gap-1"
          style={{
            transform: `translate(${ANCHOR_TRANSLATE_X[placement.anchor.horizontal]}, ${ANCHOR_TRANSLATE_Y[placement.anchor.vertical]})`,
            alignItems: ANCHOR_ALIGN_ITEMS[placement.anchor.horizontal],
          }}
        >
          {actions.map((action) => (
            <button
              key={action.name}
              type="button"
              onClick={() => props.onTriggerAction(props.object.id, action.name)}
              className="cursor-pointer rounded-full border border-game-ink px-2.5 py-1 text-xs font-bold whitespace-nowrap shadow-[1.5px_1.5px_0_0_var(--color-game-ink)]"
              // Label color comes from the palette's own fg rather than a
              // fixed ink, since an action's color can be any of the ten
              // (e.g. the text object borrows its cell's) and the dark
              // ones would otherwise render dark-on-dark. No-op for what
              // exists today: yellow's fg *is* game-ink, as is the
              // uncolored fallback.
              style={{
                backgroundColor: action.color ? CUBE_COLOR_PALETTE[action.color].bg : 'white',
                color: action.color ? CUBE_COLOR_PALETTE[action.color].fg : 'var(--color-game-ink)',
              }}
            >
              {action.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export { ObjectActionDialog }
