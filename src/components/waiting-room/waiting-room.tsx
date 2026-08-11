import * as React from 'react'
import { Move } from 'lucide-react'

import { GameWorldProvider, useGameWorld } from '@/hooks/use-game-world'
import { useInventoryPlacement } from '@/hooks/use-inventory-placement'
import { RoomPeerProvider } from '@/hooks/use-room-peer'
import { TOAST_LIFETIME_INFINITE, useToast } from '@/hooks/use-toast'
import { GameSettingsProvider, useGameSettings } from '@/hooks/use-game-settings'
import { compressImage } from '@/lib/compress-image'
import { randomToastColors } from '@/lib/cube-colors'
import {
  ActionMoveObjectToCell,
  pickRandomCellShape,
  pickRandomCubeColor,
  pickRandomObjectType,
} from '@/lib/game-actions'
import { renderEmojiAvatar } from '@/lib/render-emoji-avatar'
import { AvatarPickerDialogs } from '@/components/home/avatar-picker-dialogs'
import { CartoonButton } from '@/components/home/cartoon-button'
import { GameScreen } from '@/components/game/game-screen'
import { InventoryDialog, InventoryItemIcon } from '@/components/game/inventory-dialog'
import { ConfirmDialog } from '@/components/waiting-room/confirm-dialog'
import { GameGrid } from '@/components/waiting-room/game-grid'
import { GameSettingsDialog } from '@/components/waiting-room/game-settings-dialog'
import { PlayerListDialog } from '@/components/waiting-room/player-list-dialog'
import { RoomInviteDialog } from '@/components/waiting-room/room-invite-dialog'
import { RoomTimer } from '@/components/waiting-room/room-timer'
import { WAIT_ROOM_WORLD } from '@/lib/world'

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
  const { showToast, clearToasts } = useToast()

  // Room-scoped toasts (pings, the TEMP test toasts, etc.) shouldn't
  // linger once we've left — this fires on every way of leaving the
  // room, since they all unmount this component. sticky toasts (see
  // handleRoomClosed/handleKicked below) are exempt, so an informative
  // farewell message still shows up on the next screen.
  React.useEffect(() => {
    return () => clearToasts()
  }, [clearToasts])

  function handleRoomClosed() {
    showToast("L'hôte a quitté la partie", { sticky: true })
    props.onLeave()
  }

  function handleKicked() {
    showToast('Tu as été exclu de la partie', { sticky: true })
    props.onLeave()
  }

  return (
    <RoomPeerProvider role={props.role} roomCode={props.roomCode} playerId={props.playerId}>
      <GameWorldProvider
        lobbyWorld={WAIT_ROOM_WORLD}
        saboteurCount={settings.saboteurCount}
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
    sharedSettings,
    gridObjects,
    specialCells,
    specialCellShake,
    objectJumps,
    moveMissCount,
    movePlayer,
    moveToGrid,
    teleportToPlayer,
    kickPlayer,
    startGame,
    broadcastToast,
    timer,
    startTimer,
    startAction,
    verifyAction,
    actionsContext,
    triggerObjectAction,
    resolveObjectActionNames,
    updateAvatar,
    leaveRoom,
  } = useGameWorld()
  const {
    isInventoryDialogOpen,
    setIsInventoryDialogOpen,
    selectedInventoryItem,
    setSelectedInventoryItem,
    handleInventoryClick,
    handlePlaceItem,
  } = useInventoryPlacement()
  const playerCount = Object.keys(players).length
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false)
  // Which player's row PlayerListDialog should pick out — set by
  // long-pressing their cube, cleared when the list is opened any other
  // way (see handleSelectPlayer/handleOpenPlayerList).
  const [selectedPlayerId, setSelectedPlayerId] = React.useState<string | null>(null)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = React.useState(false)
  // "Caméra" button (see the top-full strip below, mirrored to the
  // right of Inventaire) — free camera pan mode, owned here since
  // GameGrid just needs the boolean; the pan itself is internal state
  // there (see freeCameraActive's own doc on GameGridProps).
  const [freeCameraActive, setFreeCameraActive] = React.useState(false)
  const [isPlayerListDialogOpen, setIsPlayerListDialogOpen] = React.useState(false)
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = React.useState(false)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = React.useState(false)

  // The room code is the only way into the players list, and the list is
  // in turn the only way to the invite dialog (see handleOpenInvite).
  function handleRoomCodeClick() {
    handleOpenPlayerList()
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
    if (sharedSettings.mode === 'sandbox') {
      startSandboxRound()
    } else {
      startFramedRound()
    }
  }

  // Sandbox has no objective/timer — nothing else to do once the world
  // itself has been (re)generated by startGame.
  function startSandboxRound() {}

  function startFramedRound() {
    const moveObjectInstances = Object.fromEntries(
      Object.keys(players).map((playerId) => {
        const colorOrShape : boolean = Math.floor(Math.random() * 2) == 0;
        const instance = ActionMoveObjectToCell.createInstance({
          objectType: pickRandomObjectType(),
          color: colorOrShape ? pickRandomCubeColor() : undefined,
          shape: !colorOrShape ? pickRandomCellShape() : undefined,
          getSpecialCells: actionsContext.getSpecialCells,
        })
        startAction(instance)
        broadcastToast(instance.label, { playerIds: [playerId], durationMs: TOAST_LIFETIME_INFINITE });
        return [playerId, instance]
      })
    )

    startTimer(60000, async () => {
      const results = await Promise.all(
        Object.entries(moveObjectInstances).map(async ([playerId, instance]) => ({
          playerId,
          completed: await verifyAction(instance),
        }))
      )
      const completedPlayerIds = results.filter((r) => r.completed).map((r) => r.playerId)
      if (completedPlayerIds.length > 0) {
        broadcastToast('Action terminée !', { playerIds: completedPlayerIds })
      }
    })
  }

  function handleOpenPlayerList() {
    // Opened without a specific player in mind, so drop any highlight
    // left over from a previous long press.
    setSelectedPlayerId(null)
    setIsPlayerListDialogOpen(true)
  }

  // Long-pressing a player's cube (see PlayerCube in game-grid.tsx)
  // opens the list already pointing at them.
  function handleSelectPlayer(playerId: string) {
    setSelectedPlayerId(playerId)
    setIsPlayerListDialogOpen(true)
  }

  // Closes the list first rather than stacking two modals — nested
  // dialogs fight over focus trapping and Escape handling. Same
  // close-then-act order the other dialogs use (see ConfirmDialog's
  // handleConfirm, RoomInviteDialog's copy handlers).
  function handleOpenInvite() {
    setIsPlayerListDialogOpen(false)
    setIsInviteDialogOpen(true)
  }

  function handlePingPlayer(playerId: string) {
    broadcastToast('Ping !', { playerIds: [playerId], colors: randomToastColors() })
  }

  async function handleAvatarFileSelected(file: File) {
    updateAvatar(await compressImage(file))
  }

  async function handleAvatarEmojiSelected(emoji: string) {
    updateAvatar(await renderEmojiAvatar(emoji))
  }

  return (
    <main className="bg-grid flex min-h-svh flex-col overflow-hidden bg-white p-6">
      <div className="pointer-events-none relative z-20 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <CartoonButton
            tone="yellow"
            fullWidth={false}
            className="pointer-events-auto h-11 px-5 text-base tracking-widest"
            onClick={handleRoomCodeClick}
          >
            {props.roomCode} ({playerCount})
          </CartoonButton>
          <div className="flex flex-1 justify-center pt-1">
            <RoomTimer timer={timer} />
          </div>
          <CartoonButton
            tone="red"
            fullWidth={false}
            className="pointer-events-auto h-11 px-5 text-base"
            onClick={handleLeaveClick}
          >
            Quitter
          </CartoonButton>
        </div>

        {/* Always rendered (unlike PlayerInfoCard alone before it) so the
            Inventaire button — a persistent tool, not tied to player
            selection — is always available; PlayerInfoCard, when
            present, is a flex-col sibling above it, so normal flow +
            gap puts the button right below the card's actual bottom
            edge, whatever that happens to be, instead of a guessed
            offset. */}
        <div className="pointer-events-none absolute inset-x-0 top-full z-20 mt-3 flex flex-col items-start gap-3">
          {/* {selectedPlayer && (
            <div className="pointer-events-auto w-full">
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
                onAvatarClick={displayedPlayerId === localPlayerId ? handleAvatarClick : undefined}
              />
            </div>
          )} */}
          <div className="pointer-events-none w-full flex items-center justify-between">
            <CartoonButton
              tone="white"
              fullWidth={false}
              className="h-11 px-5 text-base pointer-events-auto"
              onClick={handleInventoryClick}
            >
              {selectedInventoryItem ? (
                <span className="size-7">
                  <InventoryItemIcon item={selectedInventoryItem} />
                </span>
              ) : (
                'Inventaire'
              )}
            </CartoonButton>
            <CartoonButton
              tone={freeCameraActive ? 'blue' : 'white'}
              fullWidth={false}
              className="h-11 px-3 text-base pointer-events-auto"
              aria-label="Déplacer la caméra"
              onClick={() => setFreeCameraActive((active) => !active)}
            >
              <Move className="size-5" />
            </CartoonButton>
          </div>
        </div>
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
          viewBoardSize={sharedSettings.viewBoardSize}
          gridColors={gridColors}
          gridObjects={gridObjects}
          specialCells={specialCells}
          specialCellShake={specialCellShake}
          objectJumps={objectJumps}
          onMove={movePlayer}
          onMoveToGrid={moveToGrid}
          onSelectPlayer={handleSelectPlayer}
          onTeleportToPlayer={teleportToPlayer}
          onTriggerObjectAction={triggerObjectAction}
          resolveObjectActionNames={resolveObjectActionNames}
          placementActive={selectedInventoryItem !== null}
          onPlaceItem={handlePlaceItem}
          freeCameraActive={freeCameraActive}
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
        onInvite={handleOpenInvite}
        roomCode={props.roomCode}
        highlightedPlayerId={selectedPlayerId}
      />

      <ConfirmDialog
        open={isLeaveConfirmOpen}
        onOpenChange={setIsLeaveConfirmOpen}
        title="Quitter la partie ?"
        confirmLabel="Quitter"
        onConfirm={handleConfirmLeave}
      />

      <AvatarPickerDialogs
        open={isAvatarPickerOpen}
        onOpenChange={setIsAvatarPickerOpen}
        hasImage={!!avatarUrls[localPlayerId]}
        onFileSelected={handleAvatarFileSelected}
        onEmojiSelected={handleAvatarEmojiSelected}
      />

      <InventoryDialog
        open={isInventoryDialogOpen}
        onOpenChange={setIsInventoryDialogOpen}
        selectedItem={selectedInventoryItem}
        onSelect={setSelectedInventoryItem}
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
