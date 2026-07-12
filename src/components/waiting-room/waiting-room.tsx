import * as React from 'react'

import { useRoomConnection } from '@/hooks/use-room-connection'
import { useToast } from '@/hooks/use-toast'
import { CartoonButton } from '@/components/home/cartoon-button'
import { GameGrid } from '@/components/waiting-room/game-grid'
import { RoomInviteDialog } from '@/components/waiting-room/room-invite-dialog'

interface WaitingRoomProps {
  role: 'host' | 'guest'
  roomCode: string
  onLeave: () => void
}

function WaitingRoom(props: WaitingRoomProps) {
  const { showToast } = useToast()
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false)

  function handleRoomClosed() {
    showToast("L'hôte a quitté la partie")
    props.onLeave()
  }

  function handleKicked() {
    showToast('Tu as été exclu de la partie')
    props.onLeave()
  }

  const { players, localPlayerId, avatarUrls, movePlayer, kickPlayer, leaveRoom } =
    useRoomConnection(props.role, props.roomCode, handleRoomClosed, handleKicked)
  const playerCount = Object.keys(players).length

  function handleRoomCodeClick() {
    setIsInviteDialogOpen(true)
  }

  function handleLeaveClick() {
    leaveRoom(props.onLeave)
  }

  return (
    <main className="bg-grid flex min-h-svh flex-col overflow-x-hidden bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-2">
          <CartoonButton
            tone="yellow"
            fullWidth={false}
            className="h-11 px-5 text-base tracking-[0.3em]"
            onClick={handleRoomCodeClick}
          >
            {props.roomCode}
          </CartoonButton>
          <p className="text-lg font-bold text-game-ink">
            Joueurs ({playerCount})
          </p>
        </div>
        <CartoonButton
          tone="red"
          fullWidth={false}
          className="h-11 px-5 text-base"
          onClick={handleLeaveClick}
        >
          Quitter
        </CartoonButton>
      </div>

      <div className="flex flex-1 items-center justify-center py-16">
        <GameGrid
          players={players}
          localPlayerId={localPlayerId}
          avatarUrls={avatarUrls}
          hostPlayerId={props.roomCode}
          isLocalPlayerHost={props.role === 'host'}
          onMove={movePlayer}
          onKickPlayer={kickPlayer}
        />
      </div>

      <RoomInviteDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        roomCode={props.roomCode}
      />
    </main>
  )
}

export { WaitingRoom }
