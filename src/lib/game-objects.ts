import appleUrl from '@/assets/objects/apple.svg'
import basketballUrl from '@/assets/objects/basketball.svg'
import carrotUrl from '@/assets/objects/carrot.svg'
import confettisUrl from '@/assets/objects/confettis.svg'
import giftUrl from '@/assets/objects/gift.svg'
import penguinUrl from '@/assets/objects/penguin.svg'
import poopUrl from '@/assets/objects/poop.svg'
import magnetUrl from '@/assets/objects/magnet.svg'
import soccerBallUrl from '@/assets/objects/soccer-ball.svg'
import textUrl from '@/assets/objects/text.svg'
import time0Url from '@/assets/objects/time-0.svg'
import time1Url from '@/assets/objects/time-1.svg'
import time2Url from '@/assets/objects/time-2.svg'
import time3Url from '@/assets/objects/time-3.svg'
import time4Url from '@/assets/objects/time-4.svg'
import time5Url from '@/assets/objects/time-5.svg'
import time6Url from '@/assets/objects/time-6.svg'
import time7Url from '@/assets/objects/time-7.svg'
import time8Url from '@/assets/objects/time-8.svg'
import time9Url from '@/assets/objects/time-9.svg'
import time10Url from '@/assets/objects/time-10.svg'
import time11Url from '@/assets/objects/time-11.svg'
import trexUrl from '@/assets/objects/trex.svg'
import tvUrl from '@/assets/objects/tv.svg'
import redstoneVerticalOnUrl from '@/assets/objects/redstone-vertical-on.svg'
import redstoneVerticalOffUrl from '@/assets/objects/redstone-vertical-off.svg'
import redstoneHorizontalOnUrl from '@/assets/objects/redstone-horizontal-on.svg'
import redstoneHorizontalOffUrl from '@/assets/objects/redstone-horizontal-off.svg'
import redstoneButtonUrl from '@/assets/objects/redstone-button.svg'
import watermelonUrl from '@/assets/objects/watermelon.svg'
import { CUBE_COLOR_PALETTE, CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'
import { specialCellAt, type SpecialCellMoveBehavior, type SpecialCellsState } from '@/lib/special-cells'
import {
  buildBoardCells,
  type CellPosition,
  type GridCoord,
  gridKey,
  type GridStep,
  isCellVisible,
  stepInDirection,
  type WorldState,
} from '@/lib/world'
// Type-only: use-game-world.tsx imports real values from this file
// already, but a `type` import is fully erased at compile time, so this
// doesn't create a runtime circular dependency — just a type reference,
// which TypeScript has no issue with either way. Standing convention:
// any future context-injected capability reuses its real
// GameWorldValue member's exact type the same way, rather than a
// hand-rolled simplified signature.
import type { BroadcastToastOptions, PlayersState } from '@/hooks/use-game-world'

// A grid object's per-instance state. A plain string is used directly as
// the icon-map key (see getObjectIconUrl below). An object form carries
// whatever custom fields a type needs (counters, flags, ...); its own
// `iconUrl` field selects the icon-map key instead, when present —
// falling back to the map's first entry if it's absent.
export type ObjectState = string | Record<string, unknown>

// Context an actions builder gets to decide what buttons to offer —
// also the base of what the actual button press receives (see
// ObjectActionInvocationContext below). Rich on purpose (object
// identity/location, and who's asking) so a builder can vary its
// answer per-viewer if it wants to, even though the one example this
// pass ships (confetti) doesn't need any of it.
export interface ObjectActionBuilderContext {
  objectId: string
  objectType: ObjectType
  position: CellPosition
  grid: GridCoord
  playerId: string
  playerName: string
  // Every player currently in the game, independent of who's asking —
  // lets a builder generate one action per player, e.g. the "text"
  // object below. The real PlayersState record (id -> PlayerState), not
  // a reshaped copy — see the standing convention on reusing real
  // GameWorldValue-adjacent types.
  players: PlayersState
  // Every special cell in the world, same real SpecialCellsState record
  // (keyed by gridKey) the host holds — not a reshaped copy or a
  // pre-digested single value, same convention as `players` above. Lets
  // a builder read whatever the cell under it (or any other) carries;
  // see specialCellAt in special-cells.ts. Bear in mind a cell may hold
  // a shape and no color, so test .color rather than mere presence.
  specialCells: SpecialCellsState
  // Every object across the whole world — same real GridObjectsState
  // record the host holds (keyed by gridKey), not a reshaped copy, same
  // convention as players/specialCells above. Lets a builder/action look
  // up what else is nearby, e.g. via objectAt below (see confetti's
  // action, which checks its cardinal neighbors for a clock to advance).
  gridObjects: GridObjectsState
  // The world's current dimensions (boardSize/boardRadius/worldSize) —
  // lets a builder/action reason about board edges and grid crossing,
  // e.g. via stepInDirection in world.ts (see the punch object below).
  world: WorldState
  // The object's own current state — see ObjectState/GridObject.state.
  // Undefined for stateless types (and for a type with a state that
  // hasn't been set yet).
  state?: ObjectState
}

export interface ObjectActionInvocationContext extends ObjectActionBuilderContext {
  actionName: string
  // Host-only effect the action can use — supplied by
  // use-game-world.tsx at invocation time. Signature matches
  // GameWorldValue.broadcastToast exactly, not a simplified stand-in.
  broadcastToast: (text: string, options?: BroadcastToastOptions) => void
  // Host-only: moves a special cell from `from` (on fromGrid) to `to`
  // (on toGrid — may differ from fromGrid, when the caller has already
  // resolved a crossing via stepInDirection) via moveSpecialCell in
  // special-cells.ts (behavior documented there). No-op, including no
  // broadcast, if nothing actually moves under the given behavior. Does
  // no bounds-checking of its own — from/to must already be valid,
  // in-world positions. `direction` is purely cosmetic (which way the
  // cells visually squash on every client — see the 'special-cell-shake'
  // message) — the caller's own travel direction, not re-derived from
  // from/to, since a crossing move's `to` is a mirrored entry point on a
  // different grid rather than a simple coordinate offset.
  moveSpecialCell: (
    fromGrid: GridCoord,
    from: CellPosition,
    toGrid: GridCoord,
    to: CellPosition,
    behavior: SpecialCellMoveBehavior,
    direction: GridCoord
  ) => void
  // Host-only: sets any grid object's state by id — not necessarily the
  // one whose action is running, so one object's action can drive
  // another's state too. No-op if that object no longer exists.
  // Triggers the same resync as a position change (see
  // broadcastGridObjects in use-game-world.tsx).
  setObjectState: (objectId: string, state: ObjectState | undefined) => void
  // Host-only: runs another object's action by name (or this object's
  // own, via ctx.objectId) through the exact same pipeline a player's
  // button press goes through — including hidden actions, which never
  // reach a player's dialog but are just as invokable this way. No-op
  // if the target object or named action no longer exists. Guards
  // against a cycle (this action's own trigger chain looping back on
  // itself) by no-op'ing (with a console warning) instead of recursing
  // forever.
  //
  // contextOverrides lets the caller hand the invoked action a context
  // other than the plain derived-from-the-target one — e.g. a different
  // position/grid/playerId than the target object's own — for cases
  // where the triggering object needs the callee to see values other
  // than its literal current ones. Merged on top of the normal derived
  // fields (objectId/objectType always come from the actual target, and
  // can't be overridden, so resolution always uses its real type).
  // Overrides aren't cross-derived from each other — e.g. overriding
  // playerId alone won't also change the default playerName, pass both
  // together if you need a consistent identity.
  triggerObjectAction: (
    objectId: string,
    actionName: string,
    contextOverrides?: Partial<Omit<ObjectActionBuilderContext, 'objectId' | 'objectType'>>
  ) => Promise<void>
}

export interface ObjectActionDefinition {
  name: string
  color?: CubeColor
  // Whether triggering this action also replays the object's own
  // move-hop animation (see cube-jump in index.css / GridObjectBadge) —
  // the exact same one a real position change plays, just triggered by
  // the action firing rather than an actual move. Per-action, not
  // per-object-type: most actions leave this unset.
  animate?: boolean
  // Keeps this action out of the player-facing dialog (see
  // object-action-dialog.tsx) while leaving it fully invokable by name —
  // e.g. via ctx.triggerObjectAction from another action. Omit (or
  // false) for a normal player-visible button.
  hidden?: boolean
  // May be async. Only ever actually invoked host-side (see
  // use-game-world.tsx's invokeObjectAction) — a guest pressing a
  // button always relays the press to the host first.
  action: (ctx: ObjectActionInvocationContext) => void | Promise<void>
}

// Static list, or a (possibly async) builder for computing it
// dynamically. A builder only ever runs host-side — see
// resolveObjectActions/getObjectActionsSource below.
export type ObjectActionsSource =
  | ObjectActionDefinition[]
  | ((ctx: ObjectActionBuilderContext) => ObjectActionDefinition[] | Promise<ObjectActionDefinition[]>)

// What a client actually renders a button from.
export interface ObjectActionDisplay {
  name: string
  color?: CubeColor
}

interface ObjectDefinition {
  type: string
  // A plain icon, or a state-keyed set of icons (see ObjectState/
  // getObjectIconUrl) that changes as the object's state changes.
  iconUrl: string | Record<string, string>
  // Exact spawn count per grid when set — this type is placed that many
  // times, independent of OBJECTS_PER_GRID_MIN/MAX. Omit to let it
  // compete in the random pool instead.
  countPerGrid?: number
  // Enables the "near object" floating action dialog (see
  // object-action-dialog.tsx) when set.
  actions?: ObjectActionsSource
  // False makes this type block the player outright instead of being
  // pushed — a wall, not an obstacle. Omit (or true) for today's
  // default pushable behavior.
  moveable?: boolean
  // Initial state for newly spawned/placed objects of this type (see
  // generateGridObjects and use-game-world.tsx's placeInventoryItem).
  // Omit for stateless types.
  defaultState?: ObjectState
  // Optional icon override for this type's entry in the Inventaire
  // picker list (see inventory-items.ts's buildInventoryItems /
  // InventoryItemIcon) — useful for a state-keyed iconUrl type (clock,
  // redstone) where showing whatever defaultState's icon happens to be
  // wouldn't represent the type well in a static list. Falls back to
  // the normal iconUrl resolution (getObjectIconUrl) when omitted.
  itemUrl?: string
}

// Resolves the two cells punch/pull operate on: `near` is the cell
// directly in front of the object (always on the object's own grid —
// see stepInDirection's doc for why that step alone never crosses), and
// `far` is one cell beyond that (which may cross into a neighboring
// grid). Null when the player can't be found, or either cell doesn't
// exist — both actions treat that as a silent no-op.
function resolvePunchCells(
  ctx: ObjectActionInvocationContext
): { near: GridStep; far: GridStep; direction: GridCoord } | null {
  const player = ctx.players[ctx.playerId]
  if (!player) return null
  // "Front" is the direction the player is facing through the object —
  // i.e. the same direction from player to object, continued.
  const direction: GridCoord = {
    x: ctx.position.x - player.position.x,
    y: ctx.position.y - player.position.y,
  }
  const nearPosition: CellPosition = { x: ctx.position.x + direction.x, y: ctx.position.y + direction.y }
  // Near never crosses a grid boundary — punch/pull only ever reach a
  // cell on the object's own grid, even though a mirrored cell
  // technically exists on the neighbor.
  if (!isCellVisible(nearPosition, ctx.world)) return null
  // One cell further can legitimately cross an edge, though — same as a
  // pushed object crossing (see pushObjectIfPresent in use-game-world.tsx).
  const far = stepInDirection(ctx.grid, nearPosition, direction, ctx.world)
  if (!far) return null
  return { near: { grid: ctx.grid, position: nearPosition }, far, direction }
}

// Clock's state cycles through this many hours ('0'-'11'), wrapping both
// directions — see its Avancer/Reculer actions below.
const CLOCK_HOURS = 12

// N, E, S, W — used by confetti's action below to check its four
// same-grid neighbors for a clock to advance.
const CARDINAL_DIRECTIONS: GridCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

// Vertical neighbours only — used by redstone-vertical to propagate a
// state change upward/downward.
const VERTICAL_DIRECTIONS: GridCoord[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
]

const HORIZONTAL_DIRECTIONS: GridCoord[] = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
]

