import * as React from 'react'

import { useRoomPeer, type RoomPeerEvent } from '@/hooks/use-room-peer'
import {
  type ActionInstance,
  dispatchActionEvent,
  startAction as startActionEngine,
  verifyAction as verifyActionEngine,
} from '@/lib/actions'
import { type CubeColor, randomCubeColor } from '@/lib/cube-colors'
import { type GameActionsContext } from '@/lib/game-actions'
import {
  actionNames,
  ActionUpdateSignal,
  generateObjectId,
  generateWorldObjects,
  getObjectActionsSource,
  getUpdateActionName,
  objectAt,
  OBJECT_TYPES_BY_ID,
  resolveActionNames,
  resolveObjectActions,
  withoutObjectAt,
  type ActionObjectRef,
  type GridObject,
  type GridObjectsState,
  type ObjectActionBuilderContext,
  type ObjectActionDisplay,
  type ObjectActionInvocationContext,
  type ObjectState,
  type ObjectType,
  type TriggerRef,
} from '@/lib/game-objects'
import { DEFAULT_SHARED_SETTINGS, sharedSettingsWorld, type SharedSettings } from '@/lib/game-settings'
import { assignIdentities, type PlayerIdentity } from '@/lib/identities'
import { idbGet, idbSet } from '@/lib/idb-store'
import { type InventoryItem } from '@/lib/inventory-items'
import { AVATAR_KEY, USERNAME_KEY } from '@/lib/profile-store'
import { cacheRemoteAvatar, getCachedRemoteAvatar } from '@/lib/remote-avatar-store'
import {
  loadArbitraryGridCounter,
  loadArbitraryGrids,
  loadGameStarted,
  loadGlobalValueNames,
  loadGridColors,
  loadGridObjects,
  loadIdentities,
  loadRoomPlayers,
  loadSharedSettings,
  loadSpecialCells,
  saveArbitraryGridCounter,
  saveArbitraryGrids,
  saveGameStarted,
  saveGlobalValueNames,
  saveGridColors,
  saveGridObjects,
  saveIdentities,
  saveRoomPlayers,
  saveSharedSettings,
  saveSpecialCells,
} from '@/lib/room-store'
import {
  clearValuesForLifetime,
  getStoredValue,
  setStoredValue,
  type ValueLifetime,
  type ValueScope,
} from '@/lib/room-values'
import {
  generateWorldSpecialCells,
  moveSpecialCell,
  specialCellAt,
  type SpecialCell,
  type SpecialCellMoveBehavior,
  type SpecialCellsState,
} from '@/lib/special-cells'
import {
  applyGameMode,
  ARBITRARY_GRID_X,
  boardEdgeDirections,
  boardEdgeRange,
  type CellPosition,
  centerGridCoord,
  generateGridColors,
  type GridColors,
  type GridCoord,
  gridEntryPosition,
  gridKey,
  type GridStep,
  isAdjacent,
  isArbitraryGrid,
  isCellOccupiedByAnotherPlayer,
  isCellVisible,
  isGridInWorld,
  randomFreeBoardCell,
  randomFreeCellNear,
  type WorldState,
} from '@/lib/world'
import type { ToastColors, ToastOptions } from '@/hooks/use-toast'
import type { BroadcastToastOptions, PlayerState, PlayersState } from '@/lib/player-state'

// Game layer: everything about the world and what lives in it — player
// positions, grid colors, objects, collisions, pushes, the lobby→game
// transition — implemented as the host-authoritative protocol spoken over
// the transport layer (see use-room-peer.tsx). This file owns what the
// messages mean; the peer layer owns how they travel.

// PlayerState/PlayersState/BroadcastToastOptions live in lib/player-state.ts
// (imported above, re-exported here) rather than here, since
// lib/game-objects.ts, lib/room-store.ts, and lib/game-actions.ts all need
// them too — defining them here would mean those files importing from this
// one, which itself imports real (non-type-only) values from all three,
// i.e. a real import cycle. Vite's dev-time module graph treats that as
// circular even though TypeScript's type-only imports are erased at build
// time, forcing a full page reload instead of Fast Refresh on every edit
// to any of those files.
export type { PlayerState, PlayersState, BroadcastToastOptions }

interface SerializedAvatar {
  type: 'blob'
  mimeType: string
  data: ArrayBuffer | ArrayBufferLike
}

type RoomMessage =
  | { type: 'players-sync'; players: PlayersState; hostPlayerId: string }
  | { type: 'grid-colors'; colors: GridColors }
  // Per-arbitrary-grid dimensions (see ARBITRARY_GRID_X/isArbitraryGrid
  // in world.ts) — sent whole, same "small map, resent on host change"
  // shape as grid-colors above, since the total count of these is
  // expected to stay small (trigger-created, not part of the rolled
  // matrix).
  | { type: 'arbitrary-grids'; grids: Record<string, WorldState> }
  | { type: 'settings-sync'; settings: SharedSettings }
  | { type: 'grid-objects'; grid: GridCoord; objects: GridObject[] }
  | { type: 'special-cells'; grid: GridCoord; cells: SpecialCell[] }
  // Single-entry deltas, sent instead of a whole grid whenever exactly
  // one thing changed. 'grid-objects'/'special-cells' above stay the
  // full-snapshot resync (join, reconnect, grid change) and always win
  // over accumulated deltas. Objects are keyed by their stable id;
  // special cells have none, so those are keyed by position.
  | { type: 'object-patch'; grid: GridCoord; object: GridObject }
  | { type: 'object-remove'; grid: GridCoord; objectId: string }
  | { type: 'special-cell-patch'; grid: GridCoord; cell: SpecialCell }
  | { type: 'special-cell-remove'; grid: GridCoord; position: CellPosition }
  | { type: 'special-cell-shake'; grid: GridCoord; position: CellPosition; direction: GridCoord }
  | { type: 'object-jump'; grid: GridCoord; objectId: string }
  | { type: 'move'; position: CellPosition }
  | { type: 'move-grid'; direction: GridCoord; objectId?: string }
  | { type: 'teleport-to-player'; targetPlayerId: string }
  | { type: 'game-started' }
  | { type: 'return-to-lobby' }
  | { type: 'identity'; identity: PlayerIdentity }
  | { type: 'avatar'; playerId: string; image: Blob | SerializedAvatar }
  | { type: 'username'; username: string }
  | { type: 'toast'; text: string; key?: string; colors?: ToastColors; durationMs?: number }
  | { type: 'timer'; enabled: boolean; endAt?: number }
  | { type: 'object-action'; objectId: string; actionName: string }
  | { type: 'place-item'; position: CellPosition; item: InventoryItem }
  | { type: 'erase-cell'; position: CellPosition }
  | { type: 'object-actions-request'; objectId: string; requestId: string }
  | { type: 'object-actions-response'; requestId: string; actions: { name: string; color?: CubeColor }[] }
  | { type: 'value-set'; name: string; value: unknown; lifetime: ValueLifetime }
  | { type: 'values-cleared'; lifetime: Extract<ValueLifetime, 'wait_room' | 'game'> }
  | { type: 'leave' }
  | { type: 'room-closed' }
  | { type: 'kicked' }

// Infinity/NaN aren't guaranteed to survive PeerJS's data-channel
// serialization the way an ordinary finite number does — translated
// to/from this sentinel only at the wire boundary. Never appears in
// ToastOptions/showToast's own API (see TOAST_LIFETIME_INFINITE in
// use-toast.tsx), which keeps using real Infinity.
const WIRE_INFINITE_DURATION_MS = -1

function encodeToastDurationForWire(durationMs: number | undefined): number | undefined {
  if (durationMs === undefined) return undefined
  return Number.isFinite(durationMs) ? durationMs : WIRE_INFINITE_DURATION_MS
}

function decodeToastDurationFromWire(durationMs: number | undefined): number | undefined {
  return durationMs === WIRE_INFINITE_DURATION_MS ? Infinity : durationMs
}

// A single room-wide countdown — only one at a time, a new start
// replaces whatever's already running. endAt is an absolute timestamp
// (not a duration) so every client can compute its own exact remaining
// time locally (Date.now() vs. endAt) regardless of network latency,
// and a guest connecting mid-countdown can be told the real endAt and
// immediately show correct time remaining (see handleGuestOpen).
export interface TimerState {
  enabled: boolean
  endAt: number | null
}

// Default actionsContext for a guest (or before the host's world has
// loaded): every getter reads as an empty world rather than throwing —
// matches the "guest gets a no-op" convention used for startAction/
// verifyAction too, since actions are host-only.
const EMPTY_ACTIONS_CONTEXT: GameActionsContext = {
  getPlayers: () => ({}),
  getGridObjects: () => ({}),
  getSpecialCells: () => ({}),
}

// N, E, S, W — used to try a pushed object's other neighbors in a fixed
// order when the direction it's pushed in is blocked (see
// pushObjectIfPresent).
const ORTHOGONAL_DIRECTIONS: GridCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

interface GameWorldValue {
  players: PlayersState
  localPlayerId: string
  hostPlayerId: string | null
  avatarUrls: Record<string, string>
  // Whichever WorldState is authoritative right now — lobbyWorld before
  // the game has started, gameWorld after (see gameStarted), or an
  // arbitrary grid's own independent one (see ARBITRARY_GRID_X/
  // isArbitraryGrid in world.ts) when the local player is currently
  // standing on one — the exact same one used to generate/validate
  // everything below, echoed back so callers don't need to re-derive
  // their own to size a GameGrid consistently with it.
  world: WorldState
  // Per-grid color layout of the world, rolled once at the start of the
  // game (see generateGridColors in world.ts). Empty until the host has
  // generated/restored it (host) or received it from the host (guest).
  gridColors: GridColors
  // Settings synced across every connected player (see SharedSettings
  // in game-settings.ts) — identical for host and every guest, unlike
  // GameSettings, which each client configures independently. Starts
  // at DEFAULT_SHARED_SETTINGS until the host's persisted/broadcast
  // value is known.
  sharedSettings: SharedSettings
  // Host only: applies a new SharedSettings and broadcasts it to every
  // guest (guests get a no-op — see the 'settings-sync' message).
  setSharedSettings: (settings: SharedSettings) => void
  // Objects of the grid currently displayed only — never the whole
  // world (see generateWorldObjects in game-objects.ts). The host keeps
  // the full world in memory and derives this slice locally; a guest
  // only ever receives this same slice over the network and never
  // persists it (see the 'grid-objects' message).
  gridObjects: GridObject[]
  // Special (colored) cells of the grid currently displayed only — same
  // "current grid slice only" rule as gridObjects (see
  // generateWorldSpecialCells in special-cells.ts). Purely a placement
  // constraint (see randomFreeBoardCell's occupiedCells parameter in
  // use-game-world.tsx): a player is never placed on one, but can freely
  // walk or be pushed onto one afterward.
  specialCells: SpecialCell[]
  // An ephemeral, one-off "this cell just got punched/pulled" signal —
  // not persisted state, purely a cue for GameGrid to replay a giggle
  // animation on it (see the 'special-cell-shake' message). Null until
  // the first one arrives; always a brand-new object on every shake
  // (never reused), so a consumer can key off reference identity alone
  // to notice a new one, even at the exact same position twice in a row.
  specialCellShake: { grid: GridCoord; position: CellPosition; direction: GridCoord } | null
  // Per-object "replay the move-hop animation" counters (see
  // ObjectActionDefinition.animate) — a monotonic count per object
  // rather than a single latest-value slot like specialCellShake above,
  // specifically so several objects animating within one React batch
  // each keep their own bump: a single slot loses every jump but the
  // last, which is exactly what happens when one cell change cascades an
  // update onto two animating neighbors at once. The grid rides along so
  // a bump for an object on a grid the player isn't looking at can be
  // ignored.
  objectJumps: Record<string, { grid: GridCoord; count: number }>
  // Whether the host has moved the room into the actual game (see
  // GameScreen). Flips back to false when the host sends everyone back
  // to the lobby (see returnToLobby).
  gameStarted: boolean
  // This player's own identity, rolled once per game (see
  // assignIdentities in identities.ts) when the host starts it. Null
  // until it's actually known — the game grid must wait for this rather
  // than showing right away, since a guest only learns it asynchronously
  // over the network. Never anyone else's: identities are secret.
  myIdentity: PlayerIdentity | null
  moveMissCount: number
  movePlayer: (position: CellPosition) => void
  // objectId: the id of the object owning the arbitrary grid the local
  // player currently stands on (see WorldState.state, set via
  // ctx.createGrid's third argument) — when given, the host redirects
  // this "crossing" to land beside that object's own current position
  // (wherever it actually is) instead of an ordinary matrix-neighbor
  // grid. Omit for ordinary edge-crossing — unchanged.
  moveToGrid: (direction: GridCoord, objectId?: string) => void
  // Drops this player on a free cell near another one — the 5x5 area
  // around them first, widening until something is free (see
  // randomFreeCellNear in world.ts). No-op when that player isn't on
  // this player's own grid, or when the whole board is taken.
  teleportToPlayer: (targetPlayerId: string) => void
  kickPlayer: (playerId: string) => void
  // Host only: moves the whole room from the waiting room into the game
  // (guests get a no-op).
  startGame: () => void
  // Host only: moves the whole room back from the game into the waiting
  // room — the mirror image of startGame (guests get a no-op; they React
  // to the 'return-to-lobby' broadcast instead).
  returnToLobby: () => void
  // Host only: rerolls colors/objects/special-cells and respawns everyone
  // at the center, without leaving the waiting room — a no-op once the
  // game has actually started, or for a guest.
  regenerateGrid: () => void
  // Host only: shows an arbitrary message in everyone's toast, or only in
  // the toast of the given player ids when that list is non-empty (guests
  // get a no-op). Passing the same options.key as an earlier call updates
  // that existing toast (on whichever client already has one) instead of
  // creating a new one — see ToastOptions/showToast in use-toast.tsx for
  // exactly how the update merges colors/durationMs.
  broadcastToast: (text: string, options?: BroadcastToastOptions) => void
  // The room's single countdown, if any — shown in both the wait room
  // and the actual game (see RoomTimer).
  timer: TimerState
  // Host only: starts (or replaces) the countdown, broadcasting it to
  // everyone; calls onFinish (host-local only, never sent over the
  // network) once it naturally elapses — never called if the timer is
  // instead cancelled via stopTimer or a startGame/returnToLobby
  // transition (guests get a no-op).
  startTimer: (durationMs: number, onFinish?: () => void) => void
  // Host only: cancels the countdown and hides it everywhere (guests
  // get a no-op).
  stopTimer: () => void
  // Relays a proximity-dialog button press to the host — works for both
  // roles (the host's own click still goes through this, since only the
  // host may actually run the action's callback; see game-objects.ts).
  triggerObjectAction: (objectId: string, actionName: string) => void
  // Sandbox mode's Inventaire tool (see game-screen.tsx) — same
  // relay-to-host shape as triggerObjectAction. No-ops outside sandbox
  // mode (validated host-side).
  placeItem: (position: CellPosition, item: InventoryItem) => void
  eraseCell: (position: CellPosition) => void
  // Resolves the display list of actions for a given object. Host
  // resolves directly and locally (including running a builder); a
  // guest resolves a static array locally too, but round-trips to the
  // host for a dynamic (builder) source, since only the host may run it.
  resolveObjectActionNames: (objectId: string, objectType: ObjectType) => Promise<ObjectActionDisplay[]>
  // Host only: stores a named value (see room-values.ts), broadcasting it
  // to everyone when scope is 'global' (guests get a no-op — like every
  // other host-authoritative action here, a guest never originates
  // shared state). GLOBAL values persist on a guest's own device too, so
  // its getValue keeps working after a disconnect until the value is
  // cleared or overwritten. Resolves once the value is actually
  // persisted, so an immediately following getValue reads the new value.
  setValue: (name: string, value: unknown, scope: ValueScope, lifetime: ValueLifetime) => Promise<void>
  // Reads a named value straight from this device's IndexedDB — no role
  // branching needed, since both host and guest just read whatever is
  // already stored locally (the host's own writes, or whatever GLOBAL
  // values the host has broadcast to this guest). The optional
  // defaultValue is returned (and the result narrows to plain T) when
  // the name isn't stored.
  getValue: <T = unknown>(name: string, defaultValue?: T) => Promise<T | undefined>
  // Whichever of 'wait_room'/'game' is active right now (see
  // gameStarted) — 'shared' is never "current", it's an explicit choice
  // a caller makes for a value that should survive both.
  getCurrentLifetime: () => Extract<ValueLifetime, 'wait_room' | 'game'>
  // Updates this player's own avatar mid-session (photo or emoji, same
  // Blob shape either way — see render-emoji-avatar.ts/compress-image.ts).
  // Persists it so it survives a reload, applies it locally right away,
  // and pushes it to everyone else immediately by reusing the same
  // 'avatar' message/relay the initial post-connect send already uses —
  // works the same for host and guest, unlike most other host-only
  // actions here.
  updateAvatar: (blob: Blob) => void
  leaveRoom: (onDone: () => void) => void
  // Host only: registers an action instance (see actions.ts/game-actions.ts)
  // to start watching game events from now on (guests get a no-op).
  startAction: (instance: ActionInstance) => void
  // Host only: recomputes and returns whether the given action instance
  // has succeeded — callable anytime (guests get a no-op returning false).
  verifyAction: (instance: ActionInstance) => Promise<boolean>
  // The getters a caller needs to build the params object for whichever
  // ActionX.createInstance(...) it wants to call (see game-actions.ts) —
  // host-only in practice, a guest reads back the empty-world stub.
  actionsContext: GameActionsContext
}

