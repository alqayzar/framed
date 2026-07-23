import * as React from 'react'

import { useRoomPeer } from '@/hooks/use-room-peer'
import { type CubeColor, randomCubeColor } from '@/lib/cube-colors'
import { mergeAbortSignals, resolveTemplate, type Flow, type FlowContext } from '@/lib/flows'
import { generateWorldObjects, type GridObject, type GridObjectsState } from '@/lib/game-objects'
import { assignIdentities, type PlayerIdentity } from '@/lib/identities'
import { idbGet, idbSet } from '@/lib/idb-store'
import { AVATAR_KEY, USERNAME_KEY } from '@/lib/profile-store'
import { cacheRemoteAvatar, getCachedRemoteAvatar } from '@/lib/remote-avatar-store'
import {
  loadGameStarted,
  loadGlobalValueNames,
  loadGridColors,
  loadGridHiddenPlayers,
  loadGridObjects,
  loadIdentities,
  loadRoomPlayers,
  saveGameStarted,
  saveGlobalValueNames,
  saveGridColors,
  saveGridHiddenPlayers,
  saveGridObjects,
  saveIdentities,
  saveRoomPlayers,
} from '@/lib/room-store'
import {
  clearValuesForLifetime,
  getStoredValue,
  setStoredValue,
  type ValueLifetime,
  type ValueScope,
} from '@/lib/room-values'
import {
  boardEdgeDirections,
  type CellPosition,
  centerGridCoord,
  generateGridColors,
  type GridColors,
  type GridCoord,
  gridEntryPosition,
  gridKey,
  isAdjacent,
  isCellOccupiedByAnotherPlayer,
  isCellVisible,
  isGridInWorld,
  randomFreeBoardCell,
  type WorldState,
} from '@/lib/world'
import type { ToastColors } from '@/hooks/use-toast'

// Game layer: everything about the world and what lives in it — player
// positions, grid colors, objects, collisions, pushes, the lobby→game
// transition — implemented as the host-authoritative protocol spoken over
// the transport layer (see use-room-peer.tsx). This file owns what the
// messages mean; the peer layer owns how they travel.

export interface PlayerState {
  position: CellPosition
  // Which grid of the world the player stands on (see GridCoord in
  // world.ts). Everyone spawns on the world's center grid, then moves
  // between grids by crossing a board edge (see moveToGrid).
  gridX: number
  gridY: number
  color: CubeColor
  username: string
}

export type PlayersState = Record<string, PlayerState>

interface SerializedAvatar {
  type: 'blob'
  mimeType: string
  data: ArrayBuffer | ArrayBufferLike
}

type RoomMessage =
  | { type: 'players-sync'; players: PlayersState; hostPlayerId: string }
  | { type: 'grid-colors'; colors: GridColors }
  | { type: 'grid-objects'; grid: GridCoord; objects: GridObject[] }
  | { type: 'move'; position: CellPosition }
  | { type: 'move-grid'; direction: GridCoord }
  | { type: 'game-started' }
  | { type: 'return-to-lobby' }
  | { type: 'identity'; identity: PlayerIdentity }
  | { type: 'grid-visible'; visible: boolean }
  | { type: 'avatar'; playerId: string; image: Blob | SerializedAvatar }
  | { type: 'username'; username: string }
  | { type: 'toast'; text: string; colors?: ToastColors }
  | { type: 'ping'; template: string; colors?: ToastColors }
  | { type: 'value-set'; name: string; value: unknown; lifetime: ValueLifetime }
  | { type: 'values-cleared'; lifetime: Extract<ValueLifetime, 'wait_room' | 'game'> }
  | { type: 'leave' }
  | { type: 'room-closed' }
  | { type: 'kicked' }

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
  // the game has started, gameWorld after (see gameStarted) — the exact
  // same one used to generate/validate everything below, echoed back so
  // callers don't need to re-derive their own to size a GameGrid
  // consistently with it.
  world: WorldState
  // Per-grid color layout of the world, rolled once at the start of the
  // game (see generateGridColors in world.ts). Empty until the host has
  // generated/restored it (host) or received it from the host (guest).
  gridColors: GridColors
  // Objects of the grid currently displayed only — never the whole
  // world (see generateWorldObjects in game-objects.ts). The host keeps
  // the full world in memory and derives this slice locally; a guest
  // only ever receives this same slice over the network and never
  // persists it (see the 'grid-objects' message).
  gridObjects: GridObject[]
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
  // Whether this player's whole grid container is currently shown —
  // flipped by the setGridVisible flow (see flows.ts), reset to true on
  // every lobby/game transition.
  gridVisible: boolean
  moveMissCount: number
  movePlayer: (position: CellPosition) => void
  moveToGrid: (direction: GridCoord) => void
  kickPlayer: (playerId: string) => void
  // Host only: moves the whole room from the waiting room into the game
  // (guests get a no-op).
  startGame: () => void
  // Host only: moves the whole room back from the game into the waiting
  // room — the mirror image of startGame (guests get a no-op; they React
  // to the 'return-to-lobby' broadcast instead).
  returnToLobby: () => void
  // Host only: runs a gameplay flow (see flows.ts) against this room,
  // resolving once it's done (guests get a no-op — flows are
  // host-authoritative like every other state change). Awaitable so a
  // self-looping flow driver (see runFlowLoop/beginGameFlow) can wait for
  // one iteration to finish before deciding whether to start the next.
  // The optional signal is merged with the phase-scoped one this hook
  // already applies (see mergeAbortSignals in flows.ts) — pass one from
  // the calling effect's own AbortController so a flow started by a
  // mount that gets torn down right away (e.g. StrictMode's dev
  // double-invoke) doesn't keep running to completion alongside the real
  // one.
  executeFlow: (flow: Flow, signal?: AbortSignal) => Promise<void>
  // Host only: shows an arbitrary message in everyone's toast, or only in
  // the toast of the given player ids when that list is non-empty (guests
  // get a no-op).
  broadcastToast: (playerIds: string[] | null | undefined, text: string, colors?: ToastColors) => void
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
}