// Single source of truth for every object type: each one's name appears
// exactly once, right here, alongside its icon. ObjectType is derived
// from this list instead of being maintained by hand alongside it.
export const OBJECT_TYPES = [
  { type: 'apple', iconUrl: appleUrl },
  { type: 'basketball', iconUrl: basketballUrl },
  { type: 'carrot', iconUrl: carrotUrl },
  { type: 'gift', iconUrl: giftUrl },
  { type: 'penguin', iconUrl: penguinUrl },
  { type: 'poop', iconUrl: poopUrl },
  { type: 'soccer-ball', iconUrl: soccerBallUrl },
  { type: 'trex', iconUrl: trexUrl },
  { type: 'tv', iconUrl: tvUrl },
  { type: 'watermelon', iconUrl: watermelonUrl },
  {
    type: 'confetti',
    iconUrl: confettisUrl,
    actions: [
      {
        name: 'Confetti !',
        color: 'yellow',
        action: (ctx) => {
          ctx.broadcastToast(`C'est la fête ! {{object:${ctx.objectType}}}`)
          for (const direction of CARDINAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor?.type === 'clock') {
              void ctx.triggerObjectAction(neighbor.id, 'Avancer')
            }
          }
        },
      },
    ],
  },
  {
    type: 'text',
    iconUrl: textUrl,
    // Dynamic: one button per other player in the game, resolved fresh
    // (host-side only) every time — never the asker themselves. Both the
    // buttons and the toast they send borrow the color of the special
    // cell this object happens to be standing on; on a plain cell (or a
    // shape-only one) they stay uncolored, which both renderers already
    // treat as white.
    actions: (ctx) => {
      const cellColor = specialCellAt(ctx.specialCells, ctx.grid, ctx.position)?.color
      return Object.entries(ctx.players)
        .filter(([playerId]) => playerId !== ctx.playerId)
        .map(([playerId, player]) => ({
          name: `Text ${player.username}`,
          color: cellColor,
          action: (actionCtx) => {
            // Re-read instead of closing over cellColor above: the action
            // runs from a freshly built invocation context, so this is
            // the cell the object is on *now*, not whenever the buttons
            // last resolved (it may have been pushed since).
            const color = specialCellAt(actionCtx.specialCells, actionCtx.grid, actionCtx.position)?.color
            actionCtx.broadcastToast('Hello world', {
              playerIds: [playerId],
              // CubeColorPalette is structurally ToastColors ({fg, bg}) —
              // same reason randomToastColors() drops straight in.
              colors: color ? CUBE_COLOR_PALETTE[color] : undefined,
            })
          },
        }))
    },
  },
  {
    type: 'magnet',
    iconUrl: magnetUrl,
    // Static, always-available buttons (like confetti above), not a
    // builder: the object doesn't need per-viewer state to decide
    // whether to offer them — both share resolvePunchCells above, and
    // treat an empty/off-board result the same way, as a silent no-op
    // (a wasted swing, or an empty-handed pull).
    actions: [
      {
        name: 'Pousser',
        animate: true,
        action: (ctx) => {
          const cells = resolvePunchCells(ctx)
          if (!cells) return
          ctx.moveSpecialCell(
            cells.near.grid,
            cells.near.position,
            cells.far.grid,
            cells.far.position,
            'MERGE_CELL',
            cells.direction
          )
        },
      },
      {
        name: 'Tirer',
        animate: true,
        // Mirror image of Punch: same near/far pair, moved the other
        // way — so the visual travel direction is the opposite of
        // Punch's facing direction, not the same one.
        action: (ctx) => {
          const cells = resolvePunchCells(ctx)
          if (!cells) return
          ctx.moveSpecialCell(
            cells.far.grid,
            cells.far.position,
            cells.near.grid,
            cells.near.position,
            'MERGE_CELL',
            { x: -cells.direction.x, y: -cells.direction.y }
          )
        },
      },
    ],
  },
  {
    type: 'clock',
    iconUrl: {
      '0': time0Url,
      '1': time1Url,
      '2': time2Url,
      '3': time3Url,
      '4': time4Url,
      '5': time5Url,
      '6': time6Url,
      '7': time7Url,
      '8': time8Url,
      '9': time9Url,
      '10': time10Url,
      '11': time11Url,
    },
    defaultState: '0',
    actions: [
      {
        name: 'on',
        hidden: true,
        action: (ctx) => {
          const hour = Number((typeof ctx.state === 'string' ? ctx.state : undefined) ?? '0')
          ctx.setObjectState(ctx.objectId, String((hour + 1) % CLOCK_HOURS))
        },
      },
      {
        name: 'Avancer',
        action: (ctx) => {
          const hour = Number((typeof ctx.state === 'string' ? ctx.state : undefined) ?? '0')
          ctx.setObjectState(ctx.objectId, String((hour + 1) % CLOCK_HOURS))
        },
      },
      {
        name: 'Reculer',
        action: (ctx) => {
          const hour = Number((typeof ctx.state === 'string' ? ctx.state : undefined) ?? '0')
          ctx.setObjectState(ctx.objectId, String((hour + CLOCK_HOURS - 1) % CLOCK_HOURS))
        },
      },
    ],
  },
  {
    type: 'redstone-vertical',
    iconUrl: {
      'off': redstoneVerticalOffUrl,
      'on': redstoneVerticalOnUrl,
    },
    defaultState: 'off',
    actions: [
      {
        name: 'on',
        hidden: true,
        action: (ctx) => {
          if (ctx.state === 'on') return;
          ctx.setObjectState(ctx.objectId, 'on');
          for (const direction of HORIZONTAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor) {
              void ctx.triggerObjectAction(neighbor.id, 'on')
            }
          }
        }
      },
      {
        name: 'off',
        hidden: true,
        action: (ctx) => {
        if (ctx.state === 'off') return;
          ctx.setObjectState(ctx.objectId, 'off');
          for (const direction of HORIZONTAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor) {
              void ctx.triggerObjectAction(neighbor.id, 'off')
            }
          }
        }
      }
    ]
  },
  {
    type: 'redstone-horizontal',
    iconUrl: {
      'off': redstoneHorizontalOffUrl,
      'on': redstoneHorizontalOnUrl,
    },
    defaultState: 'off',
    actions: [
      {
        name: 'on',
        hidden: true,
        action: (ctx) => {
          if (ctx.state === 'on') return;
          ctx.setObjectState(ctx.objectId, 'on');
          for (const direction of VERTICAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor) {
              void ctx.triggerObjectAction(neighbor.id, 'on')
            }
          }
        }
      },
      {
        name: 'off',
        hidden: true,
        action: (ctx) => {
        if (ctx.state === 'off') return;
          ctx.setObjectState(ctx.objectId, 'off');
          for (const direction of VERTICAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor) {
              void ctx.triggerObjectAction(neighbor.id, 'off')
            }
          }
        }
      }
    ]
  },
  {
    type: 'redstone-button',
    iconUrl: redstoneButtonUrl,
    actions: [
      {
        name: 'on',
        action: (ctx) => {
          if (ctx.state === 'on') return;
          ctx.setObjectState(ctx.objectId, 'on');
          for (const direction of CARDINAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor) {
              void ctx.triggerObjectAction(neighbor.id, 'on')
            }
          }
        }
      },
      {
        name: 'off',
        action: (ctx) => {
        if (ctx.state === 'off') return;
          ctx.setObjectState(ctx.objectId, 'off');
          for (const direction of CARDINAL_DIRECTIONS) {
            const neighborPosition: CellPosition = {
              x: ctx.position.x + direction.x,
              y: ctx.position.y + direction.y,
            }
            const neighbor = objectAt(ctx.gridObjects, ctx.grid, neighborPosition)
            if (neighbor) {
              void ctx.triggerObjectAction(neighbor.id, 'off')
            }
          }
        }
      }
    ]
  }
] as const satisfies ObjectDefinition[]

