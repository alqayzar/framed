import {
  idbDel,
  idbGet,
  idbGetEntriesByPrefix,
  idbMutate,
  idbReplacePrefix,
  idbSet,
} from '@/lib/idb-store'
import { CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'
import {
  createGridObjectsState,
  isObjectChannel,
  OBJECT_TYPES_BY_ID,
  type GridObject,
  type GridObjectsState,
  type ObjectType,
} from '@/lib/game-objects'
import type { PlayerIdentity } from '@/lib/identities'
import type { PlayersState } from '@/lib/player-state'
import { clearAllStoredValues, type ValueLifetime } from '@/lib/room-values'
import { DEFAULT_SHARED_SETTINGS, type SharedSettings } from '@/lib/game-settings'
import type { SpecialCellsState } from '@/lib/special-cells'
import { gridKey, type GridColors, type GridCoord, type WorldState } from '@/lib/world'

const ROOM_ROLE_KEY = 'room:role'
const ROOM_CODE_KEY = 'room:code'
const ROOM_PLAYER_ID_KEY = 'room:player-id'
const ROOM_PLAYERS_KEY = 'room:players'
const ROOM_GRID_COLORS_KEY = 'room:grid-colors'
// Legacy whole-world snapshot. It is deliberately discarded rather than
// migrated when the per-object store is first initialized.
const ROOM_GRID_OBJECTS_KEY = 'room:grid-objects'
const ROOM_GRID_OBJECT_PREFIX = 'room:grid-object:'
const ROOM_GRID_OBJECTS_INITIALIZED_KEY = 'room:grid-objects-initialized'
const ROOM_SPECIAL_CELLS_KEY = 'room:special-cells'
const ROOM_ARBITRARY_GRIDS_KEY = 'room:arbitrary-grids'
const ROOM_ARBITRARY_GRID_COUNTER_KEY = 'room:arbitrary-grid-counter'
const ROOM_GAME_STARTED_KEY = 'room:game-started'
const ROOM_IDENTITIES_KEY = 'room:identities'
const ROOM_GLOBAL_VALUE_NAMES_KEY = 'room:global-value-names'
const ROOM_SHARED_SETTINGS_KEY = 'room:shared-settings'

export interface StoredRoomInfo {
  role: 'host' | 'guest'
  code: string
  playerId: string
}

// Object writes are deliberately immediate (no debounce/coalescing), but
// serialized so a slower transaction cannot finish after a newer one and
// restore stale state. A failed transaction is logged and swallowed only by
// the queue tail, allowing subsequent operations to continue normally.
let gridObjectWriteQueue: Promise<void> = Promise.resolve()
// Invalidates object loads that began before an explicit room clear. Those
// reads are not part of the write queue and otherwise could enqueue a
// normalization rewrite behind the clear transaction.
let gridObjectPersistenceEpoch = 0

function enqueueGridObjectWrite(label: string, operation: () => Promise<void>): Promise<void> {
  const result = gridObjectWriteQueue.then(operation)
  gridObjectWriteQueue = result.catch((error: unknown) => {
    console.error(`Failed to persist grid objects (${label})`, error)
  })
  // Callers that need a barrier (load/clear) receive the real failure,
  // while the caught queue tail above keeps later writes operational.
  return result
}

function gridObjectStorageKey(grid: GridCoord, objectId: string): string {
  return `${ROOM_GRID_OBJECT_PREFIX}${gridKey(grid)}:${objectId}`
}

function gridObjectStorageEntries(objects: GridObjectsState): Array<readonly [string, GridObject]> {
  return Object.values(objects.objectsById).map(
    (object) => [gridObjectStorageKey(object.grid, object.id), object] as const
  )
}

function isIntegerCoord(value: unknown): value is GridCoord {
  if (!value || typeof value !== 'object') return false
  const coord = value as Partial<GridCoord>
  return Number.isInteger(coord.x) && Number.isInteger(coord.y)
}

function isStoredGridObject(value: unknown): value is GridObject {
  if (!value || typeof value !== 'object') return false
  const object = value as Partial<GridObject>
  const hasValidState =
    object.state === undefined ||
    typeof object.state === 'string' ||
    (object.state !== null && typeof object.state === 'object')
  return (
    typeof object.id === 'string' &&
    object.id.length > 0 &&
    isIntegerCoord(object.grid) &&
    isIntegerCoord(object.position) &&
    typeof object.type === 'string' &&
    OBJECT_TYPES_BY_ID.has(object.type as ObjectType) &&
    typeof object.color === 'string' &&
    CUBE_COLORS.includes(object.color as CubeColor) &&
    (object.channel === undefined || isObjectChannel(object.channel)) &&
    hasValidState &&
    (object.variant === undefined || typeof object.variant === 'string')
  )
}

function clearStoredGridObjects(): Promise<void> {
  gridObjectPersistenceEpoch += 1
  return enqueueGridObjectWrite('clear', () =>
    idbReplacePrefix(ROOM_GRID_OBJECT_PREFIX, [], [
      { type: 'delete', key: ROOM_GRID_OBJECTS_INITIALIZED_KEY },
      { type: 'delete', key: ROOM_GRID_OBJECTS_KEY },
    ])
  )
}

// Stable identity for the duration of a game: generated once when the room
// is created/joined, it survives page reloads (unlike the PeerJS id, which
// changes on every connection) and is discarded when the player leaves.
// It must never be used to derive the PeerJS id.
function generatePlayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function saveRoomInfo(info: Omit<StoredRoomInfo, 'playerId'>): Promise<void> {
  await idbSet(ROOM_ROLE_KEY, info.role)
  await idbSet(ROOM_CODE_KEY, info.code)
  await idbSet(ROOM_PLAYER_ID_KEY, generatePlayerId())
}

export async function loadRoomInfo(): Promise<StoredRoomInfo | null> {
  const role = await idbGet<StoredRoomInfo['role']>(ROOM_ROLE_KEY)
  const code = await idbGet<string>(ROOM_CODE_KEY)
  const playerId = await idbGet<string>(ROOM_PLAYER_ID_KEY)
  if (!role || !code || !playerId) return null
  return { role, code, playerId }
}

export async function clearRoomInfo(): Promise<void> {
  // Clear is queued behind every previously requested object write so none
  // of them can repopulate the namespace after leaving the room.
  await clearStoredGridObjects()
  await idbDel(ROOM_ROLE_KEY)
  await idbDel(ROOM_CODE_KEY)
  await idbDel(ROOM_PLAYER_ID_KEY)
  await idbDel(ROOM_PLAYERS_KEY)
  await idbDel(ROOM_GRID_COLORS_KEY)
  await idbDel(ROOM_SPECIAL_CELLS_KEY)
  await idbDel(ROOM_ARBITRARY_GRIDS_KEY)
  await idbDel(ROOM_ARBITRARY_GRID_COUNTER_KEY)
  await idbDel(ROOM_GAME_STARTED_KEY)
  await idbDel(ROOM_IDENTITIES_KEY)
  await idbDel(ROOM_GLOBAL_VALUE_NAMES_KEY)
  await idbDel(ROOM_SHARED_SETTINGS_KEY)
  await clearAllStoredValues()
}

// Host-side snapshot of every known player (connected or not), keyed by
// stable player id, so a host reload restores positions, colors and
// usernames instead of starting the room from scratch.
export function saveRoomPlayers(players: PlayersState): Promise<void> {
  return idbSet(ROOM_PLAYERS_KEY, players)
}

export function loadRoomPlayers(): Promise<PlayersState | undefined> {
  return idbGet<PlayersState>(ROOM_PLAYERS_KEY)
}

// The world's per-grid color layout (see generateGridColors in board.ts)
// is rolled once per game. The host persists it so a reload continues
// the same game instead of re-rolling; a guest persists whatever the
// host sends it so a reload doesn't need it re-transmitted.
export function saveGridColors(colors: GridColors): Promise<void> {
  return idbSet(ROOM_GRID_COLORS_KEY, colors)
}

export function loadGridColors(): Promise<GridColors | undefined> {
  return idbGet<GridColors>(ROOM_GRID_COLORS_KEY)
}

// Settings synced across every connected player (see SharedSettings in
// game-settings.ts and the 'settings-sync' RoomMessage). The host
// persists it so a reload continues with the same value instead of
// resetting to the default; a guest persists whatever the host sends
// it so a reload doesn't need it re-transmitted.
export function saveSharedSettings(settings: SharedSettings): Promise<void> {
  return idbSet(ROOM_SHARED_SETTINGS_KEY, settings)
}

// Merged over the defaults so a room persisted before a new field was
// introduced (e.g. the board dimensions, which used to be per-client
// GameSettings) still comes back complete rather than undefined — same
// approach as loadGameSettings in game-settings.ts. Still undefined when
// nothing is stored at all, which callers read as "use the default".
export async function loadSharedSettings(): Promise<SharedSettings | undefined> {
  const stored = await idbGet<Partial<SharedSettings>>(ROOM_SHARED_SETTINGS_KEY)
  return stored ? { ...DEFAULT_SHARED_SETTINGS, ...stored } : undefined
}

// Replaces the complete object namespace atomically. Used for initial world
// generation and regeneration; ordinary mutations use the per-object APIs
// below so changing one object does not rewrite the world.
export function saveGridObjects(objects: GridObjectsState): Promise<void> {
  const entries = gridObjectStorageEntries(objects)
  return enqueueGridObjectWrite('replace all', () =>
    idbReplacePrefix(ROOM_GRID_OBJECT_PREFIX, entries, [
      { type: 'set', key: ROOM_GRID_OBJECTS_INITIALIZED_KEY, value: true },
      { type: 'delete', key: ROOM_GRID_OBJECTS_KEY },
    ])
  )
}

// Loads individual object records and derives both runtime indexes. The
// marker distinguishes an intentionally empty world from a world that has
// never generated its objects. Legacy snapshots are removed and treated as
// uninitialized rather than migrated.
export async function loadGridObjects(): Promise<GridObjectsState | undefined> {
  const loadEpoch = gridObjectPersistenceEpoch
  await gridObjectWriteQueue
  if (loadEpoch !== gridObjectPersistenceEpoch) return undefined
  const initialized = await idbGet<boolean>(ROOM_GRID_OBJECTS_INITIALIZED_KEY)
  if (loadEpoch !== gridObjectPersistenceEpoch) return undefined
  if (!initialized) {
    await enqueueGridObjectWrite('discard legacy snapshot', () =>
      idbReplacePrefix(ROOM_GRID_OBJECT_PREFIX, [], [
        { type: 'delete', key: ROOM_GRID_OBJECTS_KEY },
        { type: 'delete', key: ROOM_GRID_OBJECTS_INITIALIZED_KEY },
      ])
    ).catch(() => undefined)
    return undefined
  }

  const storedEntries = await idbGetEntriesByPrefix<unknown>(ROOM_GRID_OBJECT_PREFIX)
  if (loadEpoch !== gridObjectPersistenceEpoch) return undefined
  const entries = storedEntries.filter(
    (entry): entry is [string, GridObject] => isStoredGridObject(entry[1])
  )
  const normalizedStoredEntries = entries.map(
    ([key, object]) => [key, object.channel === undefined ? { ...object, channel: 0 } : object] as const
  )
  const objects = createGridObjectsState(normalizedStoredEntries.map(([, object]) => object))
  const normalizedEntries = gridObjectStorageEntries(objects)
  const isNormalized =
    storedEntries.length === normalizedEntries.length &&
    normalizedStoredEntries.every(
      ([storedKey, object], index) =>
        entries[index][1].channel !== undefined &&
        storedKey === gridObjectStorageKey(object.grid, object.id) &&
        objects.objectsById[object.id] === object
    )

  if (!isNormalized) {
    // Duplicate ids/positions or a key that disagrees with object.grid
    // are resolved by createGridObjectsState. Repair the prefix now so a
    // losing hidden record cannot reappear after the visible one is erased.
    await enqueueGridObjectWrite('repair object records', () =>
      idbReplacePrefix(ROOM_GRID_OBJECT_PREFIX, normalizedEntries, [
        { type: 'set', key: ROOM_GRID_OBJECTS_INITIALIZED_KEY, value: true },
        { type: 'delete', key: ROOM_GRID_OBJECTS_KEY },
      ])
    ).catch(() => undefined)
  }

  return objects
}

// Placement, state changes and same-grid movement all update exactly one
// per-object record.
export function saveGridObject(object: GridObject): Promise<void> {
  return enqueueGridObjectWrite('save one', () => idbSet(gridObjectStorageKey(object.grid, object.id), object))
}

export function deleteGridObject(grid: GridCoord, objectId: string): Promise<void> {
  return enqueueGridObjectWrite('delete one', () => idbDel(gridObjectStorageKey(grid, objectId)))
}

// Cross-grid movement changes the IndexedDB key. Delete and insert share a
// transaction so reload can never observe the object in both/neither grid.
export function moveGridObject(previousGrid: GridCoord, object: GridObject): Promise<void> {
  const previousKey = gridObjectStorageKey(previousGrid, object.id)
  const nextKey = gridObjectStorageKey(object.grid, object.id)
  if (previousKey === nextKey) return saveGridObject(object)
  return enqueueGridObjectWrite('move between grids', () =>
    idbMutate([
      { type: 'delete', key: previousKey },
      { type: 'set', key: nextKey, value: object },
    ])
  )
}

// The world's per-grid special (colored) cells (see
// generateWorldSpecialCells in special-cells.ts), also rolled once per
// game/lobby. Host-only: a guest never sees more than its current grid's
// special cells over the network (see the 'special-cells' message).
export function saveSpecialCells(cells: SpecialCellsState): Promise<void> {
  return idbSet(ROOM_SPECIAL_CELLS_KEY, cells)
}

export function loadSpecialCells(): Promise<SpecialCellsState | undefined> {
  return idbGet<SpecialCellsState>(ROOM_SPECIAL_CELLS_KEY)
}

// Per-arbitrary-grid dimensions (see ARBITRARY_GRID_X/isArbitraryGrid,
// WorldState in world.ts) — each entry independent of the shared
// matrix's own WorldState (see SharedSettings), created on demand by
// ctx.createGrid (see use-game-world.tsx) rather than rolled once like
// gridColors/gridObjects above. The host persists it so a reload keeps
// every grid a trigger has already created; a guest persists whatever
// the host sends it (see the 'arbitrary-grids' message), same as
// gridColors, so a reload doesn't need it re-transmitted before the
// guest's own current grid (if it's one of these) can render at the
// right size.
export function saveArbitraryGrids(grids: Record<string, WorldState>): Promise<void> {
  return idbSet(ROOM_ARBITRARY_GRIDS_KEY, grids)
}

export function loadArbitraryGrids(): Promise<Record<string, WorldState> | undefined> {
  return idbGet<Record<string, WorldState>>(ROOM_ARBITRARY_GRIDS_KEY)
}

// The next id createArbitraryGrid (use-game-world.tsx) will allocate —
// persisted so a host reload never reissues one already handed out to a
// live grid (see ARBITRARY_GRID_X: {x: 999, y: id}). Monotonic for the
// room's whole lifetime, including across regenerateWorld's own wipe of
// hostArbitraryGrids — never reset, never decremented, even when a
// grid's own entry is cleared. Host-only: a guest never allocates one.
export function saveArbitraryGridCounter(nextId: number): Promise<void> {
  return idbSet(ROOM_ARBITRARY_GRID_COUNTER_KEY, nextId)
}

export function loadArbitraryGridCounter(): Promise<number | undefined> {
  return idbGet<number>(ROOM_ARBITRARY_GRID_COUNTER_KEY)
}

// Whether the host has moved the room from the waiting room into the
// actual game (see GameScreen) — the host can also send everyone back to
// the lobby, so this can flip either way. Host-only: persisted so a host
// reload restores whichever screen was showing instead of always
// defaulting to the lobby.
export function saveGameStarted(started: boolean): Promise<void> {
  return idbSet(ROOM_GAME_STARTED_KEY, started)
}

export async function loadGameStarted(): Promise<boolean> {
  return (await idbGet<boolean>(ROOM_GAME_STARTED_KEY)) ?? false
}

// Who's Saboteur/Innocent (see assignIdentities in identities.ts), rolled
// once when the game starts and persisted so a host reload doesn't
// reassign everyone's identity mid-game. Host-only: a guest only ever
// learns its own identity over the network (see the 'identity' message),
// never the full map.
export function saveIdentities(identities: Record<string, PlayerIdentity>): Promise<void> {
  return idbSet(ROOM_IDENTITIES_KEY, identities)
}

export function loadIdentities(): Promise<Record<string, PlayerIdentity> | undefined> {
  return idbGet<Record<string, PlayerIdentity>>(ROOM_IDENTITIES_KEY)
}

// Which named values (see setValue/getValue in use-game-world.tsx) are
// currently GLOBAL, and under which lifetime — so a reconnecting guest
// can be resent exactly those (see handleGuestOpen), and a host reload
// restores the registry instead of forgetting what's shared. LOCAL
// values never appear here: they're never sent to a guest in the first
// place.
export function saveGlobalValueNames(names: Record<string, ValueLifetime>): Promise<void> {
  return idbSet(ROOM_GLOBAL_VALUE_NAMES_KEY, names)
}

export function loadGlobalValueNames(): Promise<Record<string, ValueLifetime> | undefined> {
  return idbGet<Record<string, ValueLifetime>>(ROOM_GLOBAL_VALUE_NAMES_KEY)
}
