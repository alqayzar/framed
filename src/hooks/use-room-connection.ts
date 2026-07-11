import * as React from 'react'
import Peer, { type DataConnection } from 'peerjs'

type RoomMessage = { type: 'player-count'; count: number } | { type: 'room-closed' }

const GUEST_RECONNECT_DELAY_MS = 2000
const HOST_LEAVE_BROADCAST_DELAY_MS = 250

interface UseRoomConnectionResult {
  playerCount: number
  leaveRoom: (onDone: () => void) => void
}

function useRoomConnection(
  role: 'host' | 'guest',
  roomCode: string,
  onRoomClosed: () => void
): UseRoomConnectionResult {
  const [playerCount, setPlayerCount] = React.useState(1)
  const leaveRoomRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())
  const onRoomClosedRef = React.useRef(onRoomClosed)
  onRoomClosedRef.current = onRoomClosed

  React.useEffect(() => {
    setPlayerCount(1)
    let roomClosed = false
    const connections = new Set<DataConnection>()

    function broadcast(message: RoomMessage) {
      connections.forEach((connection) => connection.send(message))
    }

    function broadcastPlayerCount() {
      const count = connections.size + 1
      setPlayerCount(count)
      broadcast({ type: 'player-count', count })
    }

    if (role === 'host') {
      const peer = new Peer(roomCode)

      function handleConnection(connection: DataConnection) {
        connections.add(connection)
        connection.on('open', broadcastPlayerCount)
        connection.on('close', () => {
          connections.delete(connection)
          broadcastPlayerCount()
        })
      }

      peer.on('connection', handleConnection)

      leaveRoomRef.current = (onDone) => {
        roomClosed = true
        broadcast({ type: 'room-closed' })
        window.setTimeout(() => {
          peer.destroy()
          onDone()
        }, HOST_LEAVE_BROADCAST_DELAY_MS)
      }

      return () => {
        peer.destroy()
      }
    }

    const peer = new Peer()
    let retryTimeout: number | null = null

    function scheduleRetry() {
      if (roomClosed || retryTimeout !== null) return
      retryTimeout = window.setTimeout(() => {
        retryTimeout = null
        connectToHost()
      }, GUEST_RECONNECT_DELAY_MS)
    }

    function connectToHost() {
      const connection = peer.connect(roomCode)

      connection.on('data', (data) => {
        const message = data as RoomMessage
        if (message.type === 'player-count') {
          setPlayerCount(message.count)
        } else if (message.type === 'room-closed') {
          roomClosed = true
          onRoomClosedRef.current()
        }
      })
      connection.on('close', () => {
        setPlayerCount(1)
        scheduleRetry()
      })
    }

    peer.on('open', connectToHost)
    peer.on('error', (error) => {
      if (error.type === 'peer-unavailable') scheduleRetry()
    })

    leaveRoomRef.current = (onDone) => {
      peer.destroy()
      onDone()
    }

    return () => {
      if (retryTimeout !== null) window.clearTimeout(retryTimeout)
      peer.destroy()
    }
  }, [role, roomCode])

  const leaveRoom = React.useCallback((onDone: () => void) => {
    leaveRoomRef.current(onDone)
  }, [])

  return { playerCount, leaveRoom }
}

export { useRoomConnection }
