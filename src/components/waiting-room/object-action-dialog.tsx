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
  }, [props.object.id, props.object.type, props.resolveActionNames])

  if (actions.length === 0) return null

  const cellLeft = props.object.position.x * (props.cellSize + props.gapSize)
  const cellTop = props.object.position.y * (props.cellSize + props.gapSize)
  // GameGrid's outer wrapper rotates the whole board 45°, so a plain
  // Δtop offset here (in this local, pre-rotation coordinate space)
  // doesn't land straight down on screen — it lands diagonally, toward
  // the object's screen-top-right corner (negative Δtop) or
  // screen-bottom-left corner (positive Δtop), with no Δleft needed
  // either way (the same reason neighboring grid cells form a diamond
  // instead of a straight line). A west (dx=-1) or south (dy=+1)
  // neighbor of the object always lands on its screen-left after that
  // rotation, and an east/north neighbor always lands on its
  // screen-right — so pushing the dialog to the opposite corner from
  // whichever side the player is on keeps it clear of the player's cube.
  const dx = props.playerPosition.x - props.object.position.x
  const dy = props.playerPosition.y - props.object.position.y
  const isBottomLeft = dx - dy > 0
  const verticalOffset = props.cellSize * 0.7
  const topOffset = isBottomLeft ? verticalOffset : -verticalOffset
  // Extra nudge, bottom-left case only: the pure diagonal above didn't
  // read as far enough left on screen, so pull it further left here —
  // a deliberate visual asymmetry, not something the rotation math
  // requires (the top-right case is left as a pure diagonal).
  const leftOffset = isBottomLeft ? -props.cellSize * 0.9 : 0

  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center"
      style={{ width: props.cellSize, left: cellLeft + leftOffset, top: cellTop + topOffset }}
    >
      {/* Counter-rotates the board's own rotate-45 (see GameGrid's
          outer wrapper), same idea as GridObjectBadge's icon — keeps the
          buttons' own content upright despite the diagonal position
          offset above. */}
      <div className="pointer-events-auto flex -rotate-45 flex-col gap-1">
        {actions.map((action) => (
          <button
            key={action.name}
            type="button"
            onClick={() => props.onTriggerAction(props.object.id, action.name)}
            className="cursor-pointer rounded-full border border-game-ink px-2.5 py-1 text-xs font-bold whitespace-nowrap text-game-ink shadow-[1.5px_1.5px_0_0_var(--color-game-ink)]"
            style={{ backgroundColor: action.color ? CUBE_COLOR_PALETTE[action.color].bg : 'white' }}
          >
            {action.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export { ObjectActionDialog }
