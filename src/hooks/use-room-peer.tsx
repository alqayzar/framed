import * as React from 'react'
import Peer, { type DataConnection } from 'peerjs'

// Transport layer only: creates the room's single PeerJS peer, keeps its
// signaling socket alive, tracks the per-guest data connections (host) or
// the connection to the host (guest), and surfaces raw open/message/close
// events to subscribers. What travels over the wire and what it means is
// the game layer's business (see use-game-world.tsx) — nothing here ever
// reads a message's contents.

// The stable player id (see room-store.ts) travels in the PeerJS
// connection metadata: unlike the peer id — regenerated on every page
// load — it identifies the same player across reconnects.
interface ConnectionMetadata {
  playerId: string
}

const GUEST_RECONNECT_DELAY_MS = 2000
// Grace delay between a farewell message (kicked, room-closed, leave) and
// actually closing/destroying, so the payload has time to flush before
// the channel drops.
const CLOSE_FLUSH_DELAY_MS = 250

export type RoomPeerEvent =
  | { type: 'guest-open'; playerId: string }
  | { type: 'guest-message'; playerId: string; message: unknown }
  | { type: 'guest-close'; playerId: string }
  | { type: 'host-open' }
  | { type: 'host-message'; message: unknown }
  | { type: 'host-close' }

interface RoomPeerValue {
  role: 'host' | 'guest'
  roomCode: string
  localPlayerId: string
  subscribe: (listener: (event: RoomPeerEvent) => void) => () => void
  // Host: sends to every connected guest, or only to the given player ids
  // when the list is non-empty. Guests get a no-op.
  broadcast: (message: unknown, playerIds?: string[]) => void
  // Host: sends to a single guest; silently no-ops if it isn't connected
  // (including the host's own id — it has no connection to itself).
  sendTo: (playerId: string, message: unknown) => void
  // Guest: sends to the host; returns false (and sends nothing) while
  // disconnected. Hosts get a no-op returning false.
  sendToHost: (message: unknown) => boolean
  // Host: whether this guest currently has a live connection.
  isConnected: (playerId: string) => boolean
  // Host: closes a guest's connection (after the flush delay) without
  // touching the rest of the room. Its 'guest-close' event is suppressed —
  // the caller decided to drop it, it already knows.
  disconnectGuest: (playerId: string) => void
  // Stops every reconnection attempt for good: the room is over (left,
  // kicked, host gone). Does not destroy the peer — see shutdown.
  markClosed: () => void
  // markClosed + destroys the peer (after the flush delay, so a farewell
  // message sent just before still goes out), then reports done.
  shutdown: (onDone: () => void) => void
}

interface RoomPeerProviderProps {
  role: 'host' | 'guest'
  roomCode: string
  playerId: string
  children: React.ReactNode
}

const RoomPeerContext = React.createContext<RoomPeerValue | null>(null)

