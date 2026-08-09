import { gridKey, type CellPosition, type GridCoord } from '@/lib/world';
import { ActionUpdateSignal, objectAt, type GridObject, type ObjectActionInvocationContext } from '@/lib/game-objects';

export type RedstoneState = {
  state: 'on' | 'off'
  sourceDirection?: { x: number; y: number },
  sourceId?: string
  distance?: number
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

// The direction pointing from this object toward whatever object
// triggered it, when that's a same-grid source — so a cascade can skip
// echoing straight back the way it came. Undefined for a direct/player
// trigger (ctx.triggerObject unset) or a source on another grid.
export function sourceDirection(ctx: ObjectActionInvocationContext): GridCoord | undefined {
  const source = ctx.triggerObject
  if (!source || gridKey(source.grid) !== gridKey(ctx.object.grid)) return undefined
  return { x: source.position.x - ctx.object.position.x, y: source.position.y - ctx.object.position.y }
}

// Reads a redstone neighbor's on/off-ness for the OR-checks below.
// redstone-vertical stores RedstoneState (an object form, see
// redstone.ts) — every other redstone type still stores a plain
// 'on'/'off' string, so this is the one spot that needs to know the
// difference.
export function redstoneNeighborIsOn(neighbor: GridObject | undefined): boolean {
  if (!neighbor) return false
  if (neighbor.type === 'redstone-vertical') return (neighbor.state as RedstoneState | undefined)?.state === 'on'
  return neighbor.state === 'on'
}

export const AXIS_DIRECTIONS: [GridCoord[], string[]][] = [
  [VERTICAL_DIRECTIONS, ['redstone-button', 'redstone-vertical', 'redstone-inv-vertical']],
  [HORIZONTAL_DIRECTIONS, ['redstone-button', 'redstone-horizontal', 'redstone-inv-horizontal']]
]

export function updateRedstoneAction(ctx: ObjectActionInvocationContext) {
    const lookState = ctx.object.objectType.startsWith('redstone-inv') ? 'off' : 'on';
    const state = ctx.state as RedstoneState;

    if (state.state === 'off' && state.sourceDirection && state.sourceId) {
      const sourcePosition: CellPosition = {
        x: ctx.object.position.x + state.sourceDirection.x,
        y: ctx.object.position.y + state.sourceDirection.y,
      };

      const sourceObject = objectAt(ctx.gridObjects, ctx.object.grid, sourcePosition);
      if (sourceObject && sourceObject.id === state.sourceId && (sourceObject.state as RedstoneState).state === 'off') {
        return;
      }
    }

    let newState: RedstoneState = { state: 'on' };
    for (const [DIRECTIONS, TYPE_ENABLER] of AXIS_DIRECTIONS) {
      for (const direction of DIRECTIONS) {
        const neighborPosition: CellPosition = {
          x: ctx.object.position.x + direction.x,
          y: ctx.object.position.y + direction.y,
        };
        const neighbor = objectAt(ctx.gridObjects, ctx.object.grid, neighborPosition);
        if (neighbor && TYPE_ENABLER.includes(neighbor.type)) {
          const neighborState = neighbor.state as RedstoneState;
          if (neighborState.state === 'off' && neighborState.sourceId !== ctx.object.objectId) {
            newState.state = 'on';
            newState.sourceDirection = direction;
            newState.sourceId = neighbor.id;
            break;
          }
        }
      }
    }
    if (state.state === newState.state && state.sourceId === newState.sourceId) return;
    ctx.setObjectState(ctx.object.objectId, newState);
    return ActionUpdateSignal.ALL_UPDATE;
  }