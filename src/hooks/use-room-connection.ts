import * as React from 'react'
import Peer, { type DataConnection } from 'peerjs'

import { type CellPosition, isAdjacent, isCellOccupiedByAnotherPlayer, randomFreeBoardCell } from '@/lib/board'
import { type CubeColor, randomCubeColor } from '@/lib/cube-colors'
import { idbGet } from '@/lib/idb-store'
import { AVATAR_KEY, USERNAME_KEY } from '@/lib/profile-store'
import { cacheRemoteAvatar } from '@/lib/remote-avatar-store'

export interface PlayerState {
  position: CellPosition
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
  | { type: 'players-sync'; players: PlayersState }
  | { type: 'move'; position: CellPosition }
  | { type: 'avatar'; playerId: string; image: Blob | SerializedAvatar }
  | { type: 'username'; username: string }
  | { type: 'room-closed' }
  | { type: 'kicked' }

const GUEST_RECONNECT_DELAY_MS = 2000
const HOST_LEAVE_BROADCAST_DELAY_MS = 250

interface UseRoomConnectionResult {
  players: PlayersState
  localPlayerId: string | null
  avatarUrls: Record<string, string>
  moveMissCount: number
  movePlayer: (position: CellPosition) => void
  kickPlayer: (playerId: string) => void
  leaveRoom: (onDone: () => void) => void
}

function useRoomConnection(
  role: 'host' | 'guest',
  roomCode: string,
  boardSize: number,
  boardRadius: number,
  onRoomClosed: () => void,
  onKicked: () => void
): UseRoomConnectionResult {
  const [players, setPlayers] = React.useState<PlayersState>({})
  const [localPlayerId, setLocalPlayerId] = React.useState<string | null>(null)
  const [avatarUrls, setAvatarUrls] = React.useState<Record<string, string>>({})
  const [moveMissCount, setMoveMissCount] = React.useState(0)
  // Refs so a board-settings change doesn't re-run the connection effect
  // (which would destroy the peer and disconnect everyone).
  const boardSizeRef = React.useRef(boardSize)
  boardSizeRef.current = boardSize
  const boardRadiusRef = React.useRef(boardRadius)
  boardRadiusRef.current = boardRadius
  const leaveRoomRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())
  const movePlayerRef = React.useRef<(position: CellPosition) => void>(() => {})
  const kickPlayerRef = React.useRef<(playerId: string) => void>(() => {})
  const onRoomClosedRef = React.useRef(onRoomClosed)
  onRoomClosedRef.current = onRoomClosed
  const onKickedRef = React.useRef(onKicked)
  onKickedRef.current = onKicked

