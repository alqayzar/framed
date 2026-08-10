import { type CellPosition, type GridCoord } from '@/lib/world';
import { ActionUpdateSignal, objectAt, type ObjectActionInvocationContext } from '@/lib/game-objects';
import { specialCellAt } from '@/lib/special-cells';

export type RedstoneState = {
  state: 'on' | 'off'
  sourceDirection?: { x: number; y: number },
  sourceId?: string
}

// Vertical neighbours only — used by redstone-vertical to propagate a
// state change upward/downward.
export const HORIZONTAL_DIRECTIONS: GridCoord[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
]

export const VERTICAL_DIRECTIONS: GridCoord[] = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
]

// N, E, S, W — used by confetti's action below to check its four
// same-grid neighbors for a clock to advance.
export const CARDINAL_DIRECTIONS: GridCoord[] = [
  ...HORIZONTAL_DIRECTIONS,
  ...VERTICAL_DIRECTIONS
]

// redstone-detector sits in both lists for the same reason
// redstone-button does: it's a source, not a conductor, so a wire of
// either orientation may draw from it.
export const AXIS_DIRECTIONS: [GridCoord[], string[]][] = [
  [VERTICAL_DIRECTIONS, ['redstone-button', 'redstone-detector', 'redstone-vertical', 'redstone-inv-vertical']],
  [HORIZONTAL_DIRECTIONS, ['redstone-button', 'redstone-detector', 'redstone-horizontal', 'redstone-inv-horizontal']]
]

// Turns on when any of the four adjacent cells carries the same special
// cell color as the one the detector itself stands on — no color
// underneath, never on. Purely a source: it reads the board rather than
// a neighbor's signal, so it records no sourceId/sourceDirection.
export function updateRedstoneDetectorAction(ctx: ObjectActionInvocationContext) {
  const state = ctx.state as RedstoneState;
  // A cell can carry a shape and no color (see SpecialCell's own doc),
  // so test .color rather than treating any hit as colored.
  const ownColor = specialCellAt(ctx.specialCells, ctx.object.grid, ctx.object.position)?.color;
  let nextState: RedstoneState['state'] = 'off';
  if (ownColor) {
    for (const direction of CARDINAL_DIRECTIONS) {
      const neighborPosition: CellPosition = {
        x: ctx.object.position.x + direction.x,
        y: ctx.object.position.y + direction.y,
      };
      if (specialCellAt(ctx.specialCells, ctx.object.grid, neighborPosition)?.color === ownColor) {
        nextState = 'on';
        break;
      }
    }
  }
  if (state.state === nextState) return;
  ctx.setObjectState(ctx.object.objectId, { state: nextState } satisfies RedstoneState);
  return ActionUpdateSignal.UPDATE_NO_CYCLE;
}

export function updateRedstoneAction(ctx: ObjectActionInvocationContext) {
    const lookState = ctx.object.objectType.startsWith('redstone-inv') ? 'off' : 'on';
    const state = ctx.state as RedstoneState;

    if (state.state === lookState && state.sourceDirection && state.sourceId) {
      const sourcePosition: CellPosition = {
        x: ctx.object.position.x + state.sourceDirection.x,
        y: ctx.object.position.y + state.sourceDirection.y,
      };

      const sourceObject = objectAt(ctx.gridObjects, ctx.object.grid, sourcePosition);
      if (sourceObject && sourceObject.id === state.sourceId && (sourceObject.state as RedstoneState).state === 'on') {
        return;
      }
    }

    let newState: RedstoneState = {
      state: lookState === 'off' ? 'on' : 'off',
    };
    for (const [DIRECTIONS, TYPE_ENABLER] of AXIS_DIRECTIONS) {
      for (const direction of DIRECTIONS) {
        const neighborPosition: CellPosition = {
          x: ctx.object.position.x + direction.x,
          y: ctx.object.position.y + direction.y,
        };
        const neighbor = objectAt(ctx.gridObjects, ctx.object.grid, neighborPosition);
        if (neighbor && TYPE_ENABLER.includes(neighbor.type)) {
          const neighborState = neighbor.state as RedstoneState;
          if (neighborState.state === 'on' &&
              neighborState.sourceId !== ctx.object.objectId)
          {
            newState.state = lookState;
            newState.sourceDirection = direction;
            newState.sourceId = neighbor.id;
          }
        }
      }
    }
    if (state.state === newState.state && state.sourceId === newState.sourceId) return;
    ctx.setObjectState(ctx.object.objectId, newState);
    return ActionUpdateSignal.ALL_UPDATE;
  }