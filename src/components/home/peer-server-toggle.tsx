import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  pingDevPeerServer,
  usePeerServerPreference,
  type PeerServerPreference,
} from '@/hooks/use-peer-server-preference'

interface PeerServerToggleProps {
  // In a room, the connection already read this — flipping it now
  // wouldn't do anything until the next room, so the control is shown
  // (for visibility of which server is active) but not interactive.
  disabled?: boolean
}

// Deliberately tucked away — a dev-facing escape hatch for choosing
// which PeerServer the next room connects to (see use-room-peer.tsx),
// not a player-facing setting.
function PeerServerToggle(props: PeerServerToggleProps) {
  const { preference, setPreference } = usePeerServerPreference()
  // Guards against the probe below clobbering a manual click that
  // happens to land while it's still in flight.
  const userChangedRef = React.useRef(false)

  // Probe whether the dev PeerServer actually responds and seed the
  // preference from that, instead of guessing — tried unconditionally,
  // regardless of hostname. Skipped once disabled (in-room): a room
  // has already connected with whatever was current at the time, so
  // probing here wouldn't do anything.
  React.useEffect(() => {
    if (props.disabled) return
    const probe = pingDevPeerServer()
    void probe.promise.then((reachable) => {
      if (userChangedRef.current) return
      setPreference(reachable ? 'dev' : 'public')
    })
    return () => {
      probe.cancel()
    }
  }, [props.disabled, setPreference])

  function handleClick() {
    if (props.disabled) return
    userChangedRef.current = true
    const next: PeerServerPreference = preference === 'dev' ? 'public' : 'dev'
    setPreference(next)
  }

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={handleClick}
      className={cn(
        'fixed bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-game-ink/20 bg-white/40 px-2 py-0.5 text-[10px] font-bold text-game-ink/40 opacity-40 transition-opacity',
        props.disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-100'
      )}
    >
      {preference === 'dev' ? 'Serveur : local' : 'Serveur : public'}
    </button>
  )
}

export { PeerServerToggle }