  React.useEffect(() => {
    setPlayers({})
    setLocalPlayerId(null)
    setAvatarUrls({})
    setMoveMissCount(0)
    let roomClosed = false
    const connections = new Map<string, DataConnection>()
    const createdUrls = new Set<string>()
    const localAvatarBlobPromise = idbGet<Blob>(AVATAR_KEY)
    const localUsernamePromise = idbGet<string>(USERNAME_KEY)

    function broadcast(message: RoomMessage) {
      connections.forEach((connection) => connection.send(message))
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
    // IndexedDB so a reconnect within the same session doesn't need it
    // re-transmitted.
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
      const hostPlayers: PlayersState = {
        [roomCode]: {
          position: randomFreeBoardCell({}, boardSizeRef.current, boardRadiusRef.current),
          color: randomCubeColor(),
          username: '',
        },
      }
      const remoteAvatarBlobs = new Map<string, Blob | SerializedAvatar>()
      setLocalPlayerId(roomCode)
      setPlayers({ ...hostPlayers })
      localAvatarBlobPromise.then((blob) => {
        if (blob) applyAvatar(roomCode, blob)
      })
      localUsernamePromise.then((username) => {
        if (!username) return
        hostPlayers[roomCode] = { ...hostPlayers[roomCode], username }
        syncPlayers()
      })

      function syncPlayers() {
        setPlayers({ ...hostPlayers })
        broadcast({ type: 'players-sync', players: hostPlayers })
      }

      function handleConnection(connection: DataConnection) {
        connection.on('open', () => {
          connections.set(connection.peer, connection)
          hostPlayers[connection.peer] = {
            position: randomFreeBoardCell(hostPlayers, boardSizeRef.current, boardRadiusRef.current),
            color: randomCubeColor(),
            username: '',
          }
          syncPlayers()

          localAvatarBlobPromise.then((blob) => {
            if (blob) sendAvatar(connection, roomCode, blob)
          })
          remoteAvatarBlobs.forEach((blob, playerId) => {
            sendAvatar(connection, playerId, blob)
          })
        })
        connection.on('data', (data) => {
          const message = data as RoomMessage
          if (message.type === 'move') {
            const current = hostPlayers[connection.peer]
            if (
              !current ||
              !isAdjacent(current.position, message.position) ||
              isCellOccupiedByAnotherPlayer(message.position, hostPlayers, connection.peer)
            ) {
              // Rejected: tell just this guest the authoritative state so
              // it can snap its optimistic cube back to the last valid
              // position instead of staying silently desynced.
              setMoveMissCount((count) => count + 1)
              connection.send({ type: 'players-sync', players: hostPlayers })
              return
            }
            hostPlayers[connection.peer] = { ...current, position: message.position }
            syncPlayers()
          } else if (message.type === 'avatar') {
            remoteAvatarBlobs.set(connection.peer, message.image)
            applyAvatar(connection.peer, message.image)
            connections.forEach((otherConnection, otherPeerId) => {
              if (otherPeerId !== connection.peer) {
                const serializedMessage = { ...message, image: message.image }
                otherConnection.send(serializedMessage)
              }
            })
          } else if (message.type === 'username') {
            const current = hostPlayers[connection.peer]
            if (!current) return
            hostPlayers[connection.peer] = { ...current, username: message.username }
            syncPlayers()
          }
        })
        connection.on('close', () => {
          connections.delete(connection.peer)
          delete hostPlayers[connection.peer]
          remoteAvatarBlobs.delete(connection.peer)
          applyAvatar(connection.peer, null)
          syncPlayers()
        })
      }

      peer.on('connection', handleConnection)

      movePlayerRef.current = (position) => {
        const current = hostPlayers[roomCode]
        if (
          !current ||
          !isAdjacent(current.position, position) ||
          isCellOccupiedByAnotherPlayer(position, hostPlayers, roomCode)
        ) {
          return
        }
        hostPlayers[roomCode] = { ...current, position }
        syncPlayers()
      }

      kickPlayerRef.current = (playerId) => {
        const connection = connections.get(playerId)
        if (!connection) return
        connection.send({ type: 'kicked' })
        window.setTimeout(() => {
          connection.close()
        }, HOST_LEAVE_BROADCAST_DELAY_MS)
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
        createdUrls.forEach((url) => URL.revokeObjectURL(url))
        peer.destroy()
      }
    }

    const peer = new Peer()
    let retryTimeout: number | null = null
    let hostConnection: DataConnection | null = null

    function scheduleRetry() {
      if (roomClosed || retryTimeout !== null) return
      retryTimeout = window.setTimeout(() => {
        retryTimeout = null
        connectToHost()
      }, GUEST_RECONNECT_DELAY_MS)
    }

    function connectToHost() {
      const connection = peer.connect(roomCode)
      hostConnection = connection

      connection.on('open', () => {
        setLocalPlayerId(peer.id)
        localAvatarBlobPromise.then((blob) => {
          if (!blob) return
          applyAvatar(peer.id, blob)
          sendAvatar(connection, peer.id, blob)
        })
        localUsernamePromise.then((username) => {
          if (username) connection.send({ type: 'username', username })
        })
      })
      connection.on('data', (data) => {
        const message = data as RoomMessage
        if (message.type === 'players-sync') {
          setPlayers(message.players)
        } else if (message.type === 'avatar') {
          applyAvatar(message.playerId, message.image)
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

    movePlayerRef.current = (position) => {
      if (!hostConnection) return
      // Optimistic update: move locally right away instead of waiting for
      // the host's players-sync round trip. If the host later confirms the
      // same position, the diff in GameGrid sees no change and skips a
      // duplicate jump animation; if the host rejects it (e.g. someone
      // else took that cell first), the next sync snaps the cube back.
      setPlayers((current) => {
        const localPlayer = current[peer.id]
        if (!localPlayer) return current
        return { ...current, [peer.id]: { ...localPlayer, position } }
      })
      hostConnection.send({ type: 'move', position })
    }

    leaveRoomRef.current = (onDone) => {
      peer.destroy()
      onDone()
    }

    return () => {
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
      if (retryTimeout !== null) window.clearTimeout(retryTimeout)
      peer.destroy()
    }
  }, [role, roomCode])

  const movePlayer = React.useCallback((position: CellPosition) => {
    movePlayerRef.current(position)
  }, [])

  const kickPlayer = React.useCallback((playerId: string) => {
    kickPlayerRef.current(playerId)
  }, [])

  const leaveRoom = React.useCallback((onDone: () => void) => {
    leaveRoomRef.current(onDone)
  }, [])

  return { players, localPlayerId, avatarUrls, moveMissCount, movePlayer, kickPlayer, leaveRoom }
}

export { useRoomConnection }
