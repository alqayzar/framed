import * as React from 'react'
import Peer, { type DataConnection } from 'peerjs'

import {
  boardEdgeDirections,
  type CellPosition,
  centerGridCoord,
  type GridCoord,
  gridEntryPosition,
  isAdjacent,
  isCellOccupiedByAnotherPlayer,
  isGridInWorld,
  randomFreeBoardCell,
} from '@/lib/board'
import { type CubeColor, randomCubeColor } from '@/lib/cube-colors'
import { idbGet } from '@/lib/idb-store'
import { AVATAR_KEY, USERNAME_KEY } from '@/lib/profile-store'
import { cacheRemoteAvatar, getCachedRemoteAvatar } from '@/lib/remote-avatar-store'
import { loadRoomPlayers, saveRoomPlayers } from '@/lib/room-store'
import type { ToastColors } from '@/hooks/use-toast'

export interface PlayerState {
  position: CellPosition
  // Which grid of the world the player stands on (see GridCoord in
  // board.ts). Everyone spawns on the world's center grid, then moves
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

// The stable player id (see room-store.ts) travels in the PeerJS
// connection metadata: unlike the peer id — regenerated on every page
// load — it identifies the same player across reconnects, so the host
// can restore their position/color/username and avatars can be cached
// under a durable key.
interface ConnectionMetadata {
  playerId: string
}

type RoomMessage =
  | { type: 'players-sync'; players: PlayersState; hostPlayerId: string }
  | { type: 'move'; position: CellPosition }
  | { type: 'move-grid'; direction: GridCoord }
  | { type: 'avatar'; playerId: string; image: Blob | SerializedAvatar }
  | { type: 'username'; username: string }
  | { type: 'toast'; text: string; colors?: ToastColors }
  | { type: 'leave' }
  | { type: 'room-closed' }
  | { type: 'kicked' }

const GUEST_RECONNECT_DELAY_MS = 2000
const HOST_LEAVE_BROADCAST_DELAY_MS = 250

interface UseRoomConnectionResult {
  players: PlayersState
  localPlayerId: string
  hostPlayerId: string | null
  avatarUrls: Record<string, string>
  moveMissCount: number
  movePlayer: (position: CellPosition) => void
  moveToGrid: (direction: GridCoord) => void
  kickPlayer: (playerId: string) => void
  // Host only: shows an arbitrary message in everyone's toast, or only in
  // the toast of the given player ids when that list is non-empty (guests
  // get a no-op).
  broadcastToast: (playerIds: string[] | null | undefined, text: string, colors?: ToastColors) => void
  leaveRoom: (onDone: () => void) => void
}

function useRoomConnection(
  role: 'host' | 'guest',
  roomCode: string,
  localPlayerId: string,
  boardSize: number,
  boardRadius: number,
  worldSize: number,
  onRoomClosed: () => void,
  onKicked: () => void,
  onToast: (text: string, colors?: ToastColors) => void
): UseRoomConnectionResult {
  const [players, setPlayers] = React.useState<PlayersState>({})
  const [hostPlayerId, setHostPlayerId] = React.useState<string | null>(null)
  const [avatarUrls, setAvatarUrls] = React.useState<Record<string, string>>({})
  const [moveMissCount, setMoveMissCount] = React.useState(0)
  // Refs so a board-settings change doesn't re-run the connection effect
  // (which would destroy the peer and disconnect everyone).
  const boardSizeRef = React.useRef(boardSize)
  boardSizeRef.current = boardSize
  const boardRadiusRef = React.useRef(boardRadius)
  boardRadiusRef.current = boardRadius
  const worldSizeRef = React.useRef(worldSize)
  worldSizeRef.current = worldSize
  const leaveRoomRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())
  const movePlayerRef = React.useRef<(position: CellPosition) => void>(() => {})
  const moveToGridRef = React.useRef<(direction: GridCoord) => void>(() => {})
  const kickPlayerRef = React.useRef<(playerId: string) => void>(() => {})
  const broadcastToastRef = React.useRef<
    (playerIds: string[] | null | undefined, text: string, colors?: ToastColors) => void
  >(() => {})
  const onRoomClosedRef = React.useRef(onRoomClosed)
  onRoomClosedRef.current = onRoomClosed
  const onKickedRef = React.useRef(onKicked)
  onKickedRef.current = onKicked
  const onToastRef = React.useRef(onToast)
  onToastRef.current = onToast

