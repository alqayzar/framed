import * as React from 'react'

import { useRoomConnection } from '@/hooks/use-room-connection'
import { useToast } from '@/hooks/use-toast'
import { GameSettingsProvider, useGameSettings } from '@/hooks/use-game-settings'
import { randomToastColors } from '@/lib/cube-colors'
import { getObjectIconUrl, MAX_HELD_OBJECTS } from '@/lib/game-objects'
import { CartoonButton } from '@/components/home/cartoon-button'
import { GameGrid } from '@/components/waiting-room/game-grid'
import { GameSettingsDialog } from '@/components/waiting-room/game-settings-dialog'
import { PlayerInfoCard } from '@/components/waiting-room/player-info-card'
import { PlayerListDialog } from '@/components/waiting-room/player-list-dialog'
import { RoomInviteDialog } from '@/components/waiting-room/room-invite-dialog'
import { WAIT_ROOM_BOARD_RADIUS, WAIT_ROOM_BOARD_SIZE, WAIT_ROOM_WORLD_SIZE } from '@/lib/board'

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
    gridColors,
    gridObjects,
    moveMissCount,
    movePlayer,
    moveToGrid,
    pickUpObject,
    dropObject,
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
  const [isPlayerListDialogOpen, setIsPlayerListDialogOpen] = React.useState(false)

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

  const localPlayer = localPlayerId ? players[localPlayerId] : undefined
  const standingObject = localPlayer
    ? gridObjects.find(
        (object) => object.position.x === localPlayer.position.x && object.position.y === localPlayer.position.y
      )
    : undefined
  // Local-only preview: only offered while a hand slot is free — see
  // GameGrid's previewObject prop doc for why this never touches synced
  // state until the take button is actually pressed.
  const previewObject =
    standingObject && localPlayer && localPlayer.heldObjects.length < MAX_HELD_OBJECTS ? standingObject : null
  const heldObjects = localPlayer?.heldObjects ?? []
  const showBottomBar = props.role === 'host' || heldObjects.length > 0 || !!previewObject

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
          boardSize={WAIT_ROOM_BOARD_SIZE}
          boardRadius={WAIT_ROOM_BOARD_RADIUS}
          worldSize={WAIT_ROOM_WORLD_SIZE}
          gridColors={gridColors}
          gridObjects={gridObjects}
          previewObject={previewObject}
          onMove={movePlayer}
          onMoveToGrid={moveToGrid}
          onSelectPlayer={setSelectedPlayerId}
        />
      </div>

      {showBottomBar && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col-reverse items-center gap-3 p-4">
          {props.role === 'host' && (
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
          )}

          {heldObjects.length > 0 && (
            <div className="flex gap-3">
              {heldObjects.map((heldObject) => (
                <CartoonButton
                  key={heldObject.id}
                  tone="purple"
                  fullWidth={false}
                  className="h-14 w-14 px-0"
                  onClick={() => dropObject(heldObject.id)}
                >
                  <img src={getObjectIconUrl(heldObject.type)} alt="" className="h-9 w-9 object-contain" />
                </CartoonButton>
              ))}
            </div>
          )}

          {previewObject && (
            <CartoonButton
              tone="yellow"
              fullWidth={false}
              className="h-14 px-6 text-base"
              onClick={() => pickUpObject(previewObject.id)}
            >
              Prendre
              <img src={getObjectIconUrl(previewObject.type)} alt="" className="h-8 w-8 object-contain" />
            </CartoonButton>
          )}
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
