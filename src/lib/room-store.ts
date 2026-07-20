import { idbDel, idbGet, idbSet } from '@/lib/idb-store'
import type { PlayersState } from '@/hooks/use-game-world'
import type { GridObjectsState } from '@/lib/game-objects'
import type { PlayerIdentity } from '@/lib/identities'
import { clearAllStoredValues, type ValueLifetime } from '@/lib/room-values'
import type { GridColors } from '@/lib/world'

const ROOM_ROLE_KEY = 'room:role'
const ROOM_CODE_KEY = 'room:code'
const ROOM_PLAYER_ID_KEY = 'room:player-id'
const ROOM_PLAYERS_KEY = 'room:players'
const ROOM_GRID_COLORS_KEY = 'room:grid-colors'
const ROOM_GRID_OBJECTS_KEY = 'room:grid-objects'
const ROOM_GAME_STARTED_KEY = 'room:game-started'
const ROOM_IDENTITIES_KEY = 'room:identities'
const ROOM_GRID_HIDDEN_PLAYERS_KEY = 'room:grid-hidden-players'
const ROOM_GLOBAL_VALUE_NAMES_KEY = 'room:global-value-names'

export interface StoredRoomInfo {
  role: 'host' | 'guest'
  code: string
  playerId: string
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
  await idbDel(ROOM_ROLE_KEY)
  await idbDel(ROOM_CODE_KEY)
  await idbDel(ROOM_PLAYER_ID_KEY)
  await idbDel(ROOM_PLAYERS_KEY)
  await idbDel(ROOM_GRID_COLORS_KEY)
  await idbDel(ROOM_GRID_OBJECTS_KEY)
  await idbDel(ROOM_GAME_STARTED_KEY)
  await idbDel(ROOM_IDENTITIES_KEY)
  await idbDel(ROOM_GRID_HIDDEN_PLAYERS_KEY)
  await idbDel(ROOM_GLOBAL_VALUE_NAMES_KEY)
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

// The world's per-grid objects (see generateWorldObjects in
// game-objects.ts), also rolled once per game. Host-only: a guest never
// sees more than its current grid's objects over the network in the
// first place (see the 'grid-objects' message), so there's nothing
// worth persisting on its side.
export function saveGridObjects(objects: GridObjectsState): Promise<void> {
  return idbSet(ROOM_GRID_OBJECTS_KEY, objects)
}

export function loadGridObjects(): Promise<GridObjectsState | undefined> {
  return idbGet<GridObjectsState>(ROOM_GRID_OBJECTS_KEY)
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

// Players whose whole grid container is currently hidden (see the
// setGridVisible flow in flows.ts). Host-only, mirroring identities: a
// guest only ever learns its own visibility over the network (see the
// 'grid-visible' message), persisted so a host reload keeps the effect
// applied.
export function saveGridHiddenPlayers(playerIds: string[]): Promise<void> {
  return idbSet(ROOM_GRID_HIDDEN_PLAYERS_KEY, playerIds)
}

export function loadGridHiddenPlayers(): Promise<string[] | undefined> {
  return idbGet<string[]>(ROOM_GRID_HIDDEN_PLAYERS_KEY)
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