  React.useEffect(() => {
    setPlayers({})
    setHostPlayerId(null)
    setAvatarUrls({})
    setMoveMissCount(0)
    // Also flipped at the very start of this effect's cleanup (before
    // peer.destroy()): Peer.destroy() emits 'disconnected' synchronously,
    // before its own `destroyed` flag flips true, so a reconnect triggered
    // from that event wouldn't otherwise see the peer as destroyed.
    let roomClosed = false
    // Keyed by stable player id, not by peer id.
    const connections = new Map<string, DataConnection>()
    const createdUrls = new Set<string>()
    const localAvatarBlobPromise = idbGet<Blob>(AVATAR_KEY)
    const localUsernamePromise = idbGet<string>(USERNAME_KEY)

    // With no playerIds (or an empty list), sends to every connected
    // guest; otherwise only to the given player ids.
    function broadcast(message: RoomMessage, playerIds?: string[]) {
      if (!playerIds || playerIds.length === 0) {
        connections.forEach((connection) => connection.send(message))
        return
      }
      for (const playerId of playerIds) {
        connections.get(playerId)?.send(message)
      }
    }

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

    function sendAvatar(connection: DataConnection, playerId: string, image: Blob | SerializedAvatar) {
      const payloadPromise = image instanceof Blob ? serializeAvatar(image) : Promise.resolve(image)
      void payloadPromise.then((serializedAvatar) => {
        connection.send({ type: 'avatar', playerId, image: serializedAvatar })
      })
    }

    // An avatar is only ever pushed once, right after a connection opens
    // (see connection.on('open', ...) below) — never re-sent on every
    // players-sync/move — and every received avatar is cached in
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

    if (role === 'host') {
      const peer = new Peer(roomCode)
      // PeerJS keeps a separate signaling websocket to its broker server,
      // independent from the WebRTC data channels: a long period of tab
      // inactivity (background throttling, device sleep) can drop it
      // silently. When that happens the peer emits 'disconnected' and
      // stays that way until reconnect() is called — without it, guests
      // can no longer open a new connection to this host even once
      // they're back and retrying.
      function handlePeerDisconnected() {
        if (roomClosed || peer.destroyed) return
        peer.reconnect()
      }
      peer.on('disconnected', handlePeerDisconnected)
      // The 'disconnected' event depends on the browser noticing the dead
      // socket, which can lag well behind the tab regaining focus:
      // proactively reconnect as soon as it becomes visible again instead
      // of waiting for that detection.
      function handleVisibilityChange() {
        if (document.visibilityState !== 'visible') return
        handlePeerDisconnected()
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      const spawnGrid = centerGridCoord(worldSizeRef.current)
      const hostPlayers: PlayersState = {
        [localPlayerId]: {
          position: randomFreeBoardCell({}, spawnGrid, boardSizeRef.current, boardRadiusRef.current),
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
        const defaultSpawnGrid = centerGridCoord(worldSizeRef.current)
        for (const [playerId, storedState] of Object.entries(stored)) {
          // Snapshots written before the world/grids feature have no
          // gridX/gridY: default them to the spawn grid.
          const state: PlayerState = {
            ...storedState,
            gridX: storedState.gridX ?? defaultSpawnGrid.x,
            gridY: storedState.gridY ?? defaultSpawnGrid.y,
          }
          if (playerId === localPlayerId) {
            const current = hostPlayers[localPlayerId]
            const canRestorePosition = !isCellOccupiedByAnotherPlayer(
              state.position,
              { x: state.gridX, y: state.gridY },
              hostPlayers,
              localPlayerId
            )
            hostPlayers[localPlayerId] = {
              ...current,
              position: canRestorePosition ? state.position : current.position,
              color: state.color,
            }
          } else if (!(playerId in hostPlayers) && !knownPlayers.has(playerId)) {
            knownPlayers.set(playerId, state)
          }
        }
        syncPlayers()
      })
      localAvatarBlobPromise.then((blob) => {
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
        broadcast({ type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
        persistPlayers()
      }

      // Full removal, for players that leave the game for good (explicit
      // leave or kick): their id and cached identity/avatar disappear
      // from everyone.
      function forgetPlayer(playerId: string) {
        connections.delete(playerId)
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
      // point isn't already occupied by another player there.
      function attemptMoveToGrid(playerId: string, direction: GridCoord): boolean {
        const current = hostPlayers[playerId]
        if (!current) return false
        const validDirections = boardEdgeDirections(current.position, boardSizeRef.current, boardRadiusRef.current)
        if (!validDirections.some((d) => d.x === direction.x && d.y === direction.y)) return false
        const targetGrid: GridCoord = { x: current.gridX + direction.x, y: current.gridY + direction.y }
        if (!isGridInWorld(targetGrid, worldSizeRef.current)) return false
        const entryPosition = gridEntryPosition(
          current.position,
          direction,
          boardSizeRef.current,
          boardRadiusRef.current
        )
        if (isCellOccupiedByAnotherPlayer(entryPosition, targetGrid, hostPlayers, playerId)) return false
        hostPlayers[playerId] = {
          ...current,
          gridX: targetGrid.x,
          gridY: targetGrid.y,
          position: entryPosition,
        }
        return true
      }

      function handleConnection(connection: DataConnection) {
        const metadata = connection.metadata as Partial<ConnectionMetadata> | undefined
        const playerId = typeof metadata?.playerId === 'string' ? metadata.playerId : null

        connection.on('open', () => {
          if (!playerId || playerId === localPlayerId) {
            connection.close()
            return
          }
          const previousConnection = connections.get(playerId)
          if (previousConnection && previousConnection !== connection) previousConnection.close()
          connections.set(playerId, connection)

          const known = knownPlayers.get(playerId)
          const defaultSpawnGrid = centerGridCoord(worldSizeRef.current)
          const targetGrid: GridCoord = known
            ? { x: known.gridX, y: known.gridY }
            : defaultSpawnGrid
          const canRestorePosition =
            known && !isCellOccupiedByAnotherPlayer(known.position, targetGrid, hostPlayers)
          hostPlayers[playerId] = {
            position: canRestorePosition
              ? known.position
              : randomFreeBoardCell(hostPlayers, targetGrid, boardSizeRef.current, boardRadiusRef.current),
            gridX: targetGrid.x,
            gridY: targetGrid.y,
            color: known?.color ?? randomCubeColor(),
            username: known?.username ?? '',
          }
          syncPlayers()

          localAvatarBlobPromise.then((blob) => {
            if (blob) sendAvatar(connection, localPlayerId, blob)
          })
          remoteAvatarBlobs.forEach((blob, avatarPlayerId) => {
            if (avatarPlayerId !== playerId) sendAvatar(connection, avatarPlayerId, blob)
          })
        })
        connection.on('data', (data) => {
          if (!playerId) return
          const message = data as RoomMessage
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
              connection.send({ type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
              return
            }
            hostPlayers[playerId] = { ...current, position: message.position }
            syncPlayers()
          } else if (message.type === 'move-grid') {
            if (!attemptMoveToGrid(playerId, message.direction)) {
              setMoveMissCount((count) => count + 1)
              connection.send({ type: 'players-sync', players: hostPlayers, hostPlayerId: localPlayerId })
              return
            }
            syncPlayers()
          } else if (message.type === 'avatar') {
            remoteAvatarBlobs.set(playerId, message.image)
            applyAvatar(playerId, message.image)
            connections.forEach((otherConnection, otherPlayerId) => {
              if (otherPlayerId !== playerId) {
                otherConnection.send({ type: 'avatar', playerId, image: message.image })
              }
            })
          } else if (message.type === 'username') {
            const current = hostPlayers[playerId]
            if (!current) return
            hostPlayers[playerId] = { ...current, username: message.username }
            syncPlayers()
          } else if (message.type === 'leave') {
            forgetPlayer(playerId)
          }
        })
        connection.on('close', () => {
          // Ignore stale closes: the player already left for good, or a
          // reconnection already replaced this connection.
          if (!playerId || connections.get(playerId) !== connection) return
          connections.delete(playerId)
          const state = hostPlayers[playerId]
          if (state) knownPlayers.set(playerId, state)
          delete hostPlayers[playerId]
          syncPlayers()
        })
      }

      peer.on('connection', handleConnection)

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
        hostPlayers[localPlayerId] = { ...current, position }
        syncPlayers()
      }

      moveToGridRef.current = (direction) => {
        if (attemptMoveToGrid(localPlayerId, direction)) syncPlayers()
      }

      kickPlayerRef.current = (playerId) => {
        const connection = connections.get(playerId)
        if (!connection) return
        connection.send({ type: 'kicked' })
        forgetPlayer(playerId)
        window.setTimeout(() => {
          connection.close()
        }, HOST_LEAVE_BROADCAST_DELAY_MS)
      }

      broadcastToastRef.current = (playerIds, text, colors) => {
        const targets = playerIds && playerIds.length > 0 ? playerIds : undefined
        broadcast({ type: 'toast', text, colors }, targets)
        // The host has no connection to itself: show locally when it's
        // one of the targets, or when broadcasting to everyone.
        if (!targets || targets.includes(localPlayerId)) {
          onToastRef.current(text, colors)
        }
      }

      leaveRoomRef.current = (onDone) => {
        roomClosed = true
        broadcast({ type: 'room-closed' })
        window.setTimeout(() => {
          peer.destroy()
          onDone()
        }, HOST_LEAVE_BROADCAST_DELAY_MS)
      }

      return () => {
        roomClosed = true
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        createdUrls.forEach((url) => URL.revokeObjectURL(url))
        peer.destroy()
      }
    }

    const peer = new Peer()
    let retryTimeout: number | null = null
    let hostConnection: DataConnection | null = null
    // Player ids whose avatar arrived over the network this session: a
    // slower IndexedDB cache lookup must not overwrite a fresher network
    // copy.
    const receivedAvatarIds = new Set<string>()
    // Ids already looked up in the cache, so each player triggers at most
    // one IndexedDB read even though players-sync arrives often.
    const requestedCachedAvatarIds = new Set<string>()

    function scheduleRetry() {
      if (roomClosed || retryTimeout !== null) return
      retryTimeout = window.setTimeout(() => {
        retryTimeout = null
        connectToHost()
      }, GUEST_RECONNECT_DELAY_MS)
    }

    function connectToHost() {
      const metadata: ConnectionMetadata = { playerId: localPlayerId }
      const connection = peer.connect(roomCode, { metadata })
      hostConnection = connection

      connection.on('open', () => {
        localAvatarBlobPromise.then((blob) => {
          if (!blob) return
          applyAvatar(localPlayerId, blob)
          sendAvatar(connection, localPlayerId, blob)
        })
        localUsernamePromise.then((username) => {
          if (username) connection.send({ type: 'username', username })
        })
      })
      connection.on('data', (data) => {
        const message = data as RoomMessage
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
        } else if (message.type === 'avatar') {
          receivedAvatarIds.add(message.playerId)
          applyAvatar(message.playerId, message.image)
        } else if (message.type === 'toast') {
          onToastRef.current(message.text, message.colors)
        } else if (message.type === 'room-closed') {
          roomClosed = true
          onRoomClosedRef.current()
        } else if (message.type === 'kicked') {
          roomClosed = true
          onKickedRef.current()
        }
      })
      connection.on('close', () => {
        hostConnection = null
        setPlayers({})
        scheduleRetry()
      })
    }

    peer.on('open', connectToHost)
    peer.on('error', (error) => {
      if (error.type === 'peer-unavailable') scheduleRetry()
    })
    // See the matching comment in the host branch: PeerJS's signaling
    // websocket can drop silently during a long inactive/backgrounded
    // period, leaving the peer unable to open new connections until
    // reconnect() is called.
    function handlePeerDisconnected() {
      if (roomClosed || peer.destroyed) return
      peer.reconnect()
    }
    peer.on('disconnected', handlePeerDisconnected)
    // Two things can get stuck behind background-tab throttling: the
    // peer's signaling socket (handled above) and scheduleRetry's
    // setTimeout itself, whose delay can end up firing much later than
    // GUEST_RECONNECT_DELAY_MS. On regaining visibility, skip the wait
    // and retry immediately if still disconnected from the host.
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || roomClosed) return
      if (peer.disconnected && !peer.destroyed) {
        peer.reconnect()
        return
      }
      if (!hostConnection) {
        if (retryTimeout !== null) {
          window.clearTimeout(retryTimeout)
          retryTimeout = null
        }
        connectToHost()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    movePlayerRef.current = (position) => {
      if (!hostConnection) return
      // Optimistic update: move locally right away instead of waiting for
      // the host's players-sync round trip. If the host later confirms the
      // same position, the diff in GameGrid sees no change and skips a
      // duplicate jump animation; if the host rejects it (e.g. someone
      // else took that cell first), the next sync snaps the cube back.
      setPlayers((current) => {
        const localPlayer = current[localPlayerId]
        if (!localPlayer) return current
        return { ...current, [localPlayerId]: { ...localPlayer, position } }
      })
      hostConnection.send({ type: 'move', position })
    }

    moveToGridRef.current = (direction) => {
      if (!hostConnection) return
      // Not optimistic, unlike movePlayerRef above: which grid the
      // player lands on (and where within it) is decided by the host, so
      // wait for its players-sync instead of guessing locally.
      hostConnection.send({ type: 'move-grid', direction })
    }

    leaveRoomRef.current = (onDone) => {
      roomClosed = true
      // Explicit leave (vs. a reload's silent close): tells the host to
      // drop the player id and its cached identity everywhere.
      hostConnection?.send({ type: 'leave' })
      window.setTimeout(() => {
        peer.destroy()
        onDone()
      }, HOST_LEAVE_BROADCAST_DELAY_MS)
    }

    return () => {
      roomClosed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
      if (retryTimeout !== null) window.clearTimeout(retryTimeout)
      peer.destroy()
    }
  }, [role, roomCode, localPlayerId])

  const movePlayer = React.useCallback((position: CellPosition) => {
    movePlayerRef.current(position)
  }, [])

  const moveToGrid = React.useCallback((direction: GridCoord) => {
    moveToGridRef.current(direction)
  }, [])

  const kickPlayer = React.useCallback((playerId: string) => {
    kickPlayerRef.current(playerId)
  }, [])

  const broadcastToast = React.useCallback(
    (playerIds: string[] | null | undefined, text: string, colors?: ToastColors) => {
      broadcastToastRef.current(playerIds, text, colors)
    },
    []
  )

  const leaveRoom = React.useCallback((onDone: () => void) => {
    leaveRoomRef.current(onDone)
  }, [])

  return {
    players,
    localPlayerId,
    hostPlayerId,
    avatarUrls,
    moveMissCount,
    movePlayer,
    moveToGrid,
    kickPlayer,
    broadcastToast,
    leaveRoom,
  }
}

export { useRoomConnection }