export type ObjectType = (typeof OBJECT_TYPES)[number]['type']

// Typed as the general ObjectDefinition (not the literal-per-entry union
// OBJECT_TYPES itself infers) so optional fields like actions/
// countPerGrid can be read here without a per-call cast.
export const OBJECT_TYPES_BY_ID = new Map<ObjectType, ObjectDefinition>(
  OBJECT_TYPES.map((definition) => [definition.type, definition])
)

// A plain string state is itself the icon-map key; an object-form state
// uses its own `iconUrl` field instead, if present.
function stateIconKey(state: ObjectState | undefined): string | undefined {
  if (typeof state === 'string') return state
  const value = state?.iconUrl
  return typeof value === 'string' ? value : undefined
}

export function getObjectIconUrl(type: ObjectType, state?: ObjectState): string {
  // OBJECT_TYPES_BY_ID is built from every entry of OBJECT_TYPES, and
  // ObjectType only ever holds one of those entries' type — always found.
  const definition = OBJECT_TYPES_BY_ID.get(type)!
  if (typeof definition.iconUrl === 'string') return definition.iconUrl
  const key = stateIconKey(state) ?? stateIconKey(definition.defaultState)
  // Falls back to the map's first entry rather than ever rendering a
  // broken image, when no state/defaultState resolves to a known key.
  return (key !== undefined ? definition.iconUrl[key] : undefined) ?? Object.values(definition.iconUrl)[0]
}

