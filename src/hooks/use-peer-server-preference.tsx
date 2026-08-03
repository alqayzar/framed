import * as React from 'react'
import Peer, { type PeerJSOption } from 'peerjs'

export type PeerServerPreference = 'dev' | 'public'

// Matches peer-server.cjs's port/path exactly — shared with
// use-room-peer.tsx (the actual Peer options) and the ping below.
export const DEV_PEER_SERVER_PORT = 9000
export const DEV_PEER_SERVER_PATH = '/framed'

const PING_TIMEOUT_MS = 5000

// Single source of truth for the dev PeerServer's actual connection
// options — used both by use-room-peer.tsx (the real connection) and
// pingDevPeerServer below (a throwaway probe connection), so they can
// never disagree about what "the dev server" means.
export function getDevPeerServerOptions(): PeerJSOption {
  return {
    host: window.location.hostname,
    port: DEV_PEER_SERVER_PORT,
    path: DEV_PEER_SERVER_PATH,
    secure: window.location.protocol === 'https:',
  }
}

interface PeerServerPreferenceValue {
  preference: PeerServerPreference
  setPreference: (preference: PeerServerPreference) => void
}

const PeerServerPreferenceContext = React.createContext<PeerServerPreferenceValue | null>(null)

// Mounted once at the app root (see App.tsx) — survives the client-side
// route change from the home screen to a room, so whatever the toggle
// left it at (see PeerServerToggle) is exactly what use-room-peer.tsx
// reads moments later. 'public' until proven otherwise is the initial
// value, in case a room is somehow reached before the home screen's
// probe ever runs.
function PeerServerPreferenceProvider(props: { children: React.ReactNode }) {
  const [preference, setPreference] = React.useState<PeerServerPreference>('public')

  const value = React.useMemo<PeerServerPreferenceValue>(() => ({ preference, setPreference }), [preference])

  return (
    <PeerServerPreferenceContext.Provider value={value}>
      {props.children}
    </PeerServerPreferenceContext.Provider>
  )
}

function usePeerServerPreference(): PeerServerPreferenceValue {
  const context = React.useContext(PeerServerPreferenceContext)
  if (!context) {
    throw new Error('usePeerServerPreference must be used within a PeerServerPreferenceProvider')
  }
  return context
}

interface PeerServerPing {
  promise: Promise<boolean>
  // Destroys the probe immediately without ever resolving — used when
  // the caller (see PeerServerToggle) no longer cares about this
  // particular probe's result, e.g. StrictMode's discarded first
  // double-invoke run. A no-op once already settled.
  cancel: () => void
}

// Reachability probe using a real (throwaway) PeerJS connection, not
// fetch: a WebSocket upgrade isn't subject to the browser's CORS policy
// the way fetch/XHR is, so this can never disagree with whether an
// actual room connection would succeed against the same server — which
// is the only thing that actually matters here. Tried unconditionally,
// regardless of hostname — whatever URL the app is loaded from, the dev
// server is used whenever it actually answers, and the public broker
// otherwise.
function pingDevPeerServer(): PeerServerPing {
  const probePeer = new Peer(`ping-${Math.random().toString(36).slice(2)}`, getDevPeerServerOptions())
  let settled = false
  function settle(resolve: (reachable: boolean) => void, reachable: boolean) {
    if (settled) return
    settled = true
    probePeer.destroy()
    resolve(reachable)
  }
  const promise = new Promise<boolean>((resolve) => {
    probePeer.on('open', () => settle(resolve, true))
    probePeer.on('error', () => settle(resolve, false))
    window.setTimeout(() => settle(resolve, false), PING_TIMEOUT_MS)
  })
  return {
    promise,
    cancel: () => {
      settled = true
      probePeer.destroy()
    },
  }
}

export { PeerServerPreferenceProvider, usePeerServerPreference, pingDevPeerServer }
