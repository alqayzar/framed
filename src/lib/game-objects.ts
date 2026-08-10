import appleUrl from '@/assets/objects/apple.svg'
import basketballUrl from '@/assets/objects/basketball.svg'
import carrotUrl from '@/assets/objects/carrot.svg'
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
import redstoneButtonOffUrl from '@/assets/objects/redstone-button-off.svg'
import redstoneButtonOnUrl from '@/assets/objects/redstone-button-on.svg'
import redstoneDetectorOffUrl from '@/assets/objects/redstone-detector-off.svg'
import redstoneDetectorOnUrl from '@/assets/objects/redstone-detector-on.svg'
import redstoneInvHorizontalOffUrl from '@/assets/objects/redstone-inv-horizontal-off.svg'
import redstoneInvHorizontalOnUrl from '@/assets/objects/redstone-inv-horizontal-on.svg'
import redstoneInvVerticalOffUrl from '@/assets/objects/redstone-inv-vertical-off.svg'
import redstoneInvVerticalOnUrl from '@/assets/objects/redstone-inv-vertical-on.svg'
import redstoneLightOnUrl from '@/assets/objects/redstone-light-on.svg'
import redstoneLightOffUrl from '@/assets/objects/redstone-light-off.svg'
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
// PlayerState/PlayersState/BroadcastToastOptions live here rather than in
// use-game-world.tsx (which re-exports them) specifically so this file
// never needs to import from it — use-game-world.tsx already imports real
// values from this file, and a reverse import back would be a real cycle.
import type { BroadcastToastOptions, PlayersState } from '@/lib/player-state'
import { AXIS_DIRECTIONS, updateRedstoneAction, updateRedstoneDetectorAction, type RedstoneState } from '@/lib/redstone'

// A grid object's per-instance state. A plain string is used directly as
// the icon-map key (see getObjectIconUrl below). An object form carries
// whatever custom fields a type needs (counters, flags, ...); its own
// `state` field selects the icon-map key instead, when present —
// falling back to the map's first entry if it's absent.
export type ObjectState = string | Record<string, unknown>

// Context an actions builder gets to decide what buttons to offer —
// also the base of what the actual button press receives (see
// ObjectActionInvocationContext below). Rich on purpose (object
// identity/location, and who's asking) so a builder can vary its
// answer per-viewer if it wants to, even though the one example this
// pass ships (confetti) doesn't need any of it.
// Identifies a single grid object: which one, and where — always a
// real object, all fields required. Used for "the object this context
// is about" (ObjectActionBuilderContext.object above), which must
// always be a real object. See TriggerRef below for the (structurally
// compatible, so this still assigns straight into it) looser shape
// `triggerObject` actually uses.
export interface ActionObjectRef {
  objectId: string
  objectType: ObjectType
  position: CellPosition
  grid: GridCoord
}

// Identifies whatever caused a triggered invocation. Always carries
// the position/grid of wherever it happened; objectId/objectType are
// only present when a specific object is the cause — either it's the
// one whose own action triggered this (see ctx.triggerObjectAction),
// or, for the isUpdate cell-change mechanism (see getUpdateActionName /
// notifyCellChanged in use-game-world.tsx), it's the object that now
// occupies the changed cell — omitted when nothing does (the change
// was special-cell-only, or an object just left). ActionObjectRef (all
// fields required) is always assignable here, so every existing
// `triggerObject: ctx.object` forwarding call needs no changes.
export interface TriggerRef {
  objectId?: string
  objectType?: ObjectType
  position: CellPosition
  grid: GridCoord
}

export interface ObjectActionBuilderContext {
  object: ActionObjectRef
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
  state?: ObjectState,
  // Set only when this invocation was caused by another object's action
  // calling ctx.triggerObjectAction — the origin object's identity/
  // location at the moment it triggered, distinct from this context's
  // own `object` above. Undefined for a direct trigger (a player's own
  // button press, or a raw 'object-action' message) — the normal case.
  triggerObject?: TriggerRef
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
  // own, via ctx.object.objectId) through the exact same pipeline a
  // player's button press goes through — including hidden actions,
  // which never reach a player's dialog but are just as invokable this
  // way. No-op if the target object or named action no longer exists.
  // Cycles are allowed and expected — an object triggering another that
  // eventually triggers it back (e.g. a redstone inverter feeding into
  // itself as a clock) will keep going indefinitely; each hop is
  // throttled onto its own tick (see invokeObjectAction in
  // use-game-world.tsx) so a running loop never blocks the tab, but
  // nothing here will ever stop one on its own.
  //
  // contextOverrides lets the caller hand the invoked action a context
  // other than the plain derived-from-the-target one — e.g. a different
  // playerId than the target object's own — for cases where the
  // triggering object needs the callee to see values other than its
  // literal current ones. Merged on top of the normal derived fields
  // (`object` always comes from the actual target, and can't be
  // overridden, so resolution always uses its real type). Overrides
  // aren't cross-derived from each other — e.g. overriding playerId
  // alone won't also change the default playerName, pass both together
  // if you need a consistent identity.
  triggerObjectAction: (
    objectId: string,
    actionName: string,
    contextOverrides?: Partial<Omit<ObjectActionBuilderContext, 'object'>>
  ) => Promise<void>
}

