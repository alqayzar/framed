import appleUrl from '@/assets/objects/apple.svg'
import basketballUrl from '@/assets/objects/basketball.svg'
import carrotUrl from '@/assets/objects/carrot.svg'
import confettisUrl from '@/assets/objects/confettis.svg'
import giftUrl from '@/assets/objects/gift.svg'
import penguinUrl from '@/assets/objects/penguin.svg'
import poopUrl from '@/assets/objects/poop.svg'
import soccerBallUrl from '@/assets/objects/soccer-ball.svg'
import textUrl from '@/assets/objects/text.svg'
import trexUrl from '@/assets/objects/trex.svg'
import tvUrl from '@/assets/objects/tv.svg'
import watermelonUrl from '@/assets/objects/watermelon.svg'
import { CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'
import { buildBoardCells, type CellPosition, type GridCoord, gridKey, type WorldState } from '@/lib/world'
// Type-only: use-game-world.tsx imports real values from this file
// already, but a `type` import is fully erased at compile time, so this
// doesn't create a runtime circular dependency — just a type reference,
// which TypeScript has no issue with either way. Standing convention:
// any future context-injected capability reuses its real
// GameWorldValue member's exact type the same way, rather than a
// hand-rolled simplified signature.
import type { BroadcastToastOptions, PlayersState } from '@/hooks/use-game-world'

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
}

export interface ObjectActionInvocationContext extends ObjectActionBuilderContext {
  actionName: string
  // Host-only effect the action can use — supplied by
  // use-game-world.tsx at invocation time. Signature matches
  // GameWorldValue.broadcastToast exactly, not a simplified stand-in.
  broadcastToast: (text: string, options?: BroadcastToastOptions) => void
}

export interface ObjectActionDefinition {
  name: string
  color?: CubeColor
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
  iconUrl: string
  // Exact spawn count per grid when set — this type is placed that many
  // times, independent of OBJECTS_PER_GRID_MIN/MAX. Omit to let it
  // compete in the random pool instead.
  countPerGrid?: number
  // Enables the "near object" floating action dialog (see
  // object-action-dialog.tsx) when set.
  actions?: ObjectActionsSource
}

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
        },
      },
    ],
  },
  {
    type: 'text',
    iconUrl: textUrl,
    // Dynamic: one button per other player in the game, resolved fresh
    // (host-side only) every time — never the asker themselves.
    actions: (ctx) =>
      Object.entries(ctx.players)
        .filter(([playerId]) => playerId !== ctx.playerId)
        .map(([playerId, player]) => ({
          name: `Text ${player.username}`,
          action: (actionCtx) => {
            actionCtx.broadcastToast('Hello world', { playerIds: [playerId] })
          },
        })),
  },
] as const satisfies ObjectDefinition[]

export type ObjectType = (typeof OBJECT_TYPES)[number]['type']

// Typed as the general ObjectDefinition (not the literal-per-entry union
// OBJECT_TYPES itself infers) so optional fields like actions/
// countPerGrid can be read here without a per-call cast.
const OBJECT_TYPES_BY_ID = new Map<ObjectType, ObjectDefinition>(
  OBJECT_TYPES.map((definition) => [definition.type, definition])
)

export function getObjectIconUrl(type: ObjectType): string {
  // OBJECT_TYPES_BY_ID is built from every entry of OBJECT_TYPES, and
  // ObjectType only ever holds one of those entries' type — always found.
  return OBJECT_TYPES_BY_ID.get(type)!.iconUrl
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
}

export type GridObjectsState = Record<string, GridObject[]>

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function generateObjectId(): string {
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
      objects.push({ id: generateObjectId(), position: cell, type, color: randomItem(CUBE_COLORS) })
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
