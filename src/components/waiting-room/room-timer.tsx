import * as React from 'react'

import { type TimerState } from '@/hooks/use-game-world'
import { cn } from '@/lib/utils'

const RED_THRESHOLD_MS = 60000
const TICK_MS = 100

interface RoomTimerProps {
  timer: TimerState
}

// Shown in both the wait room and the actual game (see waiting-room.tsx/
// game-screen.tsx) — deliberately small, black text switching to red
// under 1 second remaining. Owns its own tick loop so only this badge
// re-renders every 100ms, not the whole screen around it.
function RoomTimer(props: RoomTimerProps) {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!props.timer.enabled) return
    const interval = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(interval)
  }, [props.timer.enabled])

  if (!props.timer.enabled || props.timer.endAt === null) return null

  const remainingMs = Math.max(0, props.timer.endAt - now)

  return (
    <div
      className={cn(
        'rounded-full border-2 border-game-ink bg-white px-3 py-1 text-sm font-black tabular-nums',
        remainingMs < RED_THRESHOLD_MS ? 'text-game-red' : 'text-game-ink'
      )}
    >
      {(remainingMs / 1000).toFixed(1)}s
    </div>
  )
}

export { RoomTimer }