function RoomPeerProvider(props: RoomPeerProviderProps) {
  const listenersRef = React.useRef(new Set<(event: RoomPeerEvent) => void>())
  // Assigned inside the effect below once the peer exists; the context
  // value only ever calls through these so it can stay referentially
  // stable across the peer's lifetime.
  const broadcastRef = React.useRef<(message: unknown, playerIds?: string[]) => void>(() => {})
  const sendToRef = React.useRef<(playerId: string, message: unknown) => void>(() => {})
  const sendToHostRef = React.useRef<(message: unknown) => boolean>(() => false)
  const isConnectedRef = React.useRef<(playerId: string) => boolean>(() => false)
  const disconnectGuestRef = React.useRef<(playerId: string) => void>(() => {})
  const markClosedRef = React.useRef<() => void>(() => {})
  const shutdownRef = React.useRef<(onDone: () => void) => void>((onDone) => onDone())

  React.useEffect(() => {
    // Also flipped at the very start of this effect's cleanup (before
    // peer.destroy()): Peer.destroy() emits 'disconnected' synchronously,
    // before its own `destroyed` flag flips true, so a reconnect triggered
    // from that event wouldn't otherwise see the peer as destroyed.
    let roomClosed = false

    function emit(event: RoomPeerEvent) {
      listenersRef.current.forEach((listener) => listener(event))
    }

    if (props.role === 'host') {
      const peer = new Peer(props.roomCode)
      // Keyed by stable player id, not by peer id.
      const connections = new Map<string, DataConnection>()

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

      peer.on('connection', (connection) => {
        const metadata = connection.metadata as Partial<ConnectionMetadata> | undefined
        const playerId = typeof metadata?.playerId === 'string' ? metadata.playerId : null

        connection.on('open', () => {
          if (!playerId || playerId === props.playerId) {
            connection.close()
            return
          }
          const previousConnection = connections.get(playerId)
          if (previousConnection && previousConnection !== connection) previousConnection.close()
          connections.set(playerId, connection)
          emit({ type: 'guest-open', playerId })
        })
        connection.on('data', (data) => {
          if (!playerId) return
          emit({ type: 'guest-message', playerId, message: data })
        })
        connection.on('close', () => {
          // Ignore stale closes: the guest was already dropped on purpose
          // (disconnectGuest), or a reconnection already replaced this
          // connection.
          if (!playerId || connections.get(playerId) !== connection) return
          connections.delete(playerId)
          emit({ type: 'guest-close', playerId })
        })
      })

      broadcastRef.current = (message, playerIds) => {
        if (!playerIds || playerIds.length === 0) {
          connections.forEach((connection) => connection.send(message))
          return
        }
        for (const playerId of playerIds) {
          connections.get(playerId)?.send(message)
        }
      }
      sendToRef.current = (playerId, message) => {
        connections.get(playerId)?.send(message)
      }
      sendToHostRef.current = () => false
      isConnectedRef.current = (playerId) => connections.has(playerId)
      disconnectGuestRef.current = (playerId) => {
        const connection = connections.get(playerId)
        if (!connection) return
        // Removed from the map right away so the eventual 'close' fails
        // the stale check above and emits nothing.
        connections.delete(playerId)
        window.setTimeout(() => {
          connection.close()
        }, CLOSE_FLUSH_DELAY_MS)
      }
      markClosedRef.current = () => {
        roomClosed = true
      }
      shutdownRef.current = (onDone) => {
        roomClosed = true
        window.setTimeout(() => {
          peer.destroy()
          onDone()
        }, CLOSE_FLUSH_DELAY_MS)
      }

      return () => {
        roomClosed = true
        document.removeEventListener('visibilitychange', handleVisibilityChange)
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
      const metadata: ConnectionMetadata = { playerId: props.playerId }
      const connection = peer.connect(props.roomCode, { metadata })
      hostConnection = connection

      connection.on('open', () => {
        emit({ type: 'host-open' })
      })
      connection.on('data', (data) => {
        emit({ type: 'host-message', message: data })
      })
      connection.on('close', () => {
        hostConnection = null
        emit({ type: 'host-close' })
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

    broadcastRef.current = () => {}
    sendToRef.current = () => {}
    sendToHostRef.current = (message) => {
      if (!hostConnection) return false
      hostConnection.send(message)
      return true
    }
    isConnectedRef.current = () => hostConnection !== null
    disconnectGuestRef.current = () => {}
    markClosedRef.current = () => {
      roomClosed = true
    }
    shutdownRef.current = (onDone) => {
      roomClosed = true
      window.setTimeout(() => {
        peer.destroy()
        onDone()
      }, CLOSE_FLUSH_DELAY_MS)
    }

    return () => {
      roomClosed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (retryTimeout !== null) window.clearTimeout(retryTimeout)
      peer.destroy()
    }
  }, [props.role, props.roomCode, props.playerId])

  const value = React.useMemo<RoomPeerValue>(
    () => ({
      role: props.role,
      roomCode: props.roomCode,
      localPlayerId: props.playerId,
      subscribe: (listener) => {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },
      broadcast: (message, playerIds) => broadcastRef.current(message, playerIds),
      sendTo: (playerId, message) => sendToRef.current(playerId, message),
      sendToHost: (message) => sendToHostRef.current(message),
      isConnected: (playerId) => isConnectedRef.current(playerId),
      disconnectGuest: (playerId) => disconnectGuestRef.current(playerId),
      markClosed: () => markClosedRef.current(),
      shutdown: (onDone) => shutdownRef.current(onDone),
    }),
    [props.role, props.roomCode, props.playerId]
  )

  return <RoomPeerContext.Provider value={value}>{props.children}</RoomPeerContext.Provider>
}

function useRoomPeer(): RoomPeerValue {
  const context = React.useContext(RoomPeerContext)
  if (!context) {
    throw new Error('useRoomPeer must be used within a RoomPeerProvider')
  }
  return context
}

export { RoomPeerProvider, useRoomPeer }
