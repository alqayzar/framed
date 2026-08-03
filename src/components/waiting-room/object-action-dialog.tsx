import * as React from 'react'

import { CUBE_COLOR_PALETTE } from '@/lib/cube-colors'
import { type GridObject, type ObjectActionDisplay, type ObjectType } from '@/lib/game-objects'

interface ObjectActionDialogProps {
  object: GridObject
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
  // doesn't land straight down on screen — it lands diagonally. Offsetting
  // left and top by the same amount cancels the sideways component after
  // rotation, leaving a purely vertical (downward) screen offset — the
  // same reason neighboring grid cells form a diamond instead of a
  // straight line.
  const offset = props.cellSize * 0.6

  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center"
      style={{ width: props.cellSize, left: cellLeft + offset, top: cellTop + offset }}
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
