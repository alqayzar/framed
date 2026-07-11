import * as React from 'react'
import Peer, { type DataConnection } from 'peerjs'

import { type CellPosition, isAdjacent, isCellOccupiedByAnotherPlayer, randomBoardCell } from '@/lib/board'
import { type CubeColor, randomCubeColor } from '@/lib/cube-colors'
import { idbGet } from '@/lib/idb-store'
import { AVATAR_KEY } from '@/lib/profile-store'
import { cacheRemoteAvatar } from '@/lib/remote-avatar-store'

export interface PlayerState {
  position: CellPosition
  color: CubeColor
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
  | { type: 'room-closed' }

const GUEST_RECONNECT_DELAY_MS = 2000
const HOST_LEAVE_BROADCAST_DELAY_MS = 250

interface UseRoomConnectionResult {
  players: PlayersState
  localPlayerId: string | null
  avatarUrls: Record<string, string>
  movePlayer: (position: CellPosition) => void
  leaveRoom: (onDone: () => void) => void
}

function useRoomConnection(
  role: 'host' | 'guest',
  roomCode: string,
  onRoomClosed: () => void
): UseRoomConnectionResult {
  const [players, setPlayers] = React.useState<PlayersState>({})
  const [localPlayerId, setLocalPlayerId] = React.useState<string | null>(null)
  const [avatarUrls, setAvatarUrls] = React.useState<Record<string, string>>({})
  const leaveRoomRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())
  const movePlayerRef = React.useRef<(position: CellPosition) => void>(() => {})
  const onRoomClosedRef = React.useRef(onRoomClosed)
  onRoomClosedRef.current = onRoomClosed

  React.useEffect(() => {
    setPlayers({})
    setLocalPlayerId(null)
    setAvatarUrls({})
    let roomClosed = false
    const connections = new Map<string, DataConnection>()
    const createdUrls = new Set<string>()
    const localAvatarBlobPromise = idbGet<Blob>(AVATAR_KEY)

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
        [roomCode]: { position: randomBoardCell(), color: randomCubeColor() },
      }
      const remoteAvatarBlobs = new Map<string, Blob | SerializedAvatar>()
      setLocalPlayerId(roomCode)
      setPlayers({ ...hostPlayers })
      localAvatarBlobPromise.then((blob) => {
        if (blob) applyAvatar(roomCode, blob)
      })

      function syncPlayers() {
        setPlayers({ ...hostPlayers })
        broadcast({ type: 'players-sync', players: hostPlayers })
      }

      function handleConnection(connection: DataConnection) {
        connection.on('open', () => {
          connections.set(connection.peer, connection)
          hostPlayers[connection.peer] = {
            position: randomBoardCell(),
            color: randomCubeColor(),
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
      hostConnection?.send({ type: 'move', position })
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

  const leaveRoom = React.useCallback((onDone: () => void) => {
    leaveRoomRef.current(onDone)
  }, [])

  return { players, localPlayerId, avatarUrls, movePlayer, leaveRoom }
}

export { useRoomConnection }
