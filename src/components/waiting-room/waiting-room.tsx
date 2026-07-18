import * as React from 'react'

import { GameWorldProvider, useGameWorld } from '@/hooks/use-game-world'
import { RoomPeerProvider } from '@/hooks/use-room-peer'
import { useToast } from '@/hooks/use-toast'
import { GameSettingsProvider, useGameSettings } from '@/hooks/use-game-settings'
import { randomToastColors } from '@/lib/cube-colors'
import { CartoonButton } from '@/components/home/cartoon-button'
import { GameScreen } from '@/components/game/game-screen'
import { ConfirmDialog } from '@/components/waiting-room/confirm-dialog'
import { GameGrid } from '@/components/waiting-room/game-grid'
import { GameSettingsDialog } from '@/components/waiting-room/game-settings-dialog'
import { PlayerInfoCard } from '@/components/waiting-room/player-info-card'
import { PlayerListDialog } from '@/components/waiting-room/player-list-dialog'
import { RoomInviteDialog } from '@/components/waiting-room/room-invite-dialog'
import { WAIT_ROOM_WORLD, type WorldState } from '@/lib/world'

interface WaitingRoomProps {
  role: 'host' | 'guest'
  roomCode: string
  playerId: string
  onLeave: () => void
}

// Establishes the room's single PeerJS connection (see
// RoomConnectionProvider) before anything below tries to read it — the
// settings (board size/radius/world size) it needs come from
// GameSettingsProvider, which wraps this component (see WaitingRoom).
function WaitingRoomConnection(props: WaitingRoomProps) {
  const { settings } = useGameSettings()
  const { showToast } = useToast()
  const gameWorld: WorldState = {
    boardSize: settings.boardSize,
    boardRadius: settings.boardRadius,
    worldSize: settings.worldSize,
  }

  function handleRoomClosed() {
    showToast("L'hôte a quitté la partie")
    props.onLeave()
  }

  function handleKicked() {
    showToast('Tu as été exclu de la partie')
    props.onLeave()
  }

  return (
    <RoomPeerProvider role={props.role} roomCode={props.roomCode} playerId={props.playerId}>
      <GameWorldProvider
        lobbyWorld={WAIT_ROOM_WORLD}
        gameWorld={gameWorld}
        onRoomClosed={handleRoomClosed}
        onKicked={handleKicked}
        onToast={showToast}
      >
        <WaitingRoomScreen {...props} />
      </GameWorldProvider>
    </RoomPeerProvider>
  )
}

// Picks between the lobby and the actual game once the connection (and so
// gameStarted) is available from context — this must live inside
// RoomConnectionProvider, unlike WaitingRoomConnection above which renders
// that provider and so can't read from it itself.
function WaitingRoomScreen(props: WaitingRoomProps) {
  const { gameStarted } = useGameWorld()

  if (gameStarted) {
    return <GameScreen role={props.role} onLeave={props.onLeave} />
  }
  return <WaitingRoomContent {...props} />
}

function WaitingRoomContent(props: WaitingRoomProps) {
  const { settings } = useGameSettings()
  const {
    players,
    localPlayerId,
    hostPlayerId,
    avatarUrls,
    world,
    gridColors,
    gridObjects,
    moveMissCount,
    movePlayer,
    moveToGrid,
    kickPlayer,
    startGame,
    broadcastToast,
    leaveRoom,
  } = useGameWorld()
  const playerCount = Object.keys(players).length
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = React.useState<string | null>(null)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = React.useState(false)
  const [isPlayerListDialogOpen, setIsPlayerListDialogOpen] = React.useState(false)
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = React.useState(false)

  function handleRoomCodeClick() {
    setIsInviteDialogOpen(true)
  }

  function handleLeaveClick() {
    setIsLeaveConfirmOpen(true)
  }

  function handleConfirmLeave() {
    leaveRoom(props.onLeave)
  }

  function handleSettingsClick() {
    setIsSettingsDialogOpen(true)
  }

  function handleGoClick() {
    startGame()
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

  function handleOpenPlayerList() {
    setIsPlayerListDialogOpen(true)
  }

  function handlePingPlayer(playerId: string) {
    broadcastToast([playerId], 'Ping !', randomToastColors())
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
              onOpenPlayerList={handleOpenPlayerList}
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
          world={world}
          gridColors={gridColors}
          gridObjects={gridObjects}
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
            <CartoonButton
              tone="green"
              className="h-14 flex-1 px-8 text-base"
              onClick={handleGoClick}
            >
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

      <PlayerListDialog
        open={isPlayerListDialogOpen}
        onOpenChange={setIsPlayerListDialogOpen}
        players={players}
        avatarUrls={avatarUrls}
        hostPlayerId={hostPlayerId}
        localPlayerId={localPlayerId}
        isHost={props.role === 'host'}
        onPing={handlePingPlayer}
        onKick={kickPlayer}
      />

      <ConfirmDialog
        open={isLeaveConfirmOpen}
        onOpenChange={setIsLeaveConfirmOpen}
        title="Quitter la partie ?"
        confirmLabel="Quitter"
        onConfirm={handleConfirmLeave}
      />
    </main>
  )
}

function WaitingRoom(props: WaitingRoomProps) {
  return (
    <GameSettingsProvider>
      <WaitingRoomConnection {...props} />
    </GameSettingsProvider>
  )
}

export { WaitingRoom }