export function getObjectItemUrl(type: ObjectType): string {
  return OBJECT_TYPES_BY_ID.get(type)!.itemUrl ?? getObjectIconUrl(type)
}

// Host-only in practice: runs the builder if there is one. Used both
// for the host's own local display and for answering a guest's
// 'object-actions-request' (see use-game-world.tsx) — the host is
// always allowed to execute it, unlike a guest.
export async function resolveObjectActions(
  type: ObjectType,
  ctx: ObjectActionBuilderContext
): Promise<ObjectActionDefinition[]> {
  const actions = OBJECT_TYPES_BY_ID.get(type)!.actions
  if (!actions) return []
  return typeof actions === 'function' ? await actions(ctx) : actions
}

// Safe for a guest to call locally: only tells you *what kind* of
// source this type has, never executes a builder.
export function getObjectActionsSource(type: ObjectType): ObjectActionsSource | undefined {
  return OBJECT_TYPES_BY_ID.get(type)!.actions
}

// Random count of objects generated per grid; tune to taste.
export const OBJECTS_PER_GRID_MIN = 3
export const OBJECTS_PER_GRID_MAX = 3

export interface GridObject {
  id: string
  // A cell holds at most one object, centered on it.
  position: CellPosition
  type: ObjectType
  color: CubeColor
  // Per-instance state — see ObjectState. Undefined for stateless types.
  state?: ObjectState
}