interface GameWorldProviderProps {
  // The lobby and the actual game are two separate worlds (different
  // colors, objects, player positions — see startGameRef below): which
  // WorldState is authoritative switches from this lobbyWorld to the
  // game's own the moment the host starts the game, and every
  // generation/collision function in this file reads whichever is
  // current at the time. Only the lobby's is a prop — the game's comes
  // from SharedSettings (see sharedSettingsWorld), so that host and
  // guests can't each resolve a different one.
  lobbyWorld: WorldState
  // How many players get the Saboteur identity when the game starts (see
  // assignIdentities in identities.ts) — clamped there against however
  // many players actually exist at that moment.
  saboteurCount: number
  onRoomClosed: () => void
  onKicked: () => void
  onToast: (text: string, options?: ToastOptions) => void
  children: React.ReactNode
}

const GameWorldContext = React.createContext<GameWorldValue | null>(null)

function GameWorldProvider(props: GameWorldProviderProps) {
  const peer = useRoomPeer()
  const [players, setPlayers] = React.useState<PlayersState>({})
  const [hostPlayerId, setHostPlayerId] = React.useState<string | null>(null)
  const [avatarUrls, setAvatarUrls] = React.useState<Record<string, string>>({})
  const [gridColors, setGridColors] = React.useState<GridColors>({})
  const [arbitraryGrids, setArbitraryGrids] = React.useState<Record<string, WorldState>>({})
  const [sharedSettings, setSharedSettingsState] = React.useState<SharedSettings>(DEFAULT_SHARED_SETTINGS)
  const [gridObjects, setGridObjects] = React.useState<GridObject[]>([])
  const [specialCells, setSpecialCells] = React.useState<SpecialCell[]>([])
  const [specialCellShake, setSpecialCellShake] = React.useState<{
    grid: GridCoord
    position: CellPosition
    direction: GridCoord
  } | null>(null)
  const [objectJumps, setObjectJumps] = React.useState<Record<string, { grid: GridCoord; count: number }>>({})
  const [gameStarted, setGameStarted] = React.useState(false)
  const [myIdentity, setMyIdentity] = React.useState<PlayerIdentity | null>(null)
  const [moveMissCount, setMoveMissCount] = React.useState(0)
  const [timer, setTimer] = React.useState<TimerState>({ enabled: false, endAt: null })
  // Refs so a board-settings change doesn't re-run the game effect (whose
  // teardown would drop all in-memory room state).
  const lobbyWorldRef = React.useRef(props.lobbyWorld)
  lobbyWorldRef.current = props.lobbyWorld
  const saboteurCountRef = React.useRef(props.saboteurCount)
  saboteurCountRef.current = props.saboteurCount
  const leaveRoomRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())
  const movePlayerRef = React.useRef<(position: CellPosition) => void>(() => {})
  const moveToGridRef = React.useRef<(direction: GridCoord, objectId?: string) => void>(() => {})
  const teleportToPlayerRef = React.useRef<(targetPlayerId: string) => void>(() => {})
  const kickPlayerRef = React.useRef<(playerId: string) => void>(() => {})
  const startGameRef = React.useRef<() => void>(() => {})
  const returnToLobbyRef = React.useRef<() => void>(() => {})
  const regenerateGridRef = React.useRef<() => void>(() => {})
  const setSharedSettingsRef = React.useRef<(settings: SharedSettings) => void>(() => {})
  const broadcastToastRef = React.useRef<(text: string, options?: BroadcastToastOptions) => void>(() => {})
  const startTimerRef = React.useRef<(durationMs: number, onFinish?: () => void) => void>(() => {})
  const stopTimerRef = React.useRef<() => void>(() => {})
  const triggerObjectActionRef = React.useRef<(objectId: string, actionName: string) => void>(() => {})
  const placeItemRef = React.useRef<(position: CellPosition, item: InventoryItem) => void>(() => {})
  const eraseCellRef = React.useRef<(position: CellPosition) => void>(() => {})
  const resolveObjectActionNamesRef = React.useRef<
    (objectId: string, objectType: ObjectType) => Promise<ObjectActionDisplay[]>
  >(() => Promise.resolve([]))
  const setValueRef = React.useRef<
    (name: string, value: unknown, scope: ValueScope, lifetime: ValueLifetime) => Promise<void>
  >(() => Promise.resolve())
  const updateAvatarRef = React.useRef<(blob: Blob) => void>(() => {})
  const startActionRef = React.useRef<(instance: ActionInstance) => void>(() => {})
  const verifyActionRef = React.useRef<(instance: ActionInstance) => boolean | Promise<boolean>>(() => false)
  const actionsContextRef = React.useRef<GameActionsContext>(EMPTY_ACTIONS_CONTEXT)
  const onRoomClosedRef = React.useRef(props.onRoomClosed)
  onRoomClosedRef.current = props.onRoomClosed
  const onKickedRef = React.useRef(props.onKicked)
  onKickedRef.current = props.onKicked
  const onToastRef = React.useRef(props.onToast)
  onToastRef.current = props.onToast

  React.useEffect(() => {
    setPlayers({})
    setHostPlayerId(null)
    setAvatarUrls({})
    setGridColors({})
    setArbitraryGrids({})
    setGridObjects([])
    setSpecialCells([])
    setGameStarted(false)
    setMyIdentity(null)
    setMoveMissCount(0)
    setTimer({ enabled: false, endAt: null })
    const localPlayerId = peer.localPlayerId
    const createdUrls = new Set<string>()
    // Tracks the local avatar's *current* value, not just its initial
    // one — a plain .then() on localAvatarBlobPromise would otherwise
    // keep resolving to this same initial blob forever (a native
    // Promise settles once), so updateAvatar below reassigns this
    // whenever the player changes their picture mid-session, and every
    // "send my avatar" site reads getLocalAvatarBlob() instead of the
    // promise directly.
    let currentAvatarBlob: Blob | null = null
    const localAvatarBlobPromise = idbGet<Blob>(AVATAR_KEY).then((blob) => {
      currentAvatarBlob = blob ?? null
      return blob ?? null
    })
    function getLocalAvatarBlob(): Promise<Blob | null> {
      return currentAvatarBlob !== null ? Promise.resolve(currentAvatarBlob) : localAvatarBlobPromise
    }
    const localUsernamePromise = idbGet<string>(USERNAME_KEY)

    async function serializeAvatar(blob: Blob): Promise<SerializedAvatar> {
      const data = await blob.arrayBuffer()
      return { type: 'blob', mimeType: blob.type, data }
    }

    async function deserializeAvatar(image: Blob | SerializedAvatar | null): Promise<Blob | null> {
      if (!image) return null
      if (image instanceof Blob) return image
      if (image.type !== 'blob') return null
      if (image.data instanceof ArrayBuffer) return new Blob([image.data], { type: image.mimeType })
      if (ArrayBuffer.isView(image.data)) {
        const buffer = image.data.buffer.slice(
          image.data.byteOffset,
          image.data.byteOffset + image.data.byteLength
        ) as ArrayBuffer
        return new Blob([buffer], { type: image.mimeType })
      }
      return null
    }

    // send: how the serialized payload should leave (peer.sendTo a given
    // guest, or peer.sendToHost) — the caller picks.
    function sendAvatar(send: (message: RoomMessage) => void, playerId: string, image: Blob | SerializedAvatar) {
      const payloadPromise = image instanceof Blob ? serializeAvatar(image) : Promise.resolve(image)
      void payloadPromise.then((serializedAvatar) => {
        send({ type: 'avatar', playerId, image: serializedAvatar })
      })
    }

    // An avatar is only ever pushed once, right after a connection opens
    // (see the 'guest-open'/'host-open' handlers below) — never re-sent on
    // every players-sync/move — and every received avatar is cached in
    // IndexedDB under the stable player id so it can be restored after a
    // reload without waiting for a re-transmission.
    function applyAvatar(playerId: string, image: Blob | SerializedAvatar | null) {
      void deserializeAvatar(image).then((blob) => {
        setAvatarUrls((current) => {
          const previousUrl = current[playerId]
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl)
            createdUrls.delete(previousUrl)
          }
          if (!blob) {
            if (!(playerId in current)) return current
            const next = { ...current }
            delete next[playerId]
            return next
          }
          try {
            const url = URL.createObjectURL(blob)
            createdUrls.add(url)
            return { ...current, [playerId]: url }
          } catch (error) {
            console.error('Failed to create avatar URL', error)
            return current
          }
        })
        if (blob) void cacheRemoteAvatar(playerId, blob)
      })
    }

    let unsubscribe: () => void
    // Host-only in practice, but declared here (not inside the host
    // branch) so the effect's one shared cleanup below can reach it.
    let hostTimerTimeout: number | null = null

    if (peer.role === 'host') {
      // Only ever flips true, never back — no need to reconcile with a
      // remote value like gridColors/gridObjects, just restore it once.
      // Declared first: currentWorld() (used by everything below to
      // generate/validate the world) depends on it to know whether the
      // lobby's or the actual game's WorldState is authoritative right
      // now (see startGameRef further down, where it flips to true).
      let hostGameStarted = false
      function currentWorld(): WorldState {
        if (!hostGameStarted) return lobbyWorldRef.current
        return applyGameMode(sharedSettingsWorld(hostSharedSettings), hostSharedSettings.mode)
      }
      // Which WorldState is authoritative for a specific grid — an
      // arbitrary grid's own independent dimensions, or the ordinary
      // shared one (currentWorld()) for every in-matrix grid. Every call
      // site that acts on a *specific* player/object's own grid uses
      // this instead of currentWorld() directly; currentWorld() stays
      // reserved for whole-matrix operations (color/object generation,
      // spawn-grid centering) with no single grid to resolve.
      function worldForGrid(grid: GridCoord): WorldState {
        if (isArbitraryGrid(grid)) return hostArbitraryGrids[gridKey(grid)] ?? currentWorld()
        return currentWorld()
      }
      // Who's Saboteur/Innocent (see identities.ts) — only ever populated
      // while a game is running; cleared on returnToLobby. Kept in memory
      // only, never broadcast as a whole: each player only ever learns
      // its own identity (see the 'identity' message).
      let hostIdentities: Record<string, PlayerIdentity> = {}
      // Which named values (see setValue/room-values.ts) are currently
      // GLOBAL, and under which lifetime — restored on host reload so the
      // registry isn't lost; only used to know what to resend to a
      // (re)connecting guest and what to drop from the registry when a
      // lifetime is cleared. The values themselves live in IndexedDB (see
      // room-values.ts), not here.
      let hostGlobalValues: Record<string, ValueLifetime> = {}
      void loadGlobalValueNames().then((stored) => {
        if (stored) hostGlobalValues = stored
      })
      void loadGameStarted().then((stored) => {
        if (!stored) return
        hostGameStarted = true
        setGameStarted(true)
        void loadIdentities().then((storedIdentities) => {
          if (!storedIdentities) return
          hostIdentities = storedIdentities
          const myStoredIdentity = hostIdentities[localPlayerId]
          if (myStoredIdentity) setMyIdentity(myStoredIdentity)
        })
        // Same connect-before-load race as below.
        peer.broadcast({ type: 'game-started' })
      })
      // Rolled once per game, not derived from coordinates (see
      // generateGridColors). Checks for a layout persisted by an earlier
      // session of this same game first (host reload) and reuses it;
      // only generates (and persists) a fresh one when there isn't one.
      let hostGridColors: GridColors = {}
      let hostGridObjects: GridObjectsState = {}
      let hostSpecialCells: SpecialCellsState = {}
      // Each arbitrary grid's own independent dimensions (see
      // ARBITRARY_GRID_X/isArbitraryGrid in world.ts) — populated only by
      // createArbitraryGrid, never by generateWorldObjects/-SpecialCells/
      // -GridColors, and wiped (along with any objects/special cells it
      // held) by regenerateWorld, same as the rest of the generated world.
      let hostArbitraryGrids: Record<string, WorldState> = {}
      // Next id createArbitraryGrid will hand out (see ARBITRARY_GRID_X)
      // — persisted so it survives a host reload; see
      // saveArbitraryGridCounter in room-store.ts.
      let hostNextArbitraryGridId = 0
      // Synced settings (see SharedSettings in game-settings.ts) — a
      // stable user preference, not procedurally generated, so unlike
      // gridColors/gridObjects/specialCells it doesn't need to join the
      // Promise.all below; it just restores independently, same as
      // hostGlobalValues/hostGameStarted above.
      let hostSharedSettings: SharedSettings = DEFAULT_SHARED_SETTINGS
      void loadSharedSettings().then((stored) => {
        hostSharedSettings = stored ?? DEFAULT_SHARED_SETTINGS
        setSharedSettingsState(hostSharedSettings)
      })
      // Starts empty — only ever gets its first entry once the world
      // (colors/objects/special cells) is fully known, in the
      // Promise.all below. No player is ever placed against a
      // partially-known world.
      const hostPlayers: PlayersState = {}
      // Identity memory: the state of a disconnected player is kept here
      // (keyed by stable player id) so a guest that reloads the page gets
      // back its position, color and username. Entries only disappear on
      // an explicit leave or kick.
      const knownPlayers = new Map<string, PlayerState>()
      const remoteAvatarBlobs = new Map<string, Blob | SerializedAvatar>()
      // Read-only view of host state for the actions engine (see
      // actions.ts/game-actions.ts) — getters, not plain properties, since
      // hostGridObjects/hostSpecialCells are reassigned (not mutated in
      // place) whenever a push commits.
      const actionsCtx: GameActionsContext = {
        getPlayers: () => hostPlayers,
        getGridObjects: () => hostGridObjects,
        getSpecialCells: () => hostSpecialCells,
      }
      // Whether hostPlayers/hostGridObjects/hostSpecialCells are ready to
      // be acted on (see the Promise.all below). peer.subscribe has no
      // buffering of its own (see use-room-peer.tsx) — any event that
      // arrives before then is queued here and replayed in order the
      // moment the world is ready, instead of being either dropped or
      // processed against a still-empty world.
      let worldReady = false
      const pendingEvents: RoomPeerEvent[] = []

      // World first, fully — then, and only then, players. Colors don't
      // themselves affect placement, but are loaded/generated alongside
      // objects and special cells anyway so "the world" is one atomic
      // concept ready at a single point, rather than three independently
      // racing ones. loadRoomPlayers (host reload restore) joins this
      // same wait too, since restoring a position also needs to validate
      // against the now fully-known world.
      void Promise.all([
        loadGridColors(),
        loadGridObjects(),
        loadSpecialCells(),
        loadRoomPlayers(),
        loadArbitraryGrids(),
        loadArbitraryGridCounter(),
      ]).then(
        ([
          storedColors,
          storedObjects,
          storedSpecialCells,
          storedRoomPlayers,
          storedArbitraryGrids,
          storedArbitraryGridCounter,
        ]) => {
        if (storedColors) {
          hostGridColors = storedColors
        } else {
          hostGridColors = generateGridColors(currentWorld())
          void saveGridColors(hostGridColors)
        }
        if (storedObjects) {
          hostGridObjects = storedObjects
        } else {
          hostGridObjects = generateWorldObjects(currentWorld())
          void saveGridObjects(hostGridObjects)
        }
        if (storedSpecialCells) {
          hostSpecialCells = storedSpecialCells
        } else {
          hostSpecialCells = generateWorldSpecialCells(currentWorld())
          void saveSpecialCells(hostSpecialCells)
        }
        hostArbitraryGrids = storedArbitraryGrids ?? {}
        hostNextArbitraryGridId = storedArbitraryGridCounter ?? 0
        setGridColors(hostGridColors)
        setArbitraryGrids(hostArbitraryGrids)

        // Now players — restore a previous session's room state (host
        // reload) if there is one, in a single pass, since the world it
        // needs to validate against is already fully known.
        const defaultSpawnGrid = centerGridCoord(currentWorld())
        if (storedRoomPlayers) {
          for (const [playerId, storedState] of Object.entries(storedRoomPlayers)) {
            // Snapshots written before the world/grids feature have no
            // gridX/gridY: default them to the spawn grid.
            const state: PlayerState = {
              ...storedState,
              gridX: storedState.gridX ?? defaultSpawnGrid.x,
              gridY: storedState.gridY ?? defaultSpawnGrid.y,
            }
            if (playerId === localPlayerId) {
              // Mirrors how a reconnecting guest is restored (see
              // handleGuestOpen): land back on the same grid it was on,
              // falling back to a random free cell of that grid (not a
              // different one) if its exact spot is now taken — by an
              // object or a special cell (nobody else is in hostPlayers
              // yet to occupy it).
              const targetGrid: GridCoord = { x: state.gridX, y: state.gridY }
              const canRestorePosition = !unavailablePlayerCellsOn(targetGrid).some(
                (position) => position.x === state.position.x && position.y === state.position.y
              )
              hostPlayers[localPlayerId] = {
                position: canRestorePosition
                  ? state.position
                  : randomFreeBoardCell(hostPlayers, targetGrid, worldForGrid(targetGrid), unavailablePlayerCellsOn(targetGrid)),
                gridX: targetGrid.x,
                gridY: targetGrid.y,
                color: state.color,
                username: state.username ?? '',
              }
            } else {
              knownPlayers.set(playerId, state)
            }
          }
        }
        if (!hostPlayers[localPlayerId]) {
          hostPlayers[localPlayerId] = {
            position: randomFreeBoardCell(
              {},
              defaultSpawnGrid,
              currentWorld(),
              unavailablePlayerCellsOn(defaultSpawnGrid)
            ),
            gridX: defaultSpawnGrid.x,
            gridY: defaultSpawnGrid.y,
            color: randomCubeColor(),
            username: '',
          }
        }

        setHostPlayerId(localPlayerId)
        syncPlayers()
        refreshLocalGridObjects()
        refreshLocalSpecialCells()

        getLocalAvatarBlob().then((blob) => {
          if (blob) applyAvatar(localPlayerId, blob)
        })
        localUsernamePromise.then((username) => {
          if (!username) return
          hostPlayers[localPlayerId] = { ...hostPlayers[localPlayerId], username }
          syncPlayers()
        })

        worldReady = true
        pendingEvents.splice(0).forEach(dispatchPeerEvent)
      })

      // Snapshot every known player — connected (hostPlayers) or not
      // (knownPlayers) — so a host reload restores the whole room state.
      function persistPlayers() {
        const snapshot: PlayersState = {}
        knownPlayers.forEach((state, playerId) => {
          snapshot[playerId] = state
        })
        Object.assign(snapshot, hostPlayers)
        void saveRoomPlayers(snapshot)
      }

      function syncPlayers() {
        setPlayers({ ...hostPlayers })
        peer.broadcast({ type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
        persistPlayers()
      }

      // Cells a player must not be placed on when appearing on a grid
      // (spawn, reconnect, game start) — see randomFreeBoardCell's
      // occupiedCells parameter.
      function objectPositionsOn(grid: GridCoord): CellPosition[] {
        return Object.values(hostGridObjects[gridKey(grid)] ?? {}).map((object) => object.position)
      }

      // Same idea, for special (colored) cells — see specialCellBackground
      // in special-cells.ts. Only ever used for player placement: objects
      // are free to spawn on/be pushed onto these, only players avoid them.
      function specialCellPositionsOn(grid: GridCoord): CellPosition[] {
        return (hostSpecialCells[gridKey(grid)] ?? []).map((cell) => cell.position)
      }

      // The combined set of cells a player must not be placed on — every
      // place a player is placed (spawn, reconnect, game start,
      // return-to-lobby) uses this instead of objectPositionsOn alone.
      function unavailablePlayerCellsOn(grid: GridCoord): CellPosition[] {
        return [...objectPositionsOn(grid), ...specialCellPositionsOn(grid)]
      }

      // Refreshes the host's own displayed slice of hostGridObjects to
      // match whichever grid it's currently standing on.
      function refreshLocalGridObjects() {
        const current = hostPlayers[localPlayerId]
        if (!current) return
        setGridObjects(Object.values(hostGridObjects[gridKey({ x: current.gridX, y: current.gridY })] ?? {}))
      }

      // Same idea, for special cells.
      function refreshLocalSpecialCells() {
        const current = hostPlayers[localPlayerId]
        if (!current) return
        setSpecialCells(hostSpecialCells[gridKey({ x: current.gridX, y: current.gridY })] ?? [])
      }

      // A player only ever receives its own current grid's objects, never
      // the rest of the world (see the 'grid-objects' message).
      function sendGridObjectsTo(playerId: string) {
        const player = hostPlayers[playerId]
        if (!player) return
        const grid: GridCoord = { x: player.gridX, y: player.gridY }
        peer.sendTo(playerId, { type: 'grid-objects', grid, objects: Object.values(hostGridObjects[gridKey(grid)] ?? {}) })
      }

      // Same idea, for special cells (see the 'special-cells' message).
      function sendSpecialCellsTo(playerId: string) {
        const player = hostPlayers[playerId]
        if (!player) return
        const grid: GridCoord = { x: player.gridX, y: player.gridY }
        peer.sendTo(playerId, { type: 'special-cells', grid, cells: hostSpecialCells[gridKey(grid)] ?? [] })
      }

      // Rerolls colors/objects/special-cells for the whole world and
      // respawns every known player at its center — shared by startGame,
      // returnToLobby, and regenerateGrid, which each layer their own
      // extra bookkeeping (identities, value lifetimes, game-started) on
      // top of this common reset.
      function regenerateWorld() {
        hostGridColors = generateGridColors(currentWorld())
        void saveGridColors(hostGridColors)
        setGridColors(hostGridColors)
        // Sandbox mode has no spawned objects/special cells — only once
        // the game has actually started (hostGameStarted is already
        // false again by the time returnToLobby/regenerateGrid call
        // this, so the waiting room's own world is never affected).
        const isSandboxGame = hostGameStarted && hostSharedSettings.mode === 'sandbox'
        hostGridObjects = isSandboxGame ? {} : generateWorldObjects(currentWorld())
        void saveGridObjects(hostGridObjects)
        hostSpecialCells = isSandboxGame ? {} : generateWorldSpecialCells(currentWorld())
        void saveSpecialCells(hostSpecialCells)

        // Arbitrary grids (see ARBITRARY_GRID_X in world.ts) are
        // ephemeral, trigger-created content, not part of the base
        // layout above — wiped on every reroll. (hostGridObjects/
        // hostSpecialCells above already dropped their own per-arbitrary-
        // grid entries as a side effect of the wholesale replace, since
        // generateWorldObjects/generateWorldSpecialCells only ever
        // produce matrix keys.) Any player currently on one gets
        // reassigned to spawnGrid by the loop below, same as everyone
        // else. hostNextArbitraryGridId is deliberately NOT reset — see
        // its own doc.
        hostArbitraryGrids = {}
        void saveArbitraryGrids(hostArbitraryGrids)
        setArbitraryGrids(hostArbitraryGrids)
        peer.broadcast({ type: 'arbitrary-grids', grids: hostArbitraryGrids })

        const spawnGrid = centerGridCoord(currentWorld())
        for (const playerId of Object.keys(hostPlayers)) {
          hostPlayers[playerId] = {
            ...hostPlayers[playerId],
            position: randomFreeBoardCell(
              hostPlayers,
              spawnGrid,
              currentWorld(),
              unavailablePlayerCellsOn(spawnGrid)
            ),
            gridX: spawnGrid.x,
            gridY: spawnGrid.y,
          }
        }

        syncPlayers()
        refreshLocalGridObjects()
        refreshLocalSpecialCells()
        peer.broadcast({ type: 'grid-colors', colors: hostGridColors })
        Object.keys(hostPlayers).forEach((playerId) => {
          sendGridObjectsTo(playerId)
          sendSpecialCellsTo(playerId)
        })
      }

      // Full resync of one grid: its whole object list and special-cell
      // list, to everyone currently standing on it, plus the host's own
      // slices. Only for the moments a player needs the complete picture
      // — landing on a grid (attemptMoveToGrid below), joining, or a
      // world reroll. Ordinary mutations send a single-entry delta
      // instead (see the four broadcast* helpers below).
      function broadcastGridObjects(grid: GridCoord) {
        refreshLocalGridObjects()
        refreshLocalSpecialCells()
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          sendGridObjectsTo(playerId)
          sendSpecialCellsTo(playerId)
        }
      }

      // One object changed on `grid` — an upsert, so this covers a state
      // change and a move alike, since the position rides along on the
      // object itself. Filtered to whoever's actually on `grid`, read at
      // send time (a player who's already moved elsewhere is skipped) —
      // a delta can never reach a client whose slice is for another grid,
      // the same way the existing 'grid-objects' handler already does.
      function broadcastObjectPatch(grid: GridCoord, object: GridObject) {
        refreshLocalGridObjects()
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          peer.sendTo(playerId, { type: 'object-patch', grid, object })
        }
      }

      // One object is gone from `grid` — erased, or pushed across into a
      // neighboring grid (where it arrives as its own patch).
      function broadcastObjectRemove(grid: GridCoord, objectId: string) {
        refreshLocalGridObjects()
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          peer.sendTo(playerId, { type: 'object-remove', grid, objectId })
        }
      }

      // Special cells carry no id, so these two key on position instead:
      // a patch replaces whatever sat at that cell, a remove clears it.
      // Never send a patch whose color and shape are both undefined —
      // that's indistinguishable from empty; send a remove instead.
      function broadcastSpecialCellPatch(grid: GridCoord, cell: SpecialCell) {
        refreshLocalSpecialCells()
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          peer.sendTo(playerId, { type: 'special-cell-patch', grid, cell })
        }
      }

      function broadcastSpecialCellRemove(grid: GridCoord, position: CellPosition) {
        refreshLocalSpecialCells()
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          peer.sendTo(playerId, { type: 'special-cell-remove', grid, position })
        }
      }

      // Ephemeral, one-off "play the giggle" cue for whoever is
      // currently standing on `grid` — no persisted state, same idea as
      // broadcastToast: paired with a direct local update for the host's
      // own client (which has no connection to itself) plus a network
      // send for everyone else on that grid.
      function broadcastSpecialCellShake(grid: GridCoord, position: CellPosition, direction: GridCoord) {
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          peer.sendTo(playerId, { type: 'special-cell-shake', grid, position, direction })
        }
        const localPlayer = hostPlayers[localPlayerId]
        if (localPlayer && localPlayer.gridX === grid.x && localPlayer.gridY === grid.y) {
          setSpecialCellShake({ grid, position, direction })
        }
      }

      // Same idea, for replaying an object's own move-hop animation on
      // demand (see ObjectActionDefinition.animate) rather than an
      // actual move — structurally identical broadcast/local-update
      // pairing, just a different payload.
      function broadcastObjectJump(grid: GridCoord, objectId: string) {
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          peer.sendTo(playerId, { type: 'object-jump', grid, objectId })
        }
        const localPlayer = hostPlayers[localPlayerId]
        if (localPlayer && localPlayer.gridX === grid.x && localPlayer.gridY === grid.y) {
          // Functional update: two animating neighbors updated by the
          // same cell change land in one React batch, and a plain
          // overwrite would keep only the last one's jump.
          setObjectJumps((current) => ({
            ...current,
            [objectId]: { grid, count: (current[objectId]?.count ?? 0) + 1 },
          }))
        }
      }

      // A player walking onto an object's cell pushes it one cell further
      // in the same direction they came from, when that's possible. When
      // it isn't (off the board, another object, another player there),
      // the object instead jumps to a random one of its free perpendicular
      // neighbors (never the cell directly behind the player — the one
      // they just left — so the object can't appear to pop up behind
      // them, and never a fixed N/E/S/W order — every free neighbor is
      // equally likely). When a candidate direction leads off a board
      // edge that borders another grid (see boardEdgeDirections/
      // gridEntryPosition, the same pair used for player grid-crossing),
      // the object crosses into that neighboring grid's mirrored entry
      // cell instead of being blocked by the edge — subject to the same
      // checks (world edge = wall, occupied by another object/player
      // there = blocked). Returns false — meaning the whole move must be
      // cancelled — when the object's own type is marked non-moveable
      // (see ObjectDefinition.moveable in game-objects.ts — it blocks
      // outright, no push attempted at all), or when the primary
      // direction and every remaining neighbor are all blocked.
      function pushObjectIfPresent(
        grid: GridCoord,
        targetPosition: CellPosition,
        direction: GridCoord,
        movingPlayerId: string
      ): boolean {
        const key = gridKey(grid)
        const objects = hostGridObjects[key] ?? {}
        const object = objects[gridKey(targetPosition)]
        if (!object) return true

        // A non-moveable object blocks the player outright — same
        // "cancel the whole move" contract every caller already
        // handles for the "every push candidate blocked" case below,
        // just short-circuited before attempting one.
        if (!(OBJECT_TYPES_BY_ID.get(object.type)?.moveable ?? true)) return false

        type PushTarget =
          | { crossesGrid: false; candidate: CellPosition }
          | { crossesGrid: true; destGrid: GridCoord; entryPosition: CellPosition }

        const world = worldForGrid(grid)
        const edgeDirections = boardEdgeDirections(targetPosition, world)

        // Whether pushing the object one cell in direction d is possible,
        // without committing anything yet — so candidates can be
        // evaluated (and, for the fallback ones, randomly picked among)
        // before any of them actually mutates hostGridObjects.
        function evaluate(d: GridCoord): PushTarget | null {
          const crossesToNeighborGrid = edgeDirections.some((edge) => edge.x === d.x && edge.y === d.y)
          if (crossesToNeighborGrid) {
            let destGrid: GridCoord
            let entryPosition: CellPosition
            if (isArbitraryGrid(grid) && world.state) {
              // Same redirect as attemptMoveToGrid's ownerObjectId
              // branch: an owned arbitrary grid has no real matrix
              // neighbor to push into, so the push instead lands beside
              // the owning object's own current position, wherever
              // that actually is.
              const found = findObjectWithGrid(world.state)
              if (!found) return null
              destGrid = found.grid
              entryPosition = { x: found.object.position.x + d.x, y: found.object.position.y + d.y }
            } else {
              destGrid = { x: grid.x + d.x, y: grid.y + d.y }
              if (!isGridInWorld(destGrid, world)) return null // world edge: a wall
              entryPosition = gridEntryPosition(targetPosition, d, world)
            }
            const destObjects = hostGridObjects[gridKey(destGrid)] ?? {}
            const destOccupant = destObjects[gridKey(entryPosition)]
            if (destOccupant) {
              const portalEntry = resolvePortalEntry(destOccupant, d, movingPlayerId)
              if (portalEntry) {
                return { crossesGrid: true, destGrid: portalEntry.destGrid, entryPosition: portalEntry.entryPosition }
              }
              return null // not a portal, or a portal that's fully blocked — same outcome either way
            }
            if (isCellOccupiedByAnotherPlayer(entryPosition, destGrid, hostPlayers, movingPlayerId)) return null
            return { crossesGrid: true, destGrid, entryPosition }
          }
          const candidate: CellPosition = { x: targetPosition.x + d.x, y: targetPosition.y + d.y }
          if (!isCellVisible(candidate, world)) return null
          const occupant = objects[gridKey(candidate)]
          if (occupant) {
            const portalEntry = resolvePortalEntry(occupant, d, movingPlayerId)
            if (portalEntry) {
              return { crossesGrid: true, destGrid: portalEntry.destGrid, entryPosition: portalEntry.entryPosition }
            }
            return null // not a portal, or a portal that's fully blocked — same outcome either way
          }
          if (isCellOccupiedByAnotherPlayer(candidate, grid, hostPlayers, movingPlayerId)) return null
          return { crossesGrid: false, candidate }
        }

        // Solely responsible for telling everyone the object moved — the
        // callers below used to follow up with a full broadcastGridObjects
        // of the source grid, which covered the removal side for free.
        // They no longer do, so both ends must be announced here.
        function commit(target: PushTarget) {
          if (target.crossesGrid) {
            const destKey = gridKey(target.destGrid)
            const destObjects = hostGridObjects[destKey] ?? {}
            const movedObject: GridObject = { ...object, position: target.entryPosition }
            hostGridObjects = {
              ...hostGridObjects,
              [key]: withoutObjectAt(objects, targetPosition),
              [destKey]: {
                ...destObjects,
                [gridKey(target.entryPosition)]: movedObject,
              },
            }
            void saveGridObjects(hostGridObjects)
            dispatchActionEvent({
              type: 'object-move',
              object,
              playerId: movingPlayerId,
              fromGrid: grid,
              toGrid: target.destGrid,
              from: targetPosition,
              to: target.entryPosition,
            })
            // Two grids, two audiences: it vanished for whoever stayed
            // behind, and appeared for whoever is on the far side.
            broadcastObjectRemove(grid, object.id)
            broadcastObjectPatch(target.destGrid, movedObject)
            notifyCellChanged(movingPlayerId, grid, targetPosition)
            notifyCellChanged(movingPlayerId, target.destGrid, target.entryPosition)
          } else {
            const movedObject: GridObject = { ...object, position: target.candidate }
            hostGridObjects = {
              ...hostGridObjects,
              [key]: {
                ...withoutObjectAt(objects, targetPosition),
                [gridKey(target.candidate)]: movedObject,
              },
            }
            void saveGridObjects(hostGridObjects)
            dispatchActionEvent({
              type: 'object-move',
              object,
              playerId: movingPlayerId,
              fromGrid: grid,
              toGrid: grid,
              from: targetPosition,
              to: target.candidate,
            })
            // Same grid, same id — the new position rides along on the
            // object, so one upsert says everything.
            broadcastObjectPatch(grid, movedObject)
            notifyCellChanged(movingPlayerId, grid, targetPosition)
            notifyCellChanged(movingPlayerId, grid, target.candidate)
          }
        }

        // Continuing straight in the push direction always wins when
        // it's available at all.
        const primary = evaluate(direction)
        if (primary) {
          commit(primary)
          return true
        }

        // Otherwise, pick uniformly at random among whichever
        // perpendicular neighbors are actually free — but staying on the
        // current grid always beats crossing into another one: only
        // consider the cross-grid fallbacks when no same-grid one is free.
        const behind: GridCoord = { x: -direction.x, y: -direction.y }
        const fallbackTargets = ORTHOGONAL_DIRECTIONS.filter(
          (d) => (d.x !== direction.x || d.y !== direction.y) && (d.x !== behind.x || d.y !== behind.y)
        )
          .map((d) => evaluate(d))
          .filter((target): target is PushTarget => target !== null)
        const sameGridFallbackTargets = fallbackTargets.filter((target) => !target.crossesGrid)
        const preferredTargets = sameGridFallbackTargets.length > 0 ? sameGridFallbackTargets : fallbackTargets
        if (preferredTargets.length === 0) return false
        commit(preferredTargets[Math.floor(Math.random() * preferredTargets.length)])
        return true
      }

      // Fires each neighbor's own isUpdate-flagged action, by whatever
      // name it carries (see getUpdateActionName in game-objects.ts), on
      // whichever of this cell's same-grid cardinal neighbors currently
      // hold an object that answers to it — called after any mutation
      // that makes an object or special cell appear or leave a cell
      // (not for a same-cell .state-only change). `changed` is
      // re-derived from the already-mutated hostGridObjects rather than
      // passed in, so it always reflects ground truth right after the
      // mutation: present (with its id/type) when an object currently
      // occupies the changed cell, undefined when it just left or the
      // change was special-cell-only — see TriggerRef's own doc.
      function notifyCellChanged(
        playerId: string,
        grid: GridCoord,
        position: CellPosition,
        excludePosition?: CellPosition
      ) {
        const changed = objectAt(hostGridObjects, grid, position)
        for (const direction of ORTHOGONAL_DIRECTIONS) {
          const neighborPosition: CellPosition = { x: position.x + direction.x, y: position.y + direction.y }
          if (excludePosition && neighborPosition.x === excludePosition.x && neighborPosition.y === excludePosition.y) continue
          if (!isCellVisible(neighborPosition, worldForGrid(grid))) continue
          const neighbor = objectAt(hostGridObjects, grid, neighborPosition)
          if (!neighbor) continue
          const updateActionName = getUpdateActionName(neighbor.type)
          if (!updateActionName) continue
          void invokeObjectAction(playerId, neighbor.id, updateActionName, undefined, {
            position,
            grid,
            objectId: changed?.id,
            objectType: changed?.type,
          })
        }
      }

      // Runs the isUpdate action of whatever object now occupies `position`
      // (see getUpdateActionName) — notifyCellChanged above only ever reaches
      // the four neighbors, never the cell itself, so this covers a freshly
      // placed/landed object and an existing, unmoved one whose ground (a
      // special cell) just changed under it, e.g. a redstone-detector when a
      // color is painted, or pushed/pulled through a portal, beneath it.
      function notifyCellItself(playerId: string, grid: GridCoord, position: CellPosition) {
        const objectHere = objectAt(hostGridObjects, grid, position)
        if (!objectHere) return
        const updateActionName = getUpdateActionName(objectHere.type)
        if (!updateActionName) return
        void invokeObjectAction(playerId, objectHere.id, updateActionName)
      }

      // The actual "make it real" application of one moveSpecialCell call
      // against the live host state, possibly across two different grids
      // (fromGrid/toGrid — see stepInDirection in world.ts / ctx.stepInDirection,
      // which is what resolves them before calling this): persists and
      // broadcasts whichever grid(s) actually changed. Every collision rule
      // lives in moveSpecialCell itself; this is purely the "make it real"
      // side a pure array function can't do on its own. No bounds-checking
      // here — the caller already resolved valid, in-world positions.
      // Returns whether anything actually moved, so applySpecialCellMove's
      // portal redirect (below) knows to retry a different candidate cell
      // on a no-op.
      function commitSpecialCellMove(
        playerId: string,
        fromGrid: GridCoord,
        from: CellPosition,
        toGrid: GridCoord,
        to: CellPosition,
        behavior: SpecialCellMoveBehavior,
        direction: GridCoord
      ): boolean {
        const fromKey = gridKey(fromGrid)
        const toKey = gridKey(toGrid)
        const fromCells = hostSpecialCells[fromKey] ?? []
        const toCells = fromKey === toKey ? fromCells : (hostSpecialCells[toKey] ?? [])

        const result = moveSpecialCell(fromCells, toCells, from, to, behavior)
        if (result.fromCells === fromCells && result.toCells === toCells) return false // nothing moved

        hostSpecialCells =
          fromKey === toKey
            ? { ...hostSpecialCells, [fromKey]: result.fromCells }
            : { ...hostSpecialCells, [fromKey]: result.fromCells, [toKey]: result.toCells }
        void saveSpecialCells(hostSpecialCells)
        // Derived by re-reading both ends rather than reimplementing
        // moveSpecialCell's rules: under MERGE_CELL only one attribute
        // moves per push, so `from` may still hold the other one — a
        // patch then, not a remove. An entry that's gone entirely is
        // absent from the array, which is exactly the remove case.
        // Objects are untouched here, so none are sent at all.
        const remainingFrom = specialCellAt(hostSpecialCells, fromGrid, from)
        if (remainingFrom) broadcastSpecialCellPatch(fromGrid, remainingFrom)
        else broadcastSpecialCellRemove(fromGrid, from)
        const landedTo = specialCellAt(hostSpecialCells, toGrid, to)
        if (landedTo) broadcastSpecialCellPatch(toGrid, landedTo)
        notifyCellChanged(playerId, fromGrid, from)
        notifyCellItself(playerId, fromGrid, from)
        notifyCellChanged(playerId, toGrid, to)
        notifyCellItself(playerId, toGrid, to)

        // Only past this point does anything actually visibly move, so
        // only past this point does anything giggle — a wasted punch/
        // pull (blocked, or nothing there) never triggers one. Both
        // cells react at the same instant, same direction (the caller's
        // own travel direction — see ObjectActionInvocationContext.
        // moveSpecialCell's doc for why it isn't re-derived here).
        broadcastSpecialCellShake(fromGrid, from, direction)
        broadcastSpecialCellShake(toGrid, to, direction)
        return true
      }

      // Host-only: portal redirect for a special-cell move — entering an
      // owned arbitrary grid when `to` turns out to be a portal object's
      // own cell (a push), or extracting from one when `from` is (a pull).
      // Both search the edge facing the travel direction (shuffledEdgeCells,
      // same geometry randomEdgeCellWithPush uses), retrying a different
      // candidate whenever commitSpecialCellMove reports a no-op — same
      // "keep trying until one works, blocked only once every edge cell has
      // failed" contract as a player/object entering. `direction` is
      // negated when the portal is on the `from` side: it's the cosmetic
      // travel direction of *this specific* call (reversed for a pull
      // versus its matching push), while the edge itself is one fixed
      // physical spot facing the object's approach direction — the same
      // edge for a push into it and a pull out of it.
      function applySpecialCellMove(
        playerId: string,
        fromGrid: GridCoord,
        from: CellPosition,
        toGrid: GridCoord,
        to: CellPosition,
        behavior: SpecialCellMoveBehavior,
        direction: GridCoord
      ) {
        const toOccupant = (hostGridObjects[gridKey(toGrid)] ?? {})[gridKey(to)]
        const toPortal = toOccupant && findOwnedArbitraryGrid(toOccupant.id)
        if (toPortal) {
          for (const candidate of edgeCells(worldForGrid(toPortal), direction)) {
            if (commitSpecialCellMove(playerId, fromGrid, from, toPortal, candidate, behavior, direction)) return
          }
          return
        }

        const fromOccupant = (hostGridObjects[gridKey(fromGrid)] ?? {})[gridKey(from)]
        const fromPortal = fromOccupant && findOwnedArbitraryGrid(fromOccupant.id)
        if (fromPortal) {
          const edgeDirection = { x: -direction.x, y: -direction.y }
          for (const candidate of edgeCells(worldForGrid(fromPortal), edgeDirection)) {
            if (commitSpecialCellMove(playerId, fromPortal, candidate, toGrid, to, behavior, direction)) return
          }
          return
        }

        commitSpecialCellMove(playerId, fromGrid, from, toGrid, to, behavior, direction)
      }

      // Sets a grid object's state by id — the object may be anywhere,
      // not necessarily the one whose action is running (see
      // ObjectActionInvocationContext.setObjectState), so this looks the
      // target up by id rather than trusting a passed-in grid. No-op if
      // it no longer exists.
      function applyObjectState(objectId: string, state: ObjectState | undefined) {
        const found = findObjectWithGrid(objectId)
        if (!found) return
        const key = gridKey(found.grid)
        const objects = hostGridObjects[key] ?? {}
        // Built once and used for both the map write and the patch, so
        // the two can't drift apart.
        const nextObject: GridObject = { ...found.object, state }
        hostGridObjects = {
          ...hostGridObjects,
          [key]: { ...objects, [gridKey(found.object.position)]: nextObject },
        }
        void saveGridObjects(hostGridObjects)
        // The hot path: a redstone cascade lands here once per hop, so
        // this must stay a single-object delta rather than a whole grid.
        broadcastObjectPatch(found.grid, nextObject)
      }

      // Host-only: makes a brand-new grid unreachable via ordinary
      // adjacency, sized independently of the shared matrix, and assigns
      // it its own outline color (see gridColor/GridColors in world.ts —
      // without this every arbitrary grid would fall back to the same
      // default color, since generateGridColors's matrix pass never
      // visits one). boardRadius is derived as size - 2, matching every
      // existing WorldState constant in this codebase
      // (DEFAULT_SHARED_SETTINGS 8/6, WAIT_ROOM_WORLD and the sandbox
      // override both 100/98) — callers of this function think in "how
      // big a room," not board-radius geometry. Starts completely empty
      // — never runs generateWorldObjects/generateWorldSpecialCells.
      // Always allocates a fresh id: there's no way to address an
      // existing grid again by supplying its id back, so a caller
      // wanting to reuse the same grid across triggers must remember the
      // returned GridCoord itself (e.g. via setValue/getValue in
      // room-values.ts).
      function createArbitraryGrid(size: number, color: CubeColor, state?: string): GridCoord {
        const grid: GridCoord = { x: ARBITRARY_GRID_X, y: hostNextArbitraryGridId }
        hostNextArbitraryGridId += 1
        void saveArbitraryGridCounter(hostNextArbitraryGridId)
        const boardSize = Math.max(1, size)
        // Clamped at 0, not left to go negative: isCellVisible rejects
        // every cell (including the center) once boardRadius < 0, which
        // for size 1 or 2 would make boardSize - 2 produce a completely
        // unusable board rather than just a small one.
        const boardRadius = Math.max(0, boardSize - 2)
        hostArbitraryGrids = {
          ...hostArbitraryGrids,
          [gridKey(grid)]: { boardSize, boardRadius, worldSize: 1, state },
        }
        void saveArbitraryGrids(hostArbitraryGrids)
        setArbitraryGrids(hostArbitraryGrids)
        peer.broadcast({ type: 'arbitrary-grids', grids: hostArbitraryGrids })
        hostGridColors = { ...hostGridColors, [gridKey(grid)]: color }
        void saveGridColors(hostGridColors)
        setGridColors(hostGridColors)
        peer.broadcast({ type: 'grid-colors', colors: hostGridColors })
        return grid
      }

      // Host-only: moves playerId directly onto grid — in-matrix or
      // arbitrary, whichever it is — landing at spawnPosition if given
      // (trusted as-is, not occupancy-checked — same convention as
      // moveSpecialCell's from/to) or otherwise a random free cell
      // avoiding players/objects/special cells, mirroring
      // regenerateWorld's own spawn placement. No-op if grid looks
      // arbitrary but was never actually created via createArbitraryGrid,
      // or if playerId isn't known. Always a full resync
      // (broadcastGridObjects) since the mover has never necessarily
      // seen this grid before — and, for an arbitrary destination, a
      // direct send of its own dimensions too, since broadcastGridObjects
      // only covers objects/special cells.
      function movePlayerToGrid(playerId: string, grid: GridCoord, spawnPosition?: CellPosition, direction?: GridCoord) {
        const current = hostPlayers[playerId]
        if (!current) return
        if (isArbitraryGrid(grid) && !hostArbitraryGrids[gridKey(grid)]) return
        const world = worldForGrid(grid)
        let position: CellPosition
        if (spawnPosition && direction) {
          if (isCellOccupiedByAnotherPlayer(spawnPosition, grid, hostPlayers, playerId)) return
          if (!pushObjectIfPresent(grid, spawnPosition, direction, playerId)) return
          position = spawnPosition
        } else if (direction) {
          const resolved = randomEdgeCellWithPush(grid, world, direction, playerId, true)
          if (!resolved) return
          position = resolved
        } else {
          position = spawnPosition ?? randomFreeBoardCell(hostPlayers, grid, world, unavailablePlayerCellsOn(grid))
        }
        const fromGrid: GridCoord = { x: current.gridX, y: current.gridY }
        const fromPosition = current.position
        hostPlayers[playerId] = { ...current, gridX: grid.x, gridY: grid.y, position }
        dispatchActionEvent({ type: 'player-move', playerId, fromGrid, toGrid: grid, from: fromPosition, to: position })
        if (isArbitraryGrid(grid)) {
          peer.sendTo(playerId, { type: 'arbitrary-grids', grids: hostArbitraryGrids })
        }
        broadcastGridObjects(grid)
        syncPlayers()
      }

      // The Inventaire tool (see use-inventory-placement.ts) — a player
      // places one item at an exact cell, on their own current grid.
      // Available in the waiting room (no game running yet, whatever
      // mode is selected for the next one) and during a Sandbox game;
      // blocked only mid-Framed-game, whose own gameplay flow this
      // would otherwise interfere with.
      function placeInventoryItem(playerId: string, position: CellPosition, item: InventoryItem) {
        if (hostGameStarted && hostSharedSettings.mode === 'framed') return
        const player = hostPlayers[playerId]
        if (!player) return
        const grid: GridCoord = { x: player.gridX, y: player.gridY }
        if (!isCellVisible(position, worldForGrid(grid))) return
        const key = gridKey(grid)

        if (item.kind === 'object') {
          const existingObjects = hostGridObjects[key] ?? {}
          const positionKey = gridKey(position)
          // A cell holds at most one object — placement never replaces
          // one that's already there, it just does nothing. An object
          // must also never be placed underneath any player (including
          // the player doing the placement), which keeps normal clicks
          // and drag-paint strokes from creating overlapping entities.
          if (existingObjects[positionKey] || isCellOccupiedByAnotherPlayer(position, grid, hostPlayers)) return
          const newObject: GridObject = {
            id: generateObjectId(),
            position,
            type: item.type,
            color: randomCubeColor(),
            state: OBJECT_TYPES_BY_ID.get(item.type)?.defaultState,
            variant: item.variant,
          }
          hostGridObjects = { ...hostGridObjects, [key]: { ...existingObjects, [positionKey]: newObject } }
          void saveGridObjects(hostGridObjects)
          broadcastObjectPatch(grid, newObject)
        } else if (item.kind === 'color' || item.kind === 'shape') {
          const existingCells = hostSpecialCells[key] ?? []
          const existingCell = existingCells.find(
            (cell) => cell.position.x === position.x && cell.position.y === position.y
          )
          // Merges onto whatever's already there — placing a color
          // preserves an existing shape at that cell, and vice versa
          // (see SpecialCell's own doc in special-cells.ts).
          const nextCell: SpecialCell = {
            position,
            color: item.kind === 'color' ? item.color : existingCell?.color,
            shape: item.kind === 'shape' ? item.shape : existingCell?.shape,
          }
          hostSpecialCells = {
            ...hostSpecialCells,
            [key]: [
              ...existingCells.filter((cell) => !(cell.position.x === position.x && cell.position.y === position.y)),
              nextCell,
            ],
          }
          void saveSpecialCells(hostSpecialCells)
          // nextCell always carries at least the attribute just placed,
          // so this is never an "empty" patch.
          broadcastSpecialCellPatch(grid, nextCell)
        } else {
          // The eraser has no placement payload of its own — routed to
          // eraseCellAt instead (see game-screen.tsx).
          return
        }
        notifyCellChanged(playerId, grid, position)
        notifyCellItself(playerId, grid, position)
      }

      // The Inventaire tool's "Croix" entry — clears anything at that
      // cell: any object, and the special cell's color/shape entirely
      // (not nulling its fields — an absent entry is how "empty" is
      // represented, see SpecialCell's own doc in special-cells.ts).
      function eraseCellAt(playerId: string, position: CellPosition) {
        if (hostGameStarted && hostSharedSettings.mode === 'framed') return
        const player = hostPlayers[playerId]
        if (!player) return
        const grid: GridCoord = { x: player.gridX, y: player.gridY }
        if (!isCellVisible(position, worldForGrid(grid))) return
        const key = gridKey(grid)
        // Kept as the object, not just a boolean: its id is what the
        // removal patch below is addressed by.
        const erasedObject = objectAt(hostGridObjects, grid, position)
        const hadSpecialCell = !!specialCellAt(hostSpecialCells, grid, position)

        hostGridObjects = {
          ...hostGridObjects,
          [key]: withoutObjectAt(hostGridObjects[key] ?? {}, position),
        }
        void saveGridObjects(hostGridObjects)
        hostSpecialCells = {
          ...hostSpecialCells,
          [key]: (hostSpecialCells[key] ?? []).filter(
            (cell) => !(cell.position.x === position.x && cell.position.y === position.y)
          ),
        }
        void saveSpecialCells(hostSpecialCells)
        if (erasedObject) broadcastObjectRemove(grid, erasedObject.id)
        if (hadSpecialCell) broadcastSpecialCellRemove(grid, position)
        if (erasedObject || hadSpecialCell) {
          notifyCellChanged(playerId, grid, position)
          notifyCellItself(playerId, grid, position)
        }
      }

      // Full removal, for players that leave the game for good (explicit
      // leave or kick): their id and cached identity/avatar disappear
      // from everyone.
      function forgetPlayer(playerId: string) {
        delete hostPlayers[playerId]
        knownPlayers.delete(playerId)
        remoteAvatarBlobs.delete(playerId)
        applyAvatar(playerId, null)
        syncPlayers()
      }

      // The edge that continues `direction` (same edge gridEntryPosition
      // would land an ordinary matrix crossing on), diamond-mask filtered via
      // isCellVisible, in a fixed left-to-right order (top-to-bottom for an
      // east/west-facing edge) — i.e. ascending along whichever coordinate
      // varies across that edge. Shared geometry between randomEdgeCellWithPush
      // (below, for a player/object entering a grid) and the special-cell
      // portal redirect in applySpecialCellMove, which use it via the two
      // wrappers below.
      function edgeCells(world: WorldState, direction: GridCoord): CellPosition[] {
        const { minIndex, maxIndex } = boardEdgeRange(world)
        const candidates: CellPosition[] = []
        for (let i = minIndex; i <= maxIndex; i++) {
          const cell: CellPosition =
            direction.y === -1 ? { x: i, y: maxIndex } :
            direction.y === 1 ? { x: i, y: minIndex } :
            direction.x === 1 ? { x: minIndex, y: i } :
            { x: maxIndex, y: i }
          if (isCellVisible(cell, world)) candidates.push(cell)
        }
        return candidates
      }

      // Same candidates as edgeCells, shuffled — used where entry should feel
      // random (a player or object entering a grid, see randomEdgeCellWithPush).
      function shuffledEdgeCells(world: WorldState, direction: GridCoord): CellPosition[] {
        const candidates = edgeCells(world, direction)
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        }
        return candidates
      }

      // Resolves where something entering `grid` from `direction` (no fixed
      // spawnPosition given — see ctx.moveToGrid / resolvePortalEntry) lands:
      // a uniformly random cell among shuffledEdgeCells. A candidate already
      // held by another player is always skipped (never displaceable). A
      // candidate holding an object is pushed aside (pushObjectIfPresent,
      // same direction/fallback/cascade rules as a real crossing) only when
      // canPush is true — true for a player entering (players have always
      // been able to push objects), false for an object entering through a
      // portal (an object can never push another object, in or out of an
      // arbitrary grid — same rule pushObjectIfPresent's own same-grid/
      // cross-grid candidate checks already enforce everywhere else). Tried
      // in random order, retried on failure; null once every edge cell has
      // been tried and failed, meaning the whole entry is blocked.
      function randomEdgeCellWithPush(
        grid: GridCoord,
        world: WorldState,
        direction: GridCoord,
        playerId: string,
        canPush: boolean
      ): CellPosition | null {
        for (const candidate of shuffledEdgeCells(world, direction)) {
          if (isCellOccupiedByAnotherPlayer(candidate, grid, hostPlayers, playerId)) continue
          if (canPush) {
            if (!pushObjectIfPresent(grid, candidate, direction, playerId)) continue
          } else if ((hostGridObjects[gridKey(grid)] ?? {})[gridKey(candidate)]) {
            continue
          }
          return candidate
        }
        return null
      }

      // If `occupant` is itself a portal, resolves a landing spot inside
      // its grid the same way a player entering it would
      // (randomEdgeCellWithPush) — a random edge cell in `direction`,
      // pushing whatever's already there, retried on failure. Returns
      // undefined when `occupant` isn't a portal at all (caller falls
      // back to its own ordinary "cell occupied" handling), or null when
      // it is a portal but every edge cell failed (the whole push is
      // blocked).
      function resolvePortalEntry(
        occupant: GridObject,
        direction: GridCoord,
        movingPlayerId: string
      ): { destGrid: GridCoord; entryPosition: CellPosition } | null | undefined {
        const portalGrid = findOwnedArbitraryGrid(occupant.id)
        if (!portalGrid) return undefined
        const entryPosition = randomEdgeCellWithPush(portalGrid, worldForGrid(portalGrid), direction, movingPlayerId, false)
        return entryPosition ? { destGrid: portalGrid, entryPosition } : null
      }

      // Host-only stepInDirection (mirrors the pure one in world.ts) used to
      // resolve a magnet's `far` cell (see ctx.stepInDirection, resolvePunchCells
      // in game-objects.ts): identical ordinary-crossing behavior, except a
      // step that would cross an *owned* arbitrary grid's own board edge — which
      // has no ordinary neighbor for the pure version to find — redirects to
      // land beside the owning object's real position instead, same redirect
      // attemptMoveToGrid's ownerObjectId branch already does for a player.
      function resolveSpecialCellStep(grid: GridCoord, position: CellPosition, direction: GridCoord): GridStep | null {
        const world = worldForGrid(grid)
        const crossesToNeighborGrid = boardEdgeDirections(position, world).some(
          (edge) => edge.x === direction.x && edge.y === direction.y
        )
        if (crossesToNeighborGrid) {
          if (isArbitraryGrid(grid) && world.state) {
            const found = findObjectWithGrid(world.state)
            if (!found) return null
            return {
              grid: found.grid,
              position: { x: found.object.position.x + direction.x, y: found.object.position.y + direction.y },
            }
          }
          const destGrid: GridCoord = { x: grid.x + direction.x, y: grid.y + direction.y }
          if (!isGridInWorld(destGrid, world)) return null
          return { grid: destGrid, position: gridEntryPosition(position, direction, world) }
        }
        const candidate: CellPosition = { x: position.x + direction.x, y: position.y + direction.y }
        if (!isCellVisible(candidate, world)) return null
        return { grid, position: candidate }
      }

      // Crossing a board edge into the neighboring grid: rejects unless
      // the player is actually standing on an edge cell bordering that
      // direction (mirrors the enabled/disabled marker in GameGrid), the
      // destination grid exists in the world, and its mirrored entry
      // point isn't already occupied by another player there. If an
      // object sits on that entry cell, it gets pushed exactly like a
      // same-grid move (see pushObjectIfPresent) — same direction, same
      // fallback neighbors, same cross-grid cascading — and the crossing
      // is rejected too when the object can't be displaced anywhere.
      function attemptMoveToGrid(playerId: string, direction: GridCoord, ownerObjectId?: string): boolean {
        const current = hostPlayers[playerId]
        if (!current) return false
        const fromGrid: GridCoord = { x: current.gridX, y: current.gridY }

        let targetGrid: GridCoord
        let entryPosition: CellPosition
        if (ownerObjectId) {
          // Arbitrary grids have no real neighbors, so a border click
          // there isn't an ordinary crossing — instead it lands the
          // player beside the owning object's own current position,
          // wherever that actually is (see findObjectWithGrid), same as
          // an object might move after ctx.createGrid handed the id
          // back to whoever called it.
          const found = findObjectWithGrid(ownerObjectId)
          if (!found) return false
          targetGrid = found.grid
          entryPosition = { x: found.object.position.x + direction.x, y: found.object.position.y + direction.y }
        } else {
          const world = worldForGrid(fromGrid)
          const validDirections = boardEdgeDirections(current.position, world)
          if (!validDirections.some((d) => d.x === direction.x && d.y === direction.y)) return false
          targetGrid = { x: current.gridX + direction.x, y: current.gridY + direction.y }
          if (!isGridInWorld(targetGrid, world)) return false
          entryPosition = gridEntryPosition(current.position, direction, world)
        }

        if (isCellOccupiedByAnotherPlayer(entryPosition, targetGrid, hostPlayers, playerId)) return false
        if (!pushObjectIfPresent(targetGrid, entryPosition, direction, playerId)) return false
        const fromPosition = current.position
        hostPlayers[playerId] = {
          ...current,
          gridX: targetGrid.x,
          gridY: targetGrid.y,
          position: entryPosition,
        }
        dispatchActionEvent({
          type: 'player-move',
          playerId,
          fromGrid,
          toGrid: targetGrid,
          from: fromPosition,
          to: entryPosition,
        })
        broadcastGridObjects(targetGrid)
        return true
      }

      function handleGuestOpen(playerId: string) {
        const known = knownPlayers.get(playerId)
        const defaultSpawnGrid = centerGridCoord(currentWorld())
        const targetGrid: GridCoord = known
          ? { x: known.gridX, y: known.gridY }
          : defaultSpawnGrid
        const canRestorePosition =
          known &&
          !isCellOccupiedByAnotherPlayer(known.position, targetGrid, hostPlayers) &&
          !unavailablePlayerCellsOn(targetGrid).some(
            (position) => position.x === known.position.x && position.y === known.position.y
          )
        hostPlayers[playerId] = {
          position: canRestorePosition
            ? known.position
            : randomFreeBoardCell(hostPlayers, targetGrid, worldForGrid(targetGrid), unavailablePlayerCellsOn(targetGrid)),
          gridX: targetGrid.x,
          gridY: targetGrid.y,
          color: known?.color ?? randomCubeColor(),
          username: known?.username ?? '',
        }
        syncPlayers()
        // Sent once per connection, like the avatar below: the guest
        // caches it (see room-store.ts) instead of needing it resent.
        peer.sendTo(playerId, { type: 'grid-colors', colors: hostGridColors })
        peer.sendTo(playerId, { type: 'arbitrary-grids', grids: hostArbitraryGrids })
        // Same "sent once, guest caches it" idea for the synced settings.
        peer.sendTo(playerId, { type: 'settings-sync', settings: hostSharedSettings })
        // Unlike grid colors, only this guest's current grid — resent
        // whenever it changes grid (see the 'move-grid' handler below).
        sendGridObjectsTo(playerId)
        sendSpecialCellsTo(playerId)
        // Only sent if true: a guest connecting/reconnecting while the
        // game is already running needs to know right away instead of
        // showing the waiting room.
        if (hostGameStarted) peer.sendTo(playerId, { type: 'game-started' })
        // A guest connecting mid-countdown needs the real endAt right
        // away to show correct time remaining, not just "enabled".
        if (hostTimerEndAt !== null) {
          peer.sendTo(playerId, { type: 'timer', enabled: true, endAt: hostTimerEndAt })
        }
        // A reconnecting guest needs its identity resent — it never
        // persists it client-side (see the 'identity' handler below), so
        // a reload would otherwise leave it stuck waiting for one.
        const knownIdentity = hostIdentities[playerId]
        if (knownIdentity) peer.sendTo(playerId, { type: 'identity', identity: knownIdentity })
        // Same idea for GLOBAL values: a guest never persists another
        // player's/the host's writes itself beyond what it's told, so a
        // reconnect needs every currently-known global resent.
        for (const [name, lifetime] of Object.entries(hostGlobalValues)) {
          void getStoredValue(name).then((value) => {
            if (value !== undefined) peer.sendTo(playerId, { type: 'value-set', name, value, lifetime })
          })
        }

        getLocalAvatarBlob().then((blob) => {
          if (blob) sendAvatar((message) => peer.sendTo(playerId, message), localPlayerId, blob)
        })
        remoteAvatarBlobs.forEach((blob, avatarPlayerId) => {
          if (avatarPlayerId !== playerId) {
            sendAvatar((message) => peer.sendTo(playerId, message), avatarPlayerId, blob)
          }
        })
      }

      function handleGuestMessage(playerId: string, message: RoomMessage) {
        if (message.type === 'move') {
          const current = hostPlayers[playerId]
          if (
            !current ||
            !isAdjacent(current.position, message.position) ||
            isCellOccupiedByAnotherPlayer(
              message.position,
              { x: current.gridX, y: current.gridY },
              hostPlayers,
              playerId
            )
          ) {
            // Rejected: tell just this guest the authoritative state so
            // it can snap its optimistic cube back to the last valid
            // position instead of staying silently desynced.
            setMoveMissCount((count) => count + 1)
            peer.sendTo(playerId, { type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
            return
          }
          const grid: GridCoord = { x: current.gridX, y: current.gridY }
          const direction: GridCoord = {
            x: message.position.x - current.position.x,
            y: message.position.y - current.position.y,
          }
          if (!pushObjectIfPresent(grid, message.position, direction, playerId)) {
            // Every neighbor of the object is blocked: the push (and so
            // the move that triggered it) can't happen at all.
            setMoveMissCount((count) => count + 1)
            peer.sendTo(playerId, { type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
            return
          }
          hostPlayers[playerId] = { ...current, position: message.position }
          dispatchActionEvent({
            type: 'player-move',
            playerId,
            fromGrid: grid,
            toGrid: grid,
            from: current.position,
            to: message.position,
          })
          syncPlayers()
          // No object broadcast here: pushObjectIfPresent above already
          // announced anything it moved, and a step that pushed nothing
          // — the common case — leaves the grid untouched.
        } else if (message.type === 'move-grid') {
          if (!attemptMoveToGrid(playerId, message.direction, message.objectId)) {
            setMoveMissCount((count) => count + 1)
            peer.sendTo(playerId, { type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
            return
          }
          // attemptMoveToGrid already resent the destination grid's
          // objects to everyone standing on it, including this player.
          syncPlayers()
        } else if (message.type === 'avatar') {
          remoteAvatarBlobs.set(playerId, message.image)
          applyAvatar(playerId, message.image)
          for (const otherPlayerId of Object.keys(hostPlayers)) {
            if (otherPlayerId !== playerId) {
              sendAvatar((m) => peer.sendTo(otherPlayerId, m), playerId, message.image)
            }
          }
        } else if (message.type === 'username') {
          const current = hostPlayers[playerId]
          if (!current) return
          hostPlayers[playerId] = { ...current, username: message.username }
          syncPlayers()
        } else if (message.type === 'teleport-to-player') {
          teleportPlayerToPlayer(playerId, message.targetPlayerId)
        } else if (message.type === 'object-action') {
          void invokeObjectAction(playerId, message.objectId, message.actionName)
        } else if (message.type === 'place-item') {
          placeInventoryItem(playerId, message.position, message.item)
        } else if (message.type === 'erase-cell') {
          eraseCellAt(playerId, message.position)
        } else if (message.type === 'object-actions-request') {
          void (async () => {
            const found = findObjectWithGrid(message.objectId)
            let actions: { name: string; color?: CubeColor }[] = []
            if (found) {
              const player = hostPlayers[playerId]
              const ctx: ObjectActionBuilderContext = {
                object: {
                  objectId: found.object.id,
                  objectType: found.object.type,
                  position: found.object.position,
                  grid: found.grid,
                  variant: found.object.variant,
                },
                playerId,
                playerName: player?.username ?? '',
                players: hostPlayers,
                specialCells: hostSpecialCells,
                gridObjects: hostGridObjects,
                world: worldForGrid(found.grid),
                state: found.object.state,
              }
              actions = (await resolveObjectActions(found.object.type, ctx))
                .flatMap((a) => resolveActionNames(a))
                .filter((entry) => !entry.hidden)
                .map((entry) => ({ name: entry.name, color: entry.color }))
            }
            peer.sendTo(playerId, { type: 'object-actions-response', requestId: message.requestId, actions })
          })()
        } else if (message.type === 'leave') {
          forgetPlayer(playerId)
        }
      }

      function handleGuestClose(playerId: string) {
        const state = hostPlayers[playerId]
        if (state) knownPlayers.set(playerId, state)
        delete hostPlayers[playerId]
        syncPlayers()
      }

      function dispatchPeerEvent(event: RoomPeerEvent) {
        if (event.type === 'guest-open') {
          handleGuestOpen(event.playerId)
        } else if (event.type === 'guest-message') {
          handleGuestMessage(event.playerId, event.message as RoomMessage)
        } else if (event.type === 'guest-close') {
          handleGuestClose(event.playerId)
        }
      }

      unsubscribe = peer.subscribe((event) => {
        if (!worldReady) {
          pendingEvents.push(event)
          return
        }
        dispatchPeerEvent(event)
      })

      movePlayerRef.current = (position) => {
        const current = hostPlayers[localPlayerId]
        if (
          !current ||
          !isAdjacent(current.position, position) ||
          isCellOccupiedByAnotherPlayer(
            position,
            { x: current.gridX, y: current.gridY },
            hostPlayers,
            localPlayerId
          )
        ) {
          return
        }
        const grid: GridCoord = { x: current.gridX, y: current.gridY }
        const direction: GridCoord = { x: position.x - current.position.x, y: position.y - current.position.y }
        if (!pushObjectIfPresent(grid, position, direction, localPlayerId)) return
        hostPlayers[localPlayerId] = { ...current, position }
        dispatchActionEvent({
          type: 'player-move',
          playerId: localPlayerId,
          fromGrid: grid,
          toGrid: grid,
          from: current.position,
          to: position,
        })
        syncPlayers()
        // Same as the guest 'move' handler above: pushObjectIfPresent
        // announces whatever it moved, and a step that pushed nothing
        // changes no objects at all.
      }

      // Shared by the host's own press and a guest's relayed
      // 'teleport-to-player' message, so both run identical logic. Only
      // ever same-grid: the bubble that offers this is drawn for
      // same-grid players only (see game-grid.tsx), and a target who
      // has since crossed into another grid is rejected here rather
      // than silently dragging the caller across with them.
      function teleportPlayerToPlayer(playerId: string, targetPlayerId: string) {
        if (playerId === targetPlayerId) return
        const current = hostPlayers[playerId]
        const target = hostPlayers[targetPlayerId]
        if (!current || !target) return
        if (current.gridX !== target.gridX || current.gridY !== target.gridY) return
        const grid: GridCoord = { x: current.gridX, y: current.gridY }
        // Objects block the landing cell — nothing pushes them aside the
        // way a real move would (see pushObjectIfPresent above), so
        // landing on one would leave a player sharing a cell with it.
        const objectCells = Object.values(hostGridObjects[gridKey(grid)] ?? {}).map((object) => object.position)
        const destination = randomFreeCellNear(
          target.position,
          hostPlayers,
          grid,
          worldForGrid(grid),
          objectCells,
          playerId
        )
        if (!destination) return
        hostPlayers[playerId] = { ...current, position: destination }
        dispatchActionEvent({
          type: 'player-move',
          playerId,
          fromGrid: grid,
          toGrid: grid,
          from: current.position,
          to: destination,
        })
        syncPlayers()
      }

      teleportToPlayerRef.current = (targetPlayerId) => {
        teleportPlayerToPlayer(localPlayerId, targetPlayerId)
      }

      moveToGridRef.current = (direction, objectId) => {
        if (!attemptMoveToGrid(localPlayerId, direction, objectId)) return
        // attemptMoveToGrid already refreshed the local slice (via
        // broadcastGridObjects) for whichever grid this landed on.
        syncPlayers()
      }

      startActionRef.current = (instance) => {
        startActionEngine(instance)
      }
      verifyActionRef.current = (instance) => verifyActionEngine(instance)
      actionsContextRef.current = actionsCtx

      kickPlayerRef.current = (playerId) => {
        if (!peer.isConnected(playerId)) return
        peer.sendTo(playerId, { type: 'kicked' })
        // Dropped from the transport before forgetPlayer's players-sync
        // broadcast, so the kicked guest never sees the room without
        // itself — just the 'kicked' farewell.
        peer.disconnectGuest(playerId)
        forgetPlayer(playerId)
      }

      startGameRef.current = () => {
        if (hostGameStarted) return
        // A running timer must never carry over into a new screen.
        stopTimerNow()
        hostGameStarted = true
        setGameStarted(true)
        void saveGameStarted(true)

        // WAIT_ROOM-lifetime values (see setValue/room-values.ts) don't
        // survive into the game — drop the whole lifetime and forget
        // whichever of them were GLOBAL.
        void clearValuesForLifetime('wait_room')
        for (const name of Object.keys(hostGlobalValues)) {
          if (hostGlobalValues[name] === 'wait_room') delete hostGlobalValues[name]
        }
        void saveGlobalValueNames(hostGlobalValues)
        peer.broadcast({ type: 'values-cleared', lifetime: 'wait_room' })

        // The actual game's grid is a wholly separate world from the
        // waiting room's — different colors, different objects, different
        // player positions. Reroll the same state the lobby used (rather
        // than keep it around under a second name) so the game starts
        // from a completely fresh layout.
        regenerateWorld()

        // Rolled once per game, same as the grid — everyone gets a fresh
        // identity here rather than one carried over from a previous
        // round (there isn't one anyway: returnToLobby clears it).
        // Sent individually, never broadcast: identities are secret.
        // Sandbox mode has no identities — myIdentity simply stays null
        // for everyone (see the matching checks in game-screen.tsx,
        // which must not block the grid on it, or show the Identité
        // button, in that case).
        if (hostSharedSettings.mode === 'framed') {
          hostIdentities = assignIdentities(Object.keys(hostPlayers), saboteurCountRef.current)
          void saveIdentities(hostIdentities)
          for (const [playerId, identity] of Object.entries(hostIdentities)) {
            if (playerId === localPlayerId) {
              setMyIdentity(identity)
            } else {
              peer.sendTo(playerId, { type: 'identity', identity })
            }
          }
        }

        peer.broadcast({ type: 'game-started' })
      }

      // Mirror image of startGame: rerolls a fresh lobby layout (same
      // reasoning as above — a clean reroll rather than trying to recall
      // whatever the lobby looked like before the game started, which
      // wasn't kept around) and sends everyone back to it.
      returnToLobbyRef.current = () => {
        if (!hostGameStarted) return
        // A running timer must never carry over into a new screen.
        stopTimerNow()
        hostGameStarted = false
        setGameStarted(false)
        void saveGameStarted(false)

        // Mirrors the WAIT_ROOM clear in startGame: GAME-lifetime values
        // don't survive back into the lobby.
        void clearValuesForLifetime('game')
        for (const name of Object.keys(hostGlobalValues)) {
          if (hostGlobalValues[name] === 'game') delete hostGlobalValues[name]
        }
        void saveGlobalValueNames(hostGlobalValues)
        peer.broadcast({ type: 'values-cleared', lifetime: 'game' })

        regenerateWorld()

        // Identities only make sense for the game currently ending; a
        // future startGame rolls fresh ones.
        hostIdentities = {}
        void saveIdentities({})
        setMyIdentity(null)

        peer.broadcast({ type: 'return-to-lobby' })
      }

      // Waiting-room only: rerolls colors/objects/special-cells and
      // respawns everyone at the center, without any of startGame's or
      // returnToLobby's extra bookkeeping (identities, value lifetimes,
      // game-started, timer). No-op once the game has actually started.
      regenerateGridRef.current = () => {
        if (hostGameStarted) return
        regenerateWorld()
      }

      setSharedSettingsRef.current = (settings) => {
        hostSharedSettings = settings
        void saveSharedSettings(settings)
        setSharedSettingsState(settings)
        peer.broadcast({ type: 'settings-sync', settings })
      }

      broadcastToastRef.current = (text, options) => {
        const targets = options?.playerIds && options.playerIds.length > 0 ? options.playerIds : undefined
        peer.broadcast(
          {
            type: 'toast',
            text,
            key: options?.key,
            colors: options?.colors,
            durationMs: encodeToastDurationForWire(options?.durationMs),
          },
          targets
        )
        // The host has no connection to itself: show locally when it's
        // one of the targets, or when broadcasting to everyone. Uses the
        // original options (real Infinity, not the wire sentinel) — this
        // never goes through serialization.
        if (!targets || targets.includes(localPlayerId)) {
          onToastRef.current(text, options)
        }
      }

      // The room's single countdown — only one at a time, see hostTimerEndAt.
      let hostTimerEndAt: number | null = null
      // Host-local only, never sent over the network — see startTimer.
      let hostTimerOnFinish: (() => void) | undefined

      function stopTimerNow() {
        if (hostTimerTimeout !== null) {
          window.clearTimeout(hostTimerTimeout)
          hostTimerTimeout = null
        }
        hostTimerEndAt = null
        hostTimerOnFinish = undefined
        setTimer({ enabled: false, endAt: null })
        peer.broadcast({ type: 'timer', enabled: false })
      }

      function finishTimer() {
        const onFinish = hostTimerOnFinish
        stopTimerNow()
        onFinish?.()
      }

      startTimerRef.current = (durationMs, onFinish) => {
        if (hostTimerTimeout !== null) window.clearTimeout(hostTimerTimeout)
        const endAt = Date.now() + durationMs
        hostTimerEndAt = endAt
        hostTimerOnFinish = onFinish
        setTimer({ enabled: true, endAt })
        peer.broadcast({ type: 'timer', enabled: true, endAt })
        hostTimerTimeout = window.setTimeout(finishTimer, durationMs)
      }

      stopTimerRef.current = stopTimerNow

      // An object's grid isn't stored on the object itself — only
      // implied by which key of hostGridObjects holds it — so this
      // parses it back out of the key (the same "x,y" shape gridKey
      // produces).
      function findObjectWithGrid(objectId: string): { object: GridObject; grid: GridCoord } | undefined {
        for (const [key, objects] of Object.entries(hostGridObjects)) {
          const object = Object.values(objects).find((o) => o.id === objectId)
          if (object) {
            const [x, y] = key.split(',').map(Number)
            return { object, grid: { x, y } }
          }
        }
        return undefined
      }

      // The arbitrary grid `objectId` owns (see WorldState.state, set via
      // ctx.createGrid's third argument), if any — the reverse of
      // findObjectWithGrid above. Used to detect whether a cell a push is
      // landing on holds a portal rather than an ordinary object.
      function findOwnedArbitraryGrid(objectId: string): GridCoord | undefined {
        for (const [key, world] of Object.entries(hostArbitraryGrids)) {
          if (world.state === objectId) {
            const [x, y] = key.split(',').map(Number)
            return { x, y }
          }
        }
        return undefined
      }

      async function invokeObjectAction(
        playerId: string,
        objectId: string,
        actionName: string,
        contextOverrides?: Partial<Omit<ObjectActionBuilderContext, 'objectId' | 'objectType'>>,
        triggerObject?: TriggerRef
      ) {
        // A cascading call (triggerObject set means another object's
        // action got us here, not a direct player press) yields back to
        // the browser first — otherwise a long or looping chain runs as
        // one uninterrupted synchronous burst and freezes the host's tab
        // (rendering, input, and incoming PeerJS messages all share this
        // same main thread). Circuit loops (e.g. a redstone inverter
        // feeding back into itself as a clock) are allowed to run
        // indefinitely — this yield is what keeps that from ever
        // blocking the tab, not a guard against it happening.
        if (triggerObject) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
        const found = findObjectWithGrid(objectId)
        if (!found) return // already pushed/gone — no-op
        const player = hostPlayers[playerId]
        const objectRef: ActionObjectRef = {
          objectId: found.object.id,
          objectType: found.object.type,
          position: found.object.position,
          grid: found.grid,
          variant: found.object.variant,
        }
        const ctx: ObjectActionInvocationContext = {
          object: objectRef,
          playerId,
          playerName: player?.username ?? '',
          players: hostPlayers,
          specialCells: hostSpecialCells,
          gridObjects: hostGridObjects,
          world: worldForGrid(found.grid),
          state: found.object.state,
          triggerObject,
          ...contextOverrides,
          actionName,
          // After the spread on purpose: contextOverrides is sometimes a
          // whole parent ctx (see the magnet forwarding its own), which
          // would otherwise carry that parent's signal in here. Every
          // invocation starts fresh at "notify nobody" and the action
          // opts in by assigning it.
          updateSignal: ActionUpdateSignal.NO_UPDATE,
          animate: false,
          broadcastToast: (text, options) => broadcastToastRef.current(text, options),
          moveSpecialCell: (fromGrid, from, toGrid, to, behavior, direction) =>
            applySpecialCellMove(playerId, fromGrid, from, toGrid, to, behavior, direction),
          stepInDirection: (grid, position, direction) => resolveSpecialCellStep(grid, position, direction),
          setObjectState: (objectId, state) => applyObjectState(objectId, state),
          createGrid: (size, color, state) => createArbitraryGrid(size, color, state),
          moveToGrid: (movedPlayerId, grid, spawnPosition, direction) =>
            movePlayerToGrid(movedPlayerId, grid, spawnPosition, direction),
          triggerObjectAction: (targetObjectId, targetActionName, overrides) =>
            invokeObjectAction(playerId, targetObjectId, targetActionName, overrides, objectRef),
        }
        const actions = await resolveObjectActions(found.object.type, ctx);
        const action = actions.find((a) => actionNames(a).includes(actionName));
        if (!action) return
        const { animate } = resolveActionNames(action).find((entry) => entry.name === actionName)!
        ctx.animate = animate === undefined ? false : animate;
        // Unconditional on the action's own effect — "animate" describes
        // the trigger, not the outcome, so even a wasted swing hops.
        try {
          await action.action(ctx)
        } catch (error) {
          console.error(`Object action "${actionName}" on "${found.object.type}" failed`, error)
        }
        if (ctx.animate) broadcastObjectJump(found.grid, found.object.id);
        // Read back off the context the action was handed: it assigns
        // ctx.updateSignal rather than returning one, so an action with
        // several early exits can set it once and plain-`return`. A throw
        // above leaves whatever it managed to set, which is the same
        // "whatever it did before failing still counts" behaviour the
        // state writes already have.
        const signal = ctx.updateSignal
        // UPDATE_NO_CYCLE skips notifying back toward whoever sent this
        // call in the first place (mirrors sourceDirection's redstone-echo
        // guard) — ALL_UPDATE notifies every neighbor, sender included.
        if (signal === ActionUpdateSignal.ALL_UPDATE || signal === ActionUpdateSignal.UPDATE_NO_CYCLE) {
          const excludePosition =
            signal === ActionUpdateSignal.UPDATE_NO_CYCLE && ctx.triggerObject && gridKey(ctx.triggerObject.grid) === gridKey(objectRef.grid)
              ? ctx.triggerObject.position
              : undefined
          notifyCellChanged(playerId, objectRef.grid, objectRef.position, excludePosition)
        }
      }

      triggerObjectActionRef.current = (objectId, actionName) => {
        void invokeObjectAction(localPlayerId, objectId, actionName)
      }

      placeItemRef.current = (position, item) => {
        placeInventoryItem(localPlayerId, position, item)
      }

      eraseCellRef.current = (position) => {
        eraseCellAt(localPlayerId, position)
      }

      resolveObjectActionNamesRef.current = async (objectId, objectType) => {
        const found = findObjectWithGrid(objectId)
        if (!found) return []
        const player = hostPlayers[localPlayerId]
        const ctx: ObjectActionBuilderContext = {
          object: {
            objectId,
            objectType,
            position: found.object.position,
            grid: found.grid,
            variant: found.object.variant,
          },
          playerId: localPlayerId,
          playerName: player?.username ?? '',
          players: hostPlayers,
          specialCells: hostSpecialCells,
          gridObjects: hostGridObjects,
          world: worldForGrid(found.grid),
          state: found.object.state,
        }
        return (await resolveObjectActions(objectType, ctx))
          .flatMap((a) => resolveActionNames(a))
          .filter((entry) => !entry.hidden)
          .map((entry) => ({ name: entry.name, color: entry.color }))
      }

      setValueRef.current = async (name, value, scope, lifetime) => {
        // Awaited so a caller's immediately following read (e.g. the next
        // step of a flow sequence) sees the new value, not the old one.
        await setStoredValue(name, value, lifetime)
        if (scope === 'global') {
          hostGlobalValues[name] = lifetime
          void saveGlobalValueNames(hostGlobalValues)
          peer.broadcast({ type: 'value-set', name, value, lifetime })
        }
      }

      updateAvatarRef.current = (blob) => {
        currentAvatarBlob = blob
        void idbSet(AVATAR_KEY, blob)
        applyAvatar(localPlayerId, blob)
        sendAvatar((message) => peer.broadcast(message), localPlayerId, blob)
      }

      leaveRoomRef.current = (onDone) => {
        peer.markClosed()
        peer.broadcast({ type: 'room-closed' })
        peer.shutdown(onDone)
      }
    } else {
      // Shows the cached layout from a previous session of this same room
      // right away (e.g. after a reload), instead of a blank world until
      // the host's one-time push (see the 'grid-colors' handler below)
      // arrives.
      void loadGridColors().then((stored) => {
        if (stored) setGridColors(stored)
      })
      void loadArbitraryGrids().then((stored) => {
        if (stored) setArbitraryGrids(stored)
      })
      void loadSharedSettings().then((stored) => {
        if (stored) setSharedSettingsState(stored)
      })
      // Player ids whose avatar arrived over the network this session: a
      // slower IndexedDB cache lookup must not overwrite a fresher network
      // copy.
      const receivedAvatarIds = new Set<string>()
      // Ids already looked up in the cache, so each player triggers at most
      // one IndexedDB read even though players-sync arrives often.
      const requestedCachedAvatarIds = new Set<string>()
      // Resolved by handleHostMessage's 'object-actions-response' case
      // once the host answers (see requestObjectActions below).
      const pendingActionRequests = new Map<string, (actions: ObjectActionDisplay[]) => void>()

      function generateRequestId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      }

      // A dynamic (builder-sourced) object's actions can only be
      // resolved host-side (see resolveObjectActionNamesRef below) — this
      // asks and awaits the response.
      function requestObjectActions(objectId: string): Promise<ObjectActionDisplay[]> {
        return new Promise((resolve) => {
          const requestId = generateRequestId()
          pendingActionRequests.set(requestId, resolve)
          if (!peer.sendToHost({ type: 'object-actions-request', objectId, requestId })) {
            pendingActionRequests.delete(requestId)
            resolve([]) // disconnected — don't hang forever
          }
        })
      }

      function handleHostMessage(message: RoomMessage) {
        if (message.type === 'players-sync') {
          setPlayers(message.players)
          setHostPlayerId(message.hostPlayerId)
          // After a reload the avatars of players met in a previous
          // session are already in IndexedDB: restore them right away
          // instead of waiting for the host's re-transmission.
          for (const playerId of Object.keys(message.players)) {
            if (playerId === localPlayerId || requestedCachedAvatarIds.has(playerId)) continue
            requestedCachedAvatarIds.add(playerId)
            void getCachedRemoteAvatar(playerId).then((blob) => {
              if (blob && !receivedAvatarIds.has(playerId)) applyAvatar(playerId, blob)
            })
          }
        } else if (message.type === 'grid-colors') {
          setGridColors(message.colors)
          void saveGridColors(message.colors)
        } else if (message.type === 'arbitrary-grids') {
          setArbitraryGrids(message.grids)
          void saveArbitraryGrids(message.grids)
        } else if (message.type === 'settings-sync') {
          setSharedSettingsState(message.settings)
          void saveSharedSettings(message.settings)
        } else if (message.type === 'grid-objects') {
          // Not persisted, per spec: only ever the current grid, resent
          // by the host on every reconnect/grid change anyway.
          setGridObjects(message.objects)
        } else if (message.type === 'special-cells') {
          // Same rationale as grid-objects: current grid only, resent on
          // every reconnect/grid change.
          setSpecialCells(message.cells)
        } else if (message.type === 'object-patch') {
          // Functional, not stylistic: one host-side cascade can land
          // several patches in a single React batch, and a plain
          // overwrite would keep only the last (the same trap that broke
          // objectJump). Upserting on a miss also makes a patch
          // self-healing if an add was somehow never seen.
          setGridObjects((current) => {
            const index = current.findIndex((object) => object.id === message.object.id)
            if (index === -1) return [...current, message.object]
            const next = [...current]
            next[index] = message.object
            return next
          })
        } else if (message.type === 'object-remove') {
          setGridObjects((current) => current.filter((object) => object.id !== message.objectId))
        } else if (message.type === 'special-cell-patch') {
          // Keyed by position — special cells carry no id.
          setSpecialCells((current) => {
            const index = current.findIndex(
              (cell) =>
                cell.position.x === message.cell.position.x && cell.position.y === message.cell.position.y
            )
            if (index === -1) return [...current, message.cell]
            const next = [...current]
            next[index] = message.cell
            return next
          })
        } else if (message.type === 'special-cell-remove') {
          setSpecialCells((current) =>
            current.filter(
              (cell) => !(cell.position.x === message.position.x && cell.position.y === message.position.y)
            )
          )
        } else if (message.type === 'special-cell-shake') {
          setSpecialCellShake({ grid: message.grid, position: message.position, direction: message.direction })
        } else if (message.type === 'object-jump') {
          // Accumulated per object, same reasoning as the host's own
          // broadcastObjectJump: several of these can arrive back to back
          // for one cell change, and a plain overwrite would drop all but
          // the last.
          setObjectJumps((current) => ({
            ...current,
            [message.objectId]: {
              grid: message.grid,
              count: (current[message.objectId]?.count ?? 0) + 1,
            },
          }))
        } else if (message.type === 'game-started') {
          setGameStarted(true)
        } else if (message.type === 'return-to-lobby') {
          setGameStarted(false)
          setMyIdentity(null)
        } else if (message.type === 'identity') {
          setMyIdentity(message.identity)
        } else if (message.type === 'avatar') {
          receivedAvatarIds.add(message.playerId)
          applyAvatar(message.playerId, message.image)
        } else if (message.type === 'toast') {
          onToastRef.current(message.text, {
            key: message.key,
            colors: message.colors,
            durationMs: decodeToastDurationFromWire(message.durationMs),
          })
        } else if (message.type === 'timer') {
          setTimer({ enabled: message.enabled, endAt: message.enabled ? (message.endAt ?? null) : null })
        } else if (message.type === 'value-set') {
          void setStoredValue(message.name, message.value, message.lifetime)
        } else if (message.type === 'values-cleared') {
          void clearValuesForLifetime(message.lifetime)
        } else if (message.type === 'room-closed') {
          peer.markClosed()
          onRoomClosedRef.current()
        } else if (message.type === 'object-actions-response') {
          const resolve = pendingActionRequests.get(message.requestId)
          if (resolve) {
            pendingActionRequests.delete(message.requestId)
            resolve(message.actions)
          }
        } else if (message.type === 'kicked') {
          peer.markClosed()
          onKickedRef.current()
        }
      }

      unsubscribe = peer.subscribe((event) => {
        if (event.type === 'host-open') {
          getLocalAvatarBlob().then((blob) => {
            if (!blob) return
            applyAvatar(localPlayerId, blob)
            sendAvatar((message) => peer.sendToHost(message), localPlayerId, blob)
          })
          localUsernamePromise.then((username) => {
            if (username) peer.sendToHost({ type: 'username', username })
          })
        } else if (event.type === 'host-message') {
          handleHostMessage(event.message as RoomMessage)
        } else if (event.type === 'host-close') {
          setPlayers({})
        }
      })

      movePlayerRef.current = (position) => {
        // Optimistic update: move locally right away instead of waiting
        // for the host's players-sync round trip — but only when the send
        // actually left (sendToHost is false while disconnected). If the
        // host later confirms the same position, the diff in GameGrid
        // sees no change and skips a duplicate jump animation; if it
        // rejects it (e.g. someone else took that cell first), the next
        // sync snaps the cube back.
        if (!peer.sendToHost({ type: 'move', position })) return
        setPlayers((current) => {
          const localPlayer = current[localPlayerId]
          if (!localPlayer) return current
          return { ...current, [localPlayerId]: { ...localPlayer, position } }
        })
      }

      moveToGridRef.current = (direction, objectId) => {
        // Not optimistic, unlike movePlayerRef above: which grid the
        // player lands on (and where within it) is decided by the host,
        // so wait for its players-sync instead of guessing locally.
        peer.sendToHost({ type: 'move-grid', direction, objectId })
      }

      teleportToPlayerRef.current = (targetPlayerId) => {
        // Not optimistic either, and for the same reason as moveToGrid
        // above: the destination cell is the host's own random pick out
        // of whatever's free, so there's nothing to guess locally.
        peer.sendToHost({ type: 'teleport-to-player', targetPlayerId })
      }

      kickPlayerRef.current = () => {}
      startGameRef.current = () => {}
      returnToLobbyRef.current = () => {}
      regenerateGridRef.current = () => {}
      setSharedSettingsRef.current = () => {}
      broadcastToastRef.current = () => {}
      startTimerRef.current = () => {}
      stopTimerRef.current = () => {}
      setValueRef.current = () => Promise.resolve()

      // Unlike the host-only no-ops above, a guest can press an object's
      // action button too — it just relays the press to the host instead
      // of running it, since only the host may actually execute one.
      triggerObjectActionRef.current = (objectId, actionName) => {
        peer.sendToHost({ type: 'object-action', objectId, actionName })
      }

      // Same idea for Sandbox mode's Inventaire tool — only the host may
      // actually place/erase, a guest just relays the request.
      placeItemRef.current = (position, item) => {
        peer.sendToHost({ type: 'place-item', position, item })
      }

      eraseCellRef.current = (position) => {
        peer.sendToHost({ type: 'erase-cell', position })
      }

      // Same idea for resolving what to display: a static array is
      // identical bundled data on every client, so read it directly; a
      // dynamic (builder) source can only be run by the host, so ask it.
      resolveObjectActionNamesRef.current = (objectId, objectType) => {
        const source = getObjectActionsSource(objectType)
        if (!source) return Promise.resolve([])
        if (Array.isArray(source)) {
          return Promise.resolve(
            source
              .flatMap((a) => resolveActionNames(a))
              .filter((entry) => !entry.hidden)
              .map((entry) => ({ name: entry.name, color: entry.color }))
          )
        }
        return requestObjectActions(objectId)
      }

      // Unlike the host-only no-ops above, a guest can update its own
      // avatar too — it just relays through the host instead of
      // broadcasting directly. The host's existing 'avatar' handling in
      // handleGuestMessage already caches, applies, and relays this to
      // every other guest regardless of when it arrives, so nothing on
      // the host side needs to change for this to reach everyone.
      updateAvatarRef.current = (blob) => {
        currentAvatarBlob = blob
        void idbSet(AVATAR_KEY, blob)
        applyAvatar(localPlayerId, blob)
        sendAvatar((message) => peer.sendToHost(message), localPlayerId, blob)
      }

      leaveRoomRef.current = (onDone) => {
        peer.markClosed()
        // Explicit leave (vs. a reload's silent close): tells the host to
        // drop the player id and its cached identity everywhere.
        peer.sendToHost({ type: 'leave' })
        peer.shutdown(onDone)
      }
    }

    return () => {
      unsubscribe()
      if (hostTimerTimeout !== null) window.clearTimeout(hostTimerTimeout)
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [peer])

  const movePlayer = React.useCallback((position: CellPosition) => {
    movePlayerRef.current(position)
  }, [])

  const teleportToPlayer = React.useCallback((targetPlayerId: string) => {
    teleportToPlayerRef.current(targetPlayerId)
  }, [])

  const moveToGrid = React.useCallback((direction: GridCoord, objectId?: string) => {
    moveToGridRef.current(direction, objectId)
  }, [])

  const kickPlayer = React.useCallback((playerId: string) => {
    kickPlayerRef.current(playerId)
  }, [])

  const startGame = React.useCallback(() => {
    startGameRef.current()
  }, [])

  const returnToLobby = React.useCallback(() => {
    returnToLobbyRef.current()
  }, [])

  const regenerateGrid = React.useCallback(() => {
    regenerateGridRef.current()
  }, [])

  const setSharedSettings = React.useCallback((settings: SharedSettings) => {
    setSharedSettingsRef.current(settings)
  }, [])

  const broadcastToast = React.useCallback((text: string, options?: BroadcastToastOptions) => {
    broadcastToastRef.current(text, options)
  }, [])

  const startTimer = React.useCallback((durationMs: number, onFinish?: () => void) => {
    startTimerRef.current(durationMs, onFinish)
  }, [])

  const stopTimer = React.useCallback(() => {
    stopTimerRef.current()
  }, [])

  const triggerObjectAction = React.useCallback((objectId: string, actionName: string) => {
    triggerObjectActionRef.current(objectId, actionName)
  }, [])

  const placeItem = React.useCallback((position: CellPosition, item: InventoryItem) => {
    placeItemRef.current(position, item)
  }, [])

  const eraseCell = React.useCallback((position: CellPosition) => {
    eraseCellRef.current(position)
  }, [])

  const resolveObjectActionNames = React.useCallback(
    (objectId: string, objectType: ObjectType) => resolveObjectActionNamesRef.current(objectId, objectType),
    []
  )

  const setValue = React.useCallback(
    (name: string, value: unknown, scope: ValueScope, lifetime: ValueLifetime) =>
      setValueRef.current(name, value, scope, lifetime),
    []
  )

  const getValue = React.useCallback(
    <T,>(name: string, defaultValue?: T) =>
      defaultValue === undefined ? getStoredValue<T>(name) : getStoredValue<T>(name, defaultValue),
    []
  )

  const getCurrentLifetime = React.useCallback(
    (): Extract<ValueLifetime, 'wait_room' | 'game'> => (gameStarted ? 'game' : 'wait_room'),
    [gameStarted]
  )

  const updateAvatar = React.useCallback((blob: Blob) => {
    updateAvatarRef.current(blob)
  }, [])

  const leaveRoom = React.useCallback((onDone: () => void) => {
    leaveRoomRef.current(onDone)
  }, [])

  const startAction = React.useCallback((instance: ActionInstance) => {
    startActionRef.current(instance)
  }, [])

  const verifyAction = React.useCallback(
    (instance: ActionInstance) => Promise.resolve(verifyActionRef.current(instance)),
    []
  )

  // Resolved fresh every render: the local player may be on an arbitrary
  // grid (see ARBITRARY_GRID_X/isArbitraryGrid in world.ts), whose own
  // dimensions live in arbitraryGrids rather than the shared matrix's.
  const localPlayerForWorld = players[peer.localPlayerId]
  const localGridForWorld: GridCoord | null = localPlayerForWorld
    ? { x: localPlayerForWorld.gridX, y: localPlayerForWorld.gridY }
    : null
  const matrixWorld = gameStarted
    ? applyGameMode(sharedSettingsWorld(sharedSettings), sharedSettings.mode)
    : props.lobbyWorld
  const resolvedWorld =
    localGridForWorld && isArbitraryGrid(localGridForWorld)
      ? (arbitraryGrids[gridKey(localGridForWorld)] ?? matrixWorld)
      : matrixWorld

  const value: GameWorldValue = {
    players,
    localPlayerId: peer.localPlayerId,
    hostPlayerId,
    avatarUrls,
    world: resolvedWorld,
    gridColors,
    sharedSettings,
    setSharedSettings,
    gridObjects,
    specialCells,
    specialCellShake,
    objectJumps,
    gameStarted,
    myIdentity,
    moveMissCount,
    movePlayer,
    moveToGrid,
    teleportToPlayer,
    kickPlayer,
    startGame,
    returnToLobby,
    regenerateGrid,
    broadcastToast,
    timer,
    startTimer,
    stopTimer,
    triggerObjectAction,
    placeItem,
    eraseCell,
    resolveObjectActionNames,
    setValue,
    getValue,
    getCurrentLifetime,
    updateAvatar,
    leaveRoom,
    startAction,
    verifyAction,
    actionsContext: actionsContextRef.current,
  }

  return <GameWorldContext.Provider value={value}>{props.children}</GameWorldContext.Provider>
}

function useGameWorld(): GameWorldValue {
  const context = React.useContext(GameWorldContext)
  if (!context) {
    throw new Error('useGameWorld must be used within a GameWorldProvider')
  }
  return context
}

export { GameWorldProvider, useGameWorld }
