import * as React from 'react'

import { useRoomConnection } from '@/hooks/use-room-connection'
import { useToast } from '@/hooks/use-toast'
import { GameSettingsProvider, useGameSettings } from '@/hooks/use-game-settings'
import { randomToastColors } from '@/lib/cube-colors'
import { CartoonButton } from '@/components/home/cartoon-button'
import { GameGrid } from '@/components/waiting-room/game-grid'
import { GameSettingsDialog } from '@/components/waiting-room/game-settings-dialog'
import { PlayerInfoCard } from '@/components/waiting-room/player-info-card'
import { RoomInviteDialog } from '@/components/waiting-room/room-invite-dialog'

interface WaitingRoomProps {
  role: 'host' | 'guest'
  roomCode: string
  playerId: string
  onLeave: () => void
}

function WaitingRoomContent(props: WaitingRoomProps) {
  const { settings } = useGameSettings()
  const { showToast } = useToast()
  const {
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
  } = useRoomConnection(
      props.role,
      props.roomCode,
      props.playerId,
      settings.boardSize,
      settings.boardRadius,
      settings.worldSize,
      handleRoomClosed,
      handleKicked,
      showToast
    )
  const playerCount = Object.keys(players).length
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = React.useState<string | null>(null)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = React.useState(false)

  function handleRoomClosed() {
    showToast("L'hôte a quitté la partie")
    props.onLeave()
  }

  function handleKicked() {
    showToast('Tu as été exclu de la partie')
    props.onLeave()
  }

  function handleRoomCodeClick() {
    setIsInviteDialogOpen(true)
  }

  function handleLeaveClick() {
    leaveRoom(props.onLeave)
  }

  function handleSettingsClick() {
    setIsSettingsDialogOpen(true)
  }

  function handleClosePlayerInfo() {
    setSelectedPlayerId(null)
  }

  function handleKickSelectedPlayer() {
    if (!displayedPlayerId) return
    kickPlayer(displayedPlayerId)
    setSelectedPlayerId(null)
  }

  function handlePing() {
    if (!displayedPlayerId) return
    broadcastToast([displayedPlayerId], 'Ping !', randomToastColors())
  }

  const displayedPlayerId = selectedPlayerId ?? localPlayerId
  const selectedPlayer = displayedPlayerId ? players[displayedPlayerId] : undefined
  const canKickSelectedPlayer =
    props.role === 'host' &&
    !!displayedPlayerId &&
    displayedPlayerId !== localPlayerId

  return (
    <main className="bg-grid flex min-h-svh flex-col overflow-x-hidden bg-white p-6">
      <div className="relative flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <CartoonButton
            tone="yellow"
            fullWidth={false}
            className="h-11 px-5 text-base tracking-widest"
            onClick={handleRoomCodeClick}
          >
            {props.roomCode} ({playerCount})
          </CartoonButton>
          <CartoonButton
            tone="red"
            fullWidth={false}
            className="h-11 px-5 text-base"
            onClick={handleLeaveClick}
          >
            Quitter
          </CartoonButton>
        </div>

        {selectedPlayer && (
          <div className="absolute inset-x-0 top-full z-20 mt-3">
            <PlayerInfoCard
              username={selectedPlayer.username}
              avatarUrl={displayedPlayerId ? (avatarUrls[displayedPlayerId] ?? null) : null}
              isHost={displayedPlayerId === hostPlayerId}
              canKick={canKickSelectedPlayer}
              onKick={handleKickSelectedPlayer}
              canPing={props.role === 'host'}
              onPing={handlePing}
              onClose={handleClosePlayerInfo}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center py-16">
        {settings.debugMode && (
          <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-xl border border-black/20 bg-black/20 px-3 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm">
            Move miss: {moveMissCount}
          </div>
        )}

        <GameGrid
          players={players}
          localPlayerId={localPlayerId}
          avatarUrls={avatarUrls}
          hostPlayerId={hostPlayerId}
          boardSize={settings.boardSize}
          boardRadius={settings.boardRadius}
          worldSize={settings.worldSize}
          onMove={movePlayer}
          onMoveToGrid={moveToGrid}
          onSelectPlayer={setSelectedPlayerId}
        />
      </div>

      {props.role === 'host' && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center p-4">
          <div className="flex w-full max-w-sm gap-3">
            <CartoonButton
              tone="blue"
              className="h-14 flex-1 px-6 text-base"
              onClick={handleSettingsClick}
            >
              Paramètres
            </CartoonButton>
            <CartoonButton tone="green" className="h-14 flex-1 px-8 text-base">
              Go
            </CartoonButton>
          </div>
        </div>
      )}

      <RoomInviteDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        roomCode={props.roomCode}
      />

      <GameSettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
      />
    </main>
  )
}

function WaitingRoom(props: WaitingRoomProps) {
  return (
    <GameSettingsProvider>
      <WaitingRoomContent {...props} />
    </GameSettingsProvider>
  )
}

export { WaitingRoom }