// What an action's own return value tells invokeObjectAction to do
// about notifying this cell's neighbors afterward (see notifyCellChanged
// in use-game-world.tsx) — NO_UPDATE for none, ALL_UPDATE to notify all
// 4 orthogonal neighbors unconditionally, UPDATE_NO_CYCLE to notify them
// except whichever one (if any) triggered this call in the first place,
// so a cascade doesn't immediately echo straight back the way it came.
// A real `enum` isn't usable here — this project builds with
// erasableSyntaxOnly, which forbids it (enums aren't erasable, they
// compile to a runtime object) — so this is the const-object stand-in.
export const ActionUpdateSignal = {
  NO_UPDATE: 'NO_UPDATE',
  ALL_UPDATE: 'ALL_UPDATE',
  UPDATE_NO_CYCLE: 'UPDATE_NO_CYCLE',
} as const
export type ActionUpdateSignal = (typeof ActionUpdateSignal)[keyof typeof ActionUpdateSignal]

export interface ObjectActionDefinition {
  // A single name, or several this same definition answers to —
  // differentiate inside the callback via ctx.actionName. Useful for
  // one callback shared by a small set of related triggers (e.g.
  // 'on'/'off') without duplicating the whole definition. See
  // actionNames below for how callers consume this.
  name: string | string[]
  // A single value, or one per name in `name` above (index-mapped) —
  // when there are fewer values than names, the last one carries
  // forward to cover the rest; when there are more, the extras are
  // ignored. See resolveActionNames below for how callers resolve this.
  color?: CubeColor | CubeColor[]
  // Whether triggering this action also replays the object's own
  // move-hop animation (see cube-jump in index.css / GridObjectBadge) —
  // the exact same one a real position change plays, just triggered by
  // the action firing rather than an actual move. Per-action, not
  // per-object-type: most actions leave this unset. Same per-name rules
  // as `color` above.
  animate?: boolean | boolean[]
  // Keeps this action out of the player-facing dialog (see
  // object-action-dialog.tsx) while leaving it fully invokable by name —
  // e.g. via ctx.triggerObjectAction from another action. Omit (or
  // false) for a normal player-visible button. Same per-name rules as
  // `color` above.
  hidden?: boolean | boolean[]
  // Marks this as the action notifyCellChanged (use-game-world.tsx)
  // invokes on a same-grid cardinal neighbor after a cell changes — see
  // getUpdateActionName below. Independent of what this action is
  // named — that function hands whatever name it carries straight to
  // invokeObjectAction. Must be on this type's first action, since
  // that's all getUpdateActionName checks (no player context to resolve
  // a dynamic builder against for a world-driven notification).
  isUpdate?: boolean
  // May be async. Return an ActionUpdateSignal to also notify this
  // object's own cell's neighbors as if the cell had changed (see
  // notifyCellChanged in use-game-world.tsx) — e.g. an in-place .state
  // change that should still ripple, even though nothing appeared/left.
  // Returning nothing (void/undefined) keeps existing behavior: no
  // notification. Only ever actually invoked host-side (see
  // use-game-world.tsx's invokeObjectAction) — a guest pressing a button
  // always relays the press to the host first.
  action: (ctx: ObjectActionInvocationContext) => ActionUpdateSignal | void | Promise<ActionUpdateSignal | void>
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

// A single icon-map entry: a plain URL, or a URL plus its own
// iconScale/offsetX/offsetY overrides — any of those left unset falls
// back to the type-level iconScale/offsetX/offsetY below. See
// getObjectIconScale/getObjectIconOffset.
export type ObjectIconUrl = string | { url: string; iconScale?: number; offsetX?: number; offsetY?: number }

interface ObjectDefinition {
  type: string
  // A plain icon, or a state-keyed set of icons (see ObjectState/
  // getObjectIconUrl) that changes as the object's state changes. A
  // map entry can override this type's iconScale/offsetX/offsetY for
  // just that state — see ObjectIconUrl.
  iconUrl: string | Record<string, ObjectIconUrl>
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
  // Display name for this type — shown in the Inventaire picker (see
  // inventory-items.ts's buildInventoryItems / getObjectLabel below).
  // Omit to fall back to the raw `type` string.
  label?: string
  // Scales this type's rendered on-grid icon relative to the default
  // size (see GridObjectBadge in game-grid.tsx, via getObjectIconScale)
  // — 1.5 renders 50% bigger, 0.5 renders half size. Omit (or 1) for
  // today's default. A specific state's own iconUrl entry can override
  // this for just that state — see ObjectIconUrl.
  iconScale?: number
  // Nudges this type's rendered on-grid icon away from its cell's
  // center, in exact pixels (negative shifts left/up). Independent of
  // iconScale. Omit (or 0) for today's default, centered. Same
  // per-state override as iconScale above, via getObjectIconOffset.
  offsetX?: number
  offsetY?: number
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
  // triggerObject (set when another object's action triggered this one,
  // e.g. a redstone wire) takes priority over the invoking player's own
  // position — playerId stays the original human across an entire
  // cascade, so it's almost always resolvable even when this specific
  // hop was actually caused by an object standing right next to this
  // one, not by that (possibly far-away) player.
  const triggerPosition = ctx.triggerObject?.position ?? ctx.players[ctx.playerId]?.position
  if (!triggerPosition) return null
  // "Front" is the direction the trigger is facing through the object —
  // i.e. the same direction from the trigger to the object, continued.
  const direction: GridCoord = {
    x: ctx.object.position.x - triggerPosition.x,
    y: ctx.object.position.y - triggerPosition.y,
  }
  const nearPosition: CellPosition = {
    x: ctx.object.position.x + direction.x,
    y: ctx.object.position.y + direction.y,
  }
  // Near never crosses a grid boundary — punch/pull only ever reach a
  // cell on the object's own grid, even though a mirrored cell
  // technically exists on the neighbor.
  if (!isCellVisible(nearPosition, ctx.world)) return null
  // One cell further can legitimately cross an edge, though — same as a
  // pushed object crossing (see pushObjectIfPresent in use-game-world.tsx).
  const far = stepInDirection(ctx.object.grid, nearPosition, direction, ctx.world)
  if (!far) return null
  return { near: { grid: ctx.object.grid, position: nearPosition }, far, direction }
}

// Clock's state cycles through this many hours ('0'-'11'), wrapping both
// directions — see its Avancer/Reculer actions below.
const CLOCK_HOURS = 12

// Single source of truth for every object type: each one's name appears
// exactly once, right here, alongside its icon. ObjectType is derived
// from this list instead of being maintained by hand alongside it.
export const OBJECT_TYPES = [
  { type: 'apple', iconUrl: appleUrl, label: 'Pomme' },
  { type: 'basketball', iconUrl: basketballUrl, label: 'Ballon de basket' },
  { type: 'carrot', iconUrl: carrotUrl, label: 'Carotte' },
  { type: 'gift', iconUrl: giftUrl, label: 'Cadeau' },
  { type: 'penguin', iconUrl: penguinUrl, label: 'Pingouin' },
  { type: 'poop', iconUrl: poopUrl, label: 'Caca' },
  { type: 'soccer-ball', iconUrl: soccerBallUrl, label: 'Ballon de foot' },
  { type: 'trex', iconUrl: trexUrl, label: 'T-Rex' },
  { type: 'tv', iconUrl: tvUrl, label: 'Télé' },
  { type: 'watermelon', iconUrl: watermelonUrl, label: 'Pastèque' },
  {
    type: 'text',
    iconUrl: textUrl,
    label: 'Texte',
    // Dynamic: one button per other player in the game, resolved fresh
    // (host-side only) every time — never the asker themselves. Both the
    // buttons and the toast they send borrow the color of the special
    // cell this object happens to be standing on; on a plain cell (or a
    // shape-only one) they stay uncolored, which both renderers already
    // treat as white.
    actions: (ctx) => {
      const cellColor = specialCellAt(ctx.specialCells, ctx.object.grid, ctx.object.position)?.color
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
            const color = specialCellAt(actionCtx.specialCells, actionCtx.object.grid, actionCtx.object.position)?.color
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
    label: 'Aimant',
    // Static, always-available buttons (like confetti above), not a
    // builder: the object doesn't need per-viewer state to decide
    // whether to offer them — both share resolvePunchCells above, and
    // treat an empty/off-board result the same way, as a silent no-op
    // (a wasted swing, or an empty-handed pull).
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        animate: true,
        hidden: true,
        action(ctx) {
          if (ctx.triggerObject?.objectType?.startsWith('redstone-')) {
            const triggerObject = objectAt(ctx.gridObjects, ctx.object.grid, ctx.triggerObject.position);
            const triggerState = triggerObject?.state as RedstoneState;
            ctx.triggerObjectAction(ctx.object.objectId, triggerState.state === 'on' ? 'Pousser' : 'Tirer', ctx);
            return ActionUpdateSignal.UPDATE_NO_CYCLE;
          }
        },
      },
      {
        name: ['Pousser', 'Tirer'],
        animate: true,
        hidden: false,
        action: (ctx) => {
          const cells = resolvePunchCells(ctx)
          if (!cells) return
          const pushMode = ['Pousser', 'on'].includes(ctx.actionName);
          const from = pushMode ? cells.near : cells.far;
          const to = pushMode ? cells.far : cells.near;
          ctx.moveSpecialCell(
            from.grid,
            from.position,
            to.grid,
            to.position,
            'MERGE_CELL',
            pushMode
              ? cells.direction
              : { x: -cells.direction.x, y: -cells.direction.y }
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
    label: 'Horloge',
    defaultState: '0',
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        action: (ctx) => {
          ctx.triggerObjectAction(ctx.object.objectId, 'on')
          return ActionUpdateSignal.UPDATE_NO_CYCLE
        },
      },
      {
        name: 'on',
        hidden: true,
        action: (ctx) => {
          const hour = Number((typeof ctx.state === 'string' ? ctx.state : undefined) ?? '0')
          ctx.setObjectState(ctx.object.objectId, String((hour + 1) % CLOCK_HOURS))
        },
      },
      {
        name: 'Avancer',
        action: (ctx) => {
          const hour = Number((typeof ctx.state === 'string' ? ctx.state : undefined) ?? '0')
          ctx.setObjectState(ctx.object.objectId, String((hour + 1) % CLOCK_HOURS))
        },
      },
      {
        name: 'Reculer',
        action: (ctx) => {
          const hour = Number((typeof ctx.state === 'string' ? ctx.state : undefined) ?? '0')
          ctx.setObjectState(ctx.object.objectId, String((hour + CLOCK_HOURS - 1) % CLOCK_HOURS))
        },
      },
    ],
  },
  {
    type: 'redstone-vertical',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    iconUrl: {
      'off': redstoneVerticalOffUrl,
      'on': redstoneVerticalOnUrl,
    },
    label: 'Redstone verticale',
    defaultState: { state: 'off' } satisfies RedstoneState,
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        action: updateRedstoneAction
      },
    ]
  },
  {
    type: 'redstone-horizontal',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    iconUrl: {
      'off': redstoneHorizontalOffUrl,
      'on': redstoneHorizontalOnUrl,
    },
    label: 'Redstone horizontale',
    defaultState: { state: 'off' } satisfies RedstoneState,
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        action: updateRedstoneAction
      },
    ]
  },
  {
    type: 'redstone-inv-horizontal',
    iconUrl: {
      'off': redstoneInvHorizontalOffUrl,
      'on': redstoneInvHorizontalOnUrl,
    },
    label: 'Inverseur redstone horizontal',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    defaultState: { state: 'on' } satisfies RedstoneState,
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        action: updateRedstoneAction
      },
    ]
  },
  {
    type: 'redstone-inv-vertical',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    iconUrl: {
      'off': redstoneInvVerticalOffUrl,
      'on': redstoneInvVerticalOnUrl,
    },
    label: 'Inverseur redstone vertical',
    defaultState: { state: 'on' } satisfies RedstoneState,
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        action: updateRedstoneAction
      },
    ]
  },
  {
    type: 'redstone-button',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    iconUrl: {
      'off': redstoneButtonOffUrl,
      'on': redstoneButtonOnUrl
    },
    label: 'Bouton redstone',
    defaultState: { state: 'off' } satisfies RedstoneState,
    actions: [
      {
        name: 'Appuyer',
        action: (ctx) => {
          ctx.setObjectState(ctx.object.objectId, {
            state: (ctx.state as RedstoneState).state === 'on' ? 'off' : 'on'
          } satisfies RedstoneState);
          return ActionUpdateSignal.ALL_UPDATE;
        }
      },
    ]
  },
  {
    type: 'redstone-detector',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    iconUrl: {
      'off': redstoneDetectorOffUrl,
      'on': redstoneDetectorOnUrl,
    },
    label: 'Détecteur redstone',
    defaultState: { state: 'off' } satisfies RedstoneState,
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        action: updateRedstoneDetectorAction
      },
    ]
  },
  {
    type: 'light',
    iconScale: 1.8,
    offsetX: -3,
    offsetY: -3,
    iconUrl: {
      'off': redstoneLightOffUrl,
      'on': redstoneLightOnUrl
    },
    label: 'Lumière redstone',
    defaultState: { state: 'off' } satisfies RedstoneState,
    actions: [
      {
        name: 'refresh',
        isUpdate: true,
        hidden: true,
        // animate: true,
        action: (ctx) => {
          const state = ctx.state as RedstoneState;
          let nextState: RedstoneState['state'] = 'off';
          for (const [DIRECTIONS] of AXIS_DIRECTIONS) {
            for (const direction of DIRECTIONS) {
              const neighborPosition: CellPosition = {
                x: ctx.object.position.x + direction.x,
                y: ctx.object.position.y + direction.y,
              };
              const neighbor = objectAt(ctx.gridObjects, ctx.object.grid, neighborPosition);
              if (neighbor && neighbor.type.startsWith('redstone-') && (neighbor.state as RedstoneState).state === 'on') {
                nextState = 'on';
                break;
              }
            }
          }
          if (state.state === nextState) return;
          ctx.setObjectState(ctx.object.objectId, { state: nextState } satisfies RedstoneState);
          return ActionUpdateSignal.UPDATE_NO_CYCLE;
        }
      },
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
// uses its own `state` field instead, if present.
function stateIconKey(state: ObjectState | undefined): string | undefined {
  if (typeof state === 'string') return state
  const value = state?.state
  return typeof value === 'string' ? value : undefined
}

// The raw icon-map entry for this type/state — a plain URL, or an
// ObjectIconUrl object carrying its own iconScale/offsetX/offsetY
// overrides. See getObjectIconUrl/getObjectIconScale/getObjectIconOffset.
function resolveIconEntry(type: ObjectType, state?: ObjectState): ObjectIconUrl {
  // OBJECT_TYPES_BY_ID is built from every entry of OBJECT_TYPES, and
  // ObjectType only ever holds one of those entries' type — always found.
  const definition = OBJECT_TYPES_BY_ID.get(type)!
  if (typeof definition.iconUrl === 'string') return definition.iconUrl
  const key = stateIconKey(state) ?? stateIconKey(definition.defaultState)
  // Falls back to the map's first entry rather than ever rendering a
  // broken image, when no state/defaultState resolves to a known key.
  return (key !== undefined ? definition.iconUrl[key] : undefined) ?? Object.values(definition.iconUrl)[0]
}

export function getObjectIconUrl(type: ObjectType, state?: ObjectState): string {
  const entry = resolveIconEntry(type, state)
  return typeof entry === 'string' ? entry : entry.url
}

// This state's own iconScale if its icon-map entry sets one, else the
// type-level iconScale, else 1 (see ObjectIconUrl/ObjectDefinition).
export function getObjectIconScale(type: ObjectType, state?: ObjectState): number {
  const entry = resolveIconEntry(type, state)
  const perState = typeof entry === 'string' ? undefined : entry.iconScale
  return perState ?? OBJECT_TYPES_BY_ID.get(type)!.iconScale ?? 1
}

// Same per-state-then-type-level fallback as getObjectIconScale, for
// the icon's pixel nudge off its cell's center.
export function getObjectIconOffset(type: ObjectType, state?: ObjectState): { x: number; y: number } {
  const entry = resolveIconEntry(type, state)
  const perState = typeof entry === 'string' ? undefined : entry
  const definition = OBJECT_TYPES_BY_ID.get(type)!
  return {
    x: perState?.offsetX ?? definition.offsetX ?? 0,
    y: perState?.offsetY ?? definition.offsetY ?? 0,
  }
}

export function getObjectItemUrl(type: ObjectType): string {
  return OBJECT_TYPES_BY_ID.get(type)!.itemUrl ?? getObjectIconUrl(type)
}

export function getObjectLabel(type: ObjectType): string {
  return OBJECT_TYPES_BY_ID.get(type)!.label ?? type
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

// Every name this action answers to, as a flat list — one entry for a
// plain string, one per element for a multi-name action (see
// ObjectActionDefinition.name). Used both to expand a single definition
// into one display button per name, and (via .includes) to match a
// press/trigger against whichever name(s) it answers to.
export function actionNames(action: ObjectActionDefinition): string[] {
  return Array.isArray(action.name) ? action.name : [action.name]
}

// The name to invoke for this type's passive cell-change notification,
// or undefined when it has none. Its first action (checked only for a
// static array, never a builder: there's no player context to resolve a
// dynamic one against for a world-driven notification, not a player's
// own press) must have isUpdate set — what that action is *named* is up
// to it, and that name is what comes back here, so nothing about this
// mechanism depends on a particular name. See notifyCellChanged in
// use-game-world.tsx, the only thing this powers: any object/special-cell
// appearing or leaving a cell fires this on same-grid cardinal neighbors
// whose first action qualifies, through the normal invokeObjectAction
// pipeline (so ctx.triggerObjectAction from inside such a handler works
// exactly like anywhere else).
export function getUpdateActionName(type: ObjectType): string | undefined {
  const source = getObjectActionsSource(type)
  if (!Array.isArray(source) || source.length === 0) return undefined
  const action = source[0]
  if (action.isUpdate !== true) return undefined
  // A multi-name action answers to any of its names — the first is the
  // canonical one to invoke it by.
  return actionNames(action)[0]
}

export interface ResolvedObjectAction {
  name: string
  color?: CubeColor
  animate?: boolean
  hidden?: boolean
}

// A plain value applies to every index; an array maps by index with
// carry-forward (see ObjectActionDefinition.color's doc) — this is the
// one place that rule is actually implemented.
function resolveIndexed<T>(value: T | T[] | undefined, index: number): T | undefined {
  if (!Array.isArray(value)) return value
  if (value.length === 0) return undefined
  return value[Math.min(index, value.length - 1)]
}

// Expands one action definition into one resolved entry per name it
// answers to — color/animate/hidden each resolved for that specific
// name via resolveIndexed.
export function resolveActionNames(action: ObjectActionDefinition): ResolvedObjectAction[] {
  return actionNames(action).map((name, index) => ({
    name,
    color: resolveIndexed(action.color, index),
    animate: resolveIndexed(action.animate, index),
    hidden: resolveIndexed(action.hidden, index),
  }))
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

export type GridObjectsState = Record<string, Record<string, GridObject>>

// The object on a given grid's given position, if any — same
// shape/convention as specialCellAt in special-cells.ts.
export function objectAt(
  objects: GridObjectsState,
  grid: GridCoord,
  position: CellPosition
): GridObject | undefined {
  return objects[gridKey(grid)]?.[gridKey(position)]
}

// Immutable "remove whatever's at this position" for one grid's own
// object dict — used wherever an object moves (its key has to change
// along with its position) or is erased.
export function withoutObjectAt(
  objects: Record<string, GridObject>,
  position: CellPosition
): Record<string, GridObject> {
  const next = { ...objects }
  delete next[gridKey(position)]
  return next
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
function generateGridObjects(world: WorldState): Record<string, GridObject> {
  const boardCells = buildBoardCells(world)
  if (boardCells.length === 0) return {}

  const objects: Record<string, GridObject> = {}

  // Bounded retries: guards against spinning forever picking already-used
  // cells as the board fills up.
  const maxAttemptsPerObject = boardCells.length * 4

  function placeOne(type: ObjectType): void {
    if (Object.keys(objects).length >= boardCells.length) return
    let attempts = 0
    while (attempts < maxAttemptsPerObject) {
      attempts += 1
      const cell = randomItem(boardCells)
      const cellKey = gridKey(cell)
      if (objects[cellKey]) continue
      objects[cellKey] = {
        id: generateObjectId(),
        position: cell,
        type,
        color: randomItem(CUBE_COLORS),
        state: OBJECT_TYPES_BY_ID.get(type)?.defaultState,
      }
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
      boardCells.length - Object.keys(objects).length,
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