interface GameWorldProviderProps {
  // The lobby and the actual game are two separate worlds (different
  // colors, objects, player positions — see startGameRef below): which
  // WorldState is authoritative switches from lobbyWorld to gameWorld the
  // moment the host starts the game, and every generation/collision
  // function in this file reads whichever is current at the time.
  lobbyWorld: WorldState
  gameWorld: WorldState
  // How many players get the Saboteur identity when the game starts (see
  // assignIdentities in identities.ts) — clamped there against however
  // many players actually exist at that moment.
  saboteurCount: number
  onRoomClosed: () => void
  onKicked: () => void
  onToast: (text: string, colors?: ToastColors) => void
  children: React.ReactNode
}

const GameWorldContext = React.createContext<GameWorldValue | null>(null)

function GameWorldProvider(props: GameWorldProviderProps) {
  const peer = useRoomPeer()
  const [players, setPlayers] = React.useState<PlayersState>({})
  const [hostPlayerId, setHostPlayerId] = React.useState<string | null>(null)
  const [avatarUrls, setAvatarUrls] = React.useState<Record<string, string>>({})
  const [gridColors, setGridColors] = React.useState<GridColors>({})
  const [gridObjects, setGridObjects] = React.useState<GridObject[]>([])
  const [gameStarted, setGameStarted] = React.useState(false)
  const [myIdentity, setMyIdentity] = React.useState<PlayerIdentity | null>(null)
  const [gridVisible, setGridVisible] = React.useState(true)
  const [moveMissCount, setMoveMissCount] = React.useState(0)
  // Refs so a board-settings change doesn't re-run the game effect (whose
  // teardown would drop all in-memory room state).
  const lobbyWorldRef = React.useRef(props.lobbyWorld)
  lobbyWorldRef.current = props.lobbyWorld
  const gameWorldRef = React.useRef(props.gameWorld)
  gameWorldRef.current = props.gameWorld
  const saboteurCountRef = React.useRef(props.saboteurCount)
  saboteurCountRef.current = props.saboteurCount
  const leaveRoomRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())
  const movePlayerRef = React.useRef<(position: CellPosition) => void>(() => {})
  const moveToGridRef = React.useRef<(direction: GridCoord) => void>(() => {})
  const kickPlayerRef = React.useRef<(playerId: string) => void>(() => {})
  const startGameRef = React.useRef<() => void>(() => {})
  const returnToLobbyRef = React.useRef<() => void>(() => {})
  const executeFlowRef = React.useRef<(flow: Flow, signal?: AbortSignal) => Promise<void>>(() =>
    Promise.resolve()
  )
  const broadcastToastRef = React.useRef<
    (playerIds: string[] | null | undefined, text: string, colors?: ToastColors) => void
  >(() => {})
  const setValueRef = React.useRef<
    (name: string, value: unknown, scope: ValueScope, lifetime: ValueLifetime) => Promise<void>
  >(() => Promise.resolve())
  const updateAvatarRef = React.useRef<(blob: Blob) => void>(() => {})
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
    setGridObjects([])
    setGameStarted(false)
    setMyIdentity(null)
    setGridVisible(true)
    setMoveMissCount(0)
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

    if (peer.role === 'host') {
      // Only ever flips true, never back — no need to reconcile with a
      // remote value like gridColors/gridObjects, just restore it once.
      // Declared first: currentWorld() (used by everything below to
      // generate/validate the world) depends on it to know whether the
      // lobby's or the actual game's WorldState is authoritative right
      // now (see startGameRef further down, where it flips to true).
      let hostGameStarted = false
      // Aborted and replaced on every lobby/game transition (see
      // startGameRef/returnToLobbyRef) so a flow started in one phase
      // (see executeFlowRef further down) can't keep firing into the
      // next — read at the moment executeFlow is actually called, since
      // it's a `let` reassigned by those two refs.
      let flowAbortController = new AbortController()
      function currentWorld(): WorldState {
        return hostGameStarted ? gameWorldRef.current : lobbyWorldRef.current
      }
      // Who's Saboteur/Innocent (see identities.ts) — only ever populated
      // while a game is running; cleared on returnToLobby. Kept in memory
      // only, never broadcast as a whole: each player only ever learns
      // its own identity (see the 'identity' message).
      let hostIdentities: Record<string, PlayerIdentity> = {}
      // Players whose grid container is hidden right now (see the
      // setGridVisible flow in flows.ts) — same shape as identities:
      // per-player, sent individually, restored from a previous session
      // of this same room on reload.
      const hostGridHiddenPlayers = new Set<string>()
      void loadGridHiddenPlayers().then((stored) => {
        if (!stored) return
        for (const playerId of stored) {
          hostGridHiddenPlayers.add(playerId)
          if (playerId === localPlayerId) {
            setGridVisible(false)
          } else if (peer.isConnected(playerId)) {
            // Covers the connect-before-load race, like grid colors: a
            // guest that connected before this resolved was told nothing.
            peer.sendTo(playerId, { type: 'grid-visible', visible: false })
          }
        }
      })
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
      void loadGridColors().then((stored) => {
        if (stored) {
          hostGridColors = stored
        } else {
          hostGridColors = generateGridColors(currentWorld())
          void saveGridColors(hostGridColors)
        }
        setGridColors(hostGridColors)
        // Covers the rare race where a guest's connection already opened
        // (and got sent the still-empty hostGridColors) before this
        // resolved.
        peer.broadcast({ type: 'grid-colors', colors: hostGridColors })
      })
      // Same idea as hostGridColors, but per-cell objects instead of a
      // per-grid color: rolled once, restored from a previous session of
      // this same game if there is one.
      let hostGridObjects: GridObjectsState = {}
      void loadGridObjects().then((stored) => {
        if (stored) {
          hostGridObjects = stored
        } else {
          hostGridObjects = generateWorldObjects(currentWorld())
          void saveGridObjects(hostGridObjects)
        }
        // Any player's position below (the host's own initial spawn, or
        // a reload's restored one via loadRoomPlayers) may have been
        // computed before hostGridObjects was known, when
        // objectPositionsOn returned nothing — relocate anyone who ended
        // up colliding with a real object now that we actually know
        // where they are.
        let relocatedAnyone = false
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          const grid: GridCoord = { x: player.gridX, y: player.gridY }
          const collidesWithObject = objectPositionsOn(grid).some(
            (position) => position.x === player.position.x && position.y === player.position.y
          )
          if (!collidesWithObject) continue
          hostPlayers[playerId] = {
            ...player,
            position: randomFreeBoardCell(hostPlayers, grid, currentWorld(), objectPositionsOn(grid)),
          }
          relocatedAnyone = true
        }
        if (relocatedAnyone) syncPlayers()
        refreshLocalGridObjects()
        // Covers the same connect-before-load race as grid colors above,
        // but per player since each one only ever gets its own grid
        // (sendTo no-ops for the host's own id and disconnected players).
        Object.keys(hostPlayers).forEach((playerId) => sendGridObjectsTo(playerId))
      })
      const spawnGrid = centerGridCoord(currentWorld())
      const hostPlayers: PlayersState = {
        [localPlayerId]: {
          position: randomFreeBoardCell({}, spawnGrid, currentWorld(), objectPositionsOn(spawnGrid)),
          gridX: spawnGrid.x,
          gridY: spawnGrid.y,
          color: randomCubeColor(),
          username: '',
        },
      }
      // Identity memory: the state of a disconnected player is kept here
      // (keyed by stable player id) so a guest that reloads the page gets
      // back its position, color and username. Entries only disappear on
      // an explicit leave or kick.
      const knownPlayers = new Map<string, PlayerState>()
      const remoteAvatarBlobs = new Map<string, Blob | SerializedAvatar>()
      setHostPlayerId(localPlayerId)
      setPlayers({ ...hostPlayers })
      // Restore the previous session's room state (host reload): the
      // host's own position/color come back right away, the other
      // players' identities are queued in knownPlayers until they
      // reconnect with their stable player id.
      void loadRoomPlayers().then((stored) => {
        if (!stored) return
        const defaultSpawnGrid = centerGridCoord(currentWorld())
        for (const [playerId, storedState] of Object.entries(stored)) {
          // Snapshots written before the world/grids feature have no
          // gridX/gridY: default them to the spawn grid.
          const state: PlayerState = {
            ...storedState,
            gridX: storedState.gridX ?? defaultSpawnGrid.x,
            gridY: storedState.gridY ?? defaultSpawnGrid.y,
          }
          if (playerId === localPlayerId) {
            // Mirrors how a reconnecting guest is restored below: land
            // back on the same grid it was on, falling back to a random
            // free cell of that grid (not a different one) if its exact
            // spot got taken while it was away — by another player, or
            // now by an object.
            const targetGrid: GridCoord = { x: state.gridX, y: state.gridY }
            const canRestorePosition =
              !isCellOccupiedByAnotherPlayer(state.position, targetGrid, hostPlayers, localPlayerId) &&
              !objectPositionsOn(targetGrid).some(
                (position) => position.x === state.position.x && position.y === state.position.y
              )
            hostPlayers[localPlayerId] = {
              ...hostPlayers[localPlayerId],
              position: canRestorePosition
                ? state.position
                : randomFreeBoardCell(hostPlayers, targetGrid, currentWorld(), objectPositionsOn(targetGrid)),
              gridX: targetGrid.x,
              gridY: targetGrid.y,
              color: state.color,
            }
          } else if (!(playerId in hostPlayers) && !knownPlayers.has(playerId)) {
            knownPlayers.set(playerId, state)
          }
        }
        syncPlayers()
        // In case this resolves after the grid-objects load above: keep
        // the displayed slice in sync with whichever grid the host's own
        // position was just restored to.
        refreshLocalGridObjects()
      })
      getLocalAvatarBlob().then((blob) => {
        if (blob) applyAvatar(localPlayerId, blob)
      })
      localUsernamePromise.then((username) => {
        if (!username) return
        hostPlayers[localPlayerId] = { ...hostPlayers[localPlayerId], username }
        syncPlayers()
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
        return (hostGridObjects[gridKey(grid)] ?? []).map((object) => object.position)
      }

      // Refreshes the host's own displayed slice of hostGridObjects to
      // match whichever grid it's currently standing on.
      function refreshLocalGridObjects() {
        const current = hostPlayers[localPlayerId]
        if (!current) return
        setGridObjects(hostGridObjects[gridKey({ x: current.gridX, y: current.gridY })] ?? [])
      }

      // A player only ever receives its own current grid's objects, never
      // the rest of the world (see the 'grid-objects' message).
      function sendGridObjectsTo(playerId: string) {
        const player = hostPlayers[playerId]
        if (!player) return
        const grid: GridCoord = { x: player.gridX, y: player.gridY }
        peer.sendTo(playerId, { type: 'grid-objects', grid, objects: hostGridObjects[gridKey(grid)] ?? [] })
      }

      // Resends a grid's objects to everyone currently standing on it
      // (and refreshes the host's own slice), after a push has changed
      // that grid's layout.
      function broadcastGridObjects(grid: GridCoord) {
        refreshLocalGridObjects()
        for (const [playerId, player] of Object.entries(hostPlayers)) {
          if (player.gridX !== grid.x || player.gridY !== grid.y) continue
          sendGridObjectsTo(playerId)
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
      // cancelled — only when the primary direction and every remaining
      // neighbor are all blocked.
      function pushObjectIfPresent(
        grid: GridCoord,
        targetPosition: CellPosition,
        direction: GridCoord,
        movingPlayerId: string
      ): boolean {
        const key = gridKey(grid)
        const objects = hostGridObjects[key] ?? []
        const objectIndex = objects.findIndex(
          (object) => object.position.x === targetPosition.x && object.position.y === targetPosition.y
        )
        if (objectIndex === -1) return true
        const object = objects[objectIndex]

        type PushTarget =
          | { crossesGrid: false; candidate: CellPosition }
          | { crossesGrid: true; destGrid: GridCoord; entryPosition: CellPosition }

        const edgeDirections = boardEdgeDirections(targetPosition, currentWorld())

        // Whether pushing the object one cell in direction d is possible,
        // without committing anything yet — so candidates can be
        // evaluated (and, for the fallback ones, randomly picked among)
        // before any of them actually mutates hostGridObjects.
        function evaluate(d: GridCoord): PushTarget | null {
          const crossesToNeighborGrid = edgeDirections.some((edge) => edge.x === d.x && edge.y === d.y)
          if (crossesToNeighborGrid) {
            const destGrid: GridCoord = { x: grid.x + d.x, y: grid.y + d.y }
            if (!isGridInWorld(destGrid, currentWorld())) return null // world edge: a wall
            const entryPosition = gridEntryPosition(targetPosition, d, currentWorld())
            const destObjects = hostGridObjects[gridKey(destGrid)] ?? []
            if (destObjects.some((o) => o.position.x === entryPosition.x && o.position.y === entryPosition.y)) {
              return null
            }
            if (isCellOccupiedByAnotherPlayer(entryPosition, destGrid, hostPlayers, movingPlayerId)) return null
            return { crossesGrid: true, destGrid, entryPosition }
          }
          const candidate: CellPosition = { x: targetPosition.x + d.x, y: targetPosition.y + d.y }
          if (!isCellVisible(candidate, currentWorld())) return null
          if (
            objects.some(
              (o, index) => index !== objectIndex && o.position.x === candidate.x && o.position.y === candidate.y
            )
          ) {
            return null
          }
          if (isCellOccupiedByAnotherPlayer(candidate, grid, hostPlayers, movingPlayerId)) return null
          return { crossesGrid: false, candidate }
        }

        function commit(target: PushTarget) {
          if (target.crossesGrid) {
            const destKey = gridKey(target.destGrid)
            const destObjects = hostGridObjects[destKey] ?? []
            hostGridObjects = {
              ...hostGridObjects,
              [key]: objects.filter((_, index) => index !== objectIndex),
              [destKey]: [...destObjects, { ...object, position: target.entryPosition }],
            }
            void saveGridObjects(hostGridObjects)
            broadcastGridObjects(target.destGrid)
          } else {
            const nextObjects = [...objects]
            nextObjects[objectIndex] = { ...nextObjects[objectIndex], position: target.candidate }
            hostGridObjects = { ...hostGridObjects, [key]: nextObjects }
            void saveGridObjects(hostGridObjects)
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

      // Crossing a board edge into the neighboring grid: rejects unless
      // the player is actually standing on an edge cell bordering that
      // direction (mirrors the enabled/disabled marker in GameGrid), the
      // destination grid exists in the world, and its mirrored entry
      // point isn't already occupied by another player there. If an
      // object sits on that entry cell, it gets pushed exactly like a
      // same-grid move (see pushObjectIfPresent) — same direction, same
      // fallback neighbors, same cross-grid cascading — and the crossing
      // is rejected too when the object can't be displaced anywhere.
      function attemptMoveToGrid(playerId: string, direction: GridCoord): boolean {
        const current = hostPlayers[playerId]
        if (!current) return false
        const validDirections = boardEdgeDirections(current.position, currentWorld())
        if (!validDirections.some((d) => d.x === direction.x && d.y === direction.y)) return false
        const targetGrid: GridCoord = { x: current.gridX + direction.x, y: current.gridY + direction.y }
        if (!isGridInWorld(targetGrid, currentWorld())) return false
        const entryPosition = gridEntryPosition(current.position, direction, currentWorld())
        if (isCellOccupiedByAnotherPlayer(entryPosition, targetGrid, hostPlayers, playerId)) return false
        if (!pushObjectIfPresent(targetGrid, entryPosition, direction, playerId)) return false
        hostPlayers[playerId] = {
          ...current,
          gridX: targetGrid.x,
          gridY: targetGrid.y,
          position: entryPosition,
        }
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
          !objectPositionsOn(targetGrid).some(
            (position) => position.x === known.position.x && position.y === known.position.y
          )
        hostPlayers[playerId] = {
          position: canRestorePosition
            ? known.position
            : randomFreeBoardCell(hostPlayers, targetGrid, currentWorld(), objectPositionsOn(targetGrid)),
          gridX: targetGrid.x,
          gridY: targetGrid.y,
          color: known?.color ?? randomCubeColor(),
          username: known?.username ?? '',
        }
        syncPlayers()
        // Sent once per connection, like the avatar below: the guest
        // caches it (see room-store.ts) instead of needing it resent.
        peer.sendTo(playerId, { type: 'grid-colors', colors: hostGridColors })
        // Unlike grid colors, only this guest's current grid — resent
        // whenever it changes grid (see the 'move-grid' handler below).
        sendGridObjectsTo(playerId)
        // Only sent if true: a guest connecting/reconnecting while the
        // game is already running needs to know right away instead of
        // showing the waiting room.
        if (hostGameStarted) peer.sendTo(playerId, { type: 'game-started' })
        // A reconnecting guest needs its identity resent — it never
        // persists it client-side (see the 'identity' handler below), so
        // a reload would otherwise leave it stuck waiting for one.
        const knownIdentity = hostIdentities[playerId]
        if (knownIdentity) peer.sendTo(playerId, { type: 'identity', identity: knownIdentity })
        // Same for a hidden grid: client-side it's plain state, so only
        // this resend keeps the effect applied across its reload.
        if (hostGridHiddenPlayers.has(playerId)) {
          peer.sendTo(playerId, { type: 'grid-visible', visible: false })
        }
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
          syncPlayers()
          broadcastGridObjects(grid)
        } else if (message.type === 'move-grid') {
          if (!attemptMoveToGrid(playerId, message.direction)) {
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

      unsubscribe = peer.subscribe((event) => {
        if (event.type === 'guest-open') {
          handleGuestOpen(event.playerId)
        } else if (event.type === 'guest-message') {
          handleGuestMessage(event.playerId, event.message as RoomMessage)
        } else if (event.type === 'guest-close') {
          handleGuestClose(event.playerId)
        }
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
        syncPlayers()
        broadcastGridObjects(grid)
      }

      moveToGridRef.current = (direction) => {
        if (!attemptMoveToGrid(localPlayerId, direction)) return
        // attemptMoveToGrid already refreshed the local slice (via
        // broadcastGridObjects) for whichever grid this landed on.
        syncPlayers()
      }

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
        hostGameStarted = true
        // Aborts any flow still running from the lobby (see
        // executeFlowRef below) and gives the game phase a fresh signal.
        flowAbortController.abort()
        flowAbortController = new AbortController()
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
        hostGridColors = generateGridColors(currentWorld())
        void saveGridColors(hostGridColors)
        setGridColors(hostGridColors)
        hostGridObjects = generateWorldObjects(currentWorld())
        void saveGridObjects(hostGridObjects)

        const gameSpawnGrid = centerGridCoord(currentWorld())
        for (const playerId of Object.keys(hostPlayers)) {
          hostPlayers[playerId] = {
            ...hostPlayers[playerId],
            position: randomFreeBoardCell(
              hostPlayers,
              gameSpawnGrid,
              currentWorld(),
              objectPositionsOn(gameSpawnGrid)
            ),
            gridX: gameSpawnGrid.x,
            gridY: gameSpawnGrid.y,
          }
        }

        syncPlayers()
        refreshLocalGridObjects()
        peer.broadcast({ type: 'grid-colors', colors: hostGridColors })
        Object.keys(hostPlayers).forEach((playerId) => sendGridObjectsTo(playerId))

        // Rolled once per game, same as the grid — everyone gets a fresh
        // identity here rather than one carried over from a previous
        // round (there isn't one anyway: returnToLobby clears it).
        // Sent individually, never broadcast: identities are secret.
        hostIdentities = assignIdentities(Object.keys(hostPlayers), saboteurCountRef.current)
        void saveIdentities(hostIdentities)
        for (const [playerId, identity] of Object.entries(hostIdentities)) {
          if (playerId === localPlayerId) {
            setMyIdentity(identity)
          } else {
            peer.sendTo(playerId, { type: 'identity', identity })
          }
        }

        // Flow effects don't outlive the screen they were applied on:
        // everyone starts the game with a visible grid (guests reset
        // themselves on receiving 'game-started').
        hostGridHiddenPlayers.clear()
        void saveGridHiddenPlayers([])
        setGridVisible(true)

        peer.broadcast({ type: 'game-started' })
      }

      // Mirror image of startGame: rerolls a fresh lobby layout (same
      // reasoning as above — a clean reroll rather than trying to recall
      // whatever the lobby looked like before the game started, which
      // wasn't kept around) and sends everyone back to it.
      returnToLobbyRef.current = () => {
        if (!hostGameStarted) return
        hostGameStarted = false
        // Mirrors startGame: aborts any flow still running from the game
        // and gives the lobby phase a fresh signal.
        flowAbortController.abort()
        flowAbortController = new AbortController()
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

        hostGridColors = generateGridColors(currentWorld())
        void saveGridColors(hostGridColors)
        setGridColors(hostGridColors)
        hostGridObjects = generateWorldObjects(currentWorld())
        void saveGridObjects(hostGridObjects)

        const lobbySpawnGrid = centerGridCoord(currentWorld())
        for (const playerId of Object.keys(hostPlayers)) {
          hostPlayers[playerId] = {
            ...hostPlayers[playerId],
            position: randomFreeBoardCell(
              hostPlayers,
              lobbySpawnGrid,
              currentWorld(),
              objectPositionsOn(lobbySpawnGrid)
            ),
            gridX: lobbySpawnGrid.x,
            gridY: lobbySpawnGrid.y,
          }
        }

        syncPlayers()
        refreshLocalGridObjects()
        peer.broadcast({ type: 'grid-colors', colors: hostGridColors })
        Object.keys(hostPlayers).forEach((playerId) => sendGridObjectsTo(playerId))

        // Identities only make sense for the game currently ending; a
        // future startGame rolls fresh ones.
        hostIdentities = {}
        void saveIdentities({})
        setMyIdentity(null)

        // Same for flow effects: back in the lobby, every grid shows
        // again (guests reset themselves on receiving 'return-to-lobby').
        hostGridHiddenPlayers.clear()
        void saveGridHiddenPlayers([])
        setGridVisible(true)

        peer.broadcast({ type: 'return-to-lobby' })
      }

      broadcastToastRef.current = (playerIds, text, colors) => {
        const targets = playerIds && playerIds.length > 0 ? playerIds : undefined
        peer.broadcast({ type: 'toast', text, colors }, targets)
        // The host has no connection to itself: show locally when it's
        // one of the targets, or when broadcasting to everyone.
        if (!targets || targets.includes(localPlayerId)) {
          onToastRef.current(text, colors)
        }
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

      // The action primitives flows are written against (see flows.ts):
      // one implementation each, living here so flows themselves never
      // touch the host state directly.
      const flowContext: FlowContext = {
        setGridVisible: (playerIds, visible) => {
          for (const playerId of playerIds) {
            if (visible) {
              hostGridHiddenPlayers.delete(playerId)
            } else {
              hostGridHiddenPlayers.add(playerId)
            }
            if (playerId === localPlayerId) {
              setGridVisible(visible)
            } else {
              peer.sendTo(playerId, { type: 'grid-visible', visible })
            }
          }
          void saveGridHiddenPlayers([...hostGridHiddenPlayers])
        },
        showToast: (playerIds, text, colors) => {
          broadcastToastRef.current(playerIds, text, colors)
        },
        getValue: <T,>(name: string, defaultValue?: T) =>
          defaultValue === undefined ? getStoredValue<T>(name) : getStoredValue<T>(name, defaultValue),
        setValue: (name, value, scope, lifetime) => setValueRef.current(name, value, scope, lifetime),
        ping: (playerIds, template, colors) => {
          // The template travels unresolved (mirroring broadcastToast's
          // targeting): each target — the host included, below — resolves
          // the {name} placeholders against its own local store.
          const targets = playerIds && playerIds.length > 0 ? playerIds : undefined
          peer.broadcast({ type: 'ping', template, colors }, targets)
          if (!targets || targets.includes(localPlayerId)) {
            void resolveTemplate(template, (name) => getStoredValue(name), {
              playerName: hostPlayers[localPlayerId]?.username ?? '',
            }).then((text) => {
              onToastRef.current(text, colors)
            })
          }
        },
      }

      executeFlowRef.current = (flow, callerSignal) =>
        Promise.resolve(
          flow(
            flowContext,
            callerSignal ? mergeAbortSignals(flowAbortController.signal, callerSignal) : flowAbortController.signal
          )
        )

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
      // Player ids whose avatar arrived over the network this session: a
      // slower IndexedDB cache lookup must not overwrite a fresher network
      // copy.
      const receivedAvatarIds = new Set<string>()
      // Ids already looked up in the cache, so each player triggers at most
      // one IndexedDB read even though players-sync arrives often.
      const requestedCachedAvatarIds = new Set<string>()
      // This player's own username, kept in sync with players-sync — the
      // guest branch has no plain-object mirror of players like the
      // host's hostPlayers, so the 'ping' handler below needs somewhere
      // synchronous to read it from for {{playerName}} (see
      // resolveTemplate in flows.ts).
      let localUsername = ''

      function handleHostMessage(message: RoomMessage) {
        if (message.type === 'players-sync') {
          setPlayers(message.players)
          setHostPlayerId(message.hostPlayerId)
          localUsername = message.players[localPlayerId]?.username ?? ''
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
        } else if (message.type === 'grid-objects') {
          // Not persisted, per spec: only ever the current grid, resent
          // by the host on every reconnect/grid change anyway.
          setGridObjects(message.objects)
        } else if (message.type === 'game-started') {
          setGameStarted(true)
          // Flow effects don't cross the lobby/game transition (see the
          // matching reset in startGameRef).
          setGridVisible(true)
        } else if (message.type === 'return-to-lobby') {
          setGameStarted(false)
          setMyIdentity(null)
          setGridVisible(true)
        } else if (message.type === 'identity') {
          setMyIdentity(message.identity)
        } else if (message.type === 'grid-visible') {
          setGridVisible(message.visible)
        } else if (message.type === 'avatar') {
          receivedAvatarIds.add(message.playerId)
          applyAvatar(message.playerId, message.image)
        } else if (message.type === 'toast') {
          onToastRef.current(message.text, message.colors)
        } else if (message.type === 'ping') {
          // Target-side resolution, against this guest's own local store
          // and own username (see FlowContext.ping in the host branch).
          void resolveTemplate(message.template, (name) => getStoredValue(name), {
            playerName: localUsername,
          }).then((text) => {
            onToastRef.current(text, message.colors)
          })
        } else if (message.type === 'value-set') {
          void setStoredValue(message.name, message.value, message.lifetime)
        } else if (message.type === 'values-cleared') {
          void clearValuesForLifetime(message.lifetime)
        } else if (message.type === 'room-closed') {
          peer.markClosed()
          onRoomClosedRef.current()
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

      moveToGridRef.current = (direction) => {
        // Not optimistic, unlike movePlayerRef above: which grid the
        // player lands on (and where within it) is decided by the host,
        // so wait for its players-sync instead of guessing locally.
        peer.sendToHost({ type: 'move-grid', direction })
      }

      kickPlayerRef.current = () => {}
      startGameRef.current = () => {}
      returnToLobbyRef.current = () => {}
      executeFlowRef.current = () => Promise.resolve()
      broadcastToastRef.current = () => {}
      setValueRef.current = () => Promise.resolve()

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
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [peer])

  const movePlayer = React.useCallback((position: CellPosition) => {
    movePlayerRef.current(position)
  }, [])

  const moveToGrid = React.useCallback((direction: GridCoord) => {
    moveToGridRef.current(direction)
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

  const executeFlow = React.useCallback((flow: Flow, signal?: AbortSignal) => {
    return executeFlowRef.current(flow, signal)
  }, [])

  const broadcastToast = React.useCallback(
    (playerIds: string[] | null | undefined, text: string, colors?: ToastColors) => {
      broadcastToastRef.current(playerIds, text, colors)
    },
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

  const value: GameWorldValue = {
    players,
    localPlayerId: peer.localPlayerId,
    hostPlayerId,
    avatarUrls,
    world: gameStarted ? props.gameWorld : props.lobbyWorld,
    gridColors,
    gridObjects,
    gameStarted,
    myIdentity,
    gridVisible,
    moveMissCount,
    movePlayer,
    moveToGrid,
    kickPlayer,
    startGame,
    returnToLobby,
    executeFlow,
    broadcastToast,
    setValue,
    getValue,
    getCurrentLifetime,
    updateAvatar,
    leaveRoom,
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