export type GridObjectsState = Record<string, GridObject[]>

// The object on a given grid's given position, if any — same
// shape/convention as specialCellAt in special-cells.ts.
export function objectAt(
  objects: GridObjectsState,
  grid: GridCoord,
  position: CellPosition
): GridObject | undefined {
  return (objects[gridKey(grid)] ?? []).find(
    (object) => object.position.x === position.x && object.position.y === position.y
  )
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function generateObjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Objects for a single grid: types with a configured countPerGrid
// (see ObjectDefinition) always spawn exactly that many times; every
// other type competes for a random count (within the configured
// interval, capped to whatever board space is left) instead — scattered
// over random cells, at most one object per cell.
function generateGridObjects(world: WorldState): GridObject[] {
  const boardCells = buildBoardCells(world)
  if (boardCells.length === 0) return []

  const usedCells = new Set<string>()
  const objects: GridObject[] = []

  // Bounded retries: guards against spinning forever picking already-used
  // cells as the board fills up.
  const maxAttemptsPerObject = boardCells.length * 4

  function placeOne(type: ObjectType): void {
    if (objects.length >= boardCells.length) return
    let attempts = 0
    while (attempts < maxAttemptsPerObject) {
      attempts += 1
      const cell = randomItem(boardCells)
      const cellKey = gridKey(cell)
      if (usedCells.has(cellKey)) continue
      usedCells.add(cellKey)
      objects.push({
        id: generateObjectId(),
        position: cell,
        type,
        color: randomItem(CUBE_COLORS),
        state: OBJECT_TYPES_BY_ID.get(type)?.defaultState,
      })
      return
    }
  }

  const randomTypes: ObjectType[] = []
  for (const definition of OBJECT_TYPES) {
    // OBJECT_TYPES is `as const`, so TS infers each entry's literal
    // shape rather than ObjectDefinition — countPerGrid is read via a
    // cast on just this one expression, keeping `definition.type`'s own
    // literal type (needed by placeOne/randomTypes below) intact.
    const countPerGrid = (definition as ObjectDefinition).countPerGrid
    if (countPerGrid !== undefined) {
      for (let i = 0; i < countPerGrid; i++) placeOne(definition.type)
    } else {
      randomTypes.push(definition.type)
    }
  }

  if (randomTypes.length > 0) {
    const count = Math.min(
      boardCells.length - objects.length,
      OBJECTS_PER_GRID_MIN + Math.floor(Math.random() * (OBJECTS_PER_GRID_MAX - OBJECTS_PER_GRID_MIN + 1))
    )
    for (let i = 0; i < count; i++) placeOne(randomItem(randomTypes))
  }

  return objects
}

// Rolls objects for every grid of the world in one pass — mirrors
// generateGridColors in world.ts: generated once by the host at the
// start of a game and persisted (see room-store.ts), not derived from
// coordinates.
export function generateWorldObjects(world: WorldState): GridObjectsState {
  const state: GridObjectsState = {}
  for (let y = 0; y < world.worldSize; y++) {
    for (let x = 0; x < world.worldSize; x++) {
      const grid: GridCoord = { x, y }
      state[gridKey(grid)] = generateGridObjects(world)
    }
  }
  return state
}
