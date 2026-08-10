import { type CellPosition, type GridCoord } from '@/lib/world';
import { ActionUpdateSignal, objectAt, type ObjectActionInvocationContext } from '@/lib/game-objects';

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

export const AXIS_DIRECTIONS: [GridCoord[], string[]][] = [
  [VERTICAL_DIRECTIONS, ['redstone-button', 'redstone-vertical', 'redstone-inv-vertical']],
  [HORIZONTAL_DIRECTIONS, ['redstone-button', 'redstone-horizontal', 'redstone-inv-horizontal']]
]

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