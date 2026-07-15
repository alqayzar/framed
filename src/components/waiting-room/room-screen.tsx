import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { WaitingRoom } from '@/components/waiting-room/waiting-room'
import { clearRoomInfo, loadRoomInfo, type StoredRoomInfo } from '@/lib/room-store'

function RoomScreen() {
  const navigate = useNavigate()
  const [roomInfo, setRoomInfo] = React.useState<StoredRoomInfo | null>(null)

  React.useEffect(() => {
    let cancelled = false
    loadRoomInfo().then((info) => {
      if (cancelled) return
      if (!info) {
        navigate('/', { replace: true })
        return
      }
      setRoomInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  function handleLeave() {
    void clearRoomInfo()
    navigate('/')
  }

  if (!roomInfo) return null

  return (
    <WaitingRoom
      role={roomInfo.role}
      roomCode={roomInfo.code}
      playerId={roomInfo.playerId}
      onLeave={handleLeave}
    />
  )
}

export { RoomScreen }
