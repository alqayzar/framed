import * as React from 'react'

import { useGameWorld } from '@/hooks/use-game-world'
import { CartoonButton } from '@/components/home/cartoon-button'
import { ConfirmDialog } from '@/components/waiting-room/confirm-dialog'
import { GameGrid } from '@/components/waiting-room/game-grid'
import { RoomTimer } from '@/components/waiting-room/room-timer'
import { IdentityDialog } from '@/components/game/identity-dialog'

interface GameScreenProps {
  role: 'host' | 'guest'
  onLeave: () => void
}

// The actual game, once the host has pressed "Go" in the waiting room —
// a deliberately separate component (not layered inside WaitingRoom) so
// the lobby-only chrome (room code, player card, settings/Go bar) doesn't
// leak in here. Reuses GameGrid as-is: the board itself doesn't change
// between the lobby and the game, only what's shown around it. Reads the
// room connection from context (see RoomConnectionProvider) instead of
// calling useRoomConnection itself, which would open a second, separate
// PeerJS connection alongside the waiting room's — including its world,
// the same WorldState the connection was created with, rather than
// re-deriving one locally from settings.
function GameScreen(props: GameScreenProps) {
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
    objectJump,
    myIdentity,
    movePlayer,
    moveToGrid,
    returnToLobby,
    leaveRoom,
    timer,
    triggerObjectAction,
    resolveObjectActionNames,
  } = useGameWorld()
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = React.useState(false)
  const [isIdentityDialogOpen, setIsIdentityDialogOpen] = React.useState(false)

  function handleLeaveClick() {
    setIsLeaveConfirmOpen(true)
  }

  // Quitting the game means different things for each role: the host owns
  // the room, so it sends everyone back to the lobby instead of ending
  // the room for them; a guest just leaves for good, same as from the
  // lobby itself.
  function handleConfirmLeave() {
    if (props.role === 'host') {
      returnToLobby()
    } else {
      leaveRoom(props.onLeave)
    }
  }

  function handleIdentityClick() {
    setIsIdentityDialogOpen(true)
  }

  return (
    <main className="bg-grid flex min-h-svh flex-col overflow-hidden bg-white p-6">
      <div className="relative z-20 flex flex-col gap-2">
        <div className="flex items-start justify-end gap-3">
          {myIdentity && (
            <div className="flex-1">
              <CartoonButton
                tone="purple"
                className="h-11 px-5 text-base"
                onClick={handleIdentityClick}
              >
                Identité
              </CartoonButton>
            </div>
          )}
          <CartoonButton
            tone="red"
            fullWidth={false}
            className="h-11 px-5 text-base"
            onClick={handleLeaveClick}
          >
            Quitter
          </CartoonButton>
        </div>
        <div className="flex justify-center">
          <RoomTimer timer={timer} />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center py-16">
        {!myIdentity ? (
          // The grid must not appear before this player's own identity
          // (see myIdentity in use-game-world.tsx) has actually arrived —
          // for a guest that's an asynchronous network round trip, not
          // instant like it is for the host.
          <p className="text-lg font-bold text-game-ink">
            Attribution des identités...
          </p>
        ) : (
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
            objectJump={objectJump}
            onMove={movePlayer}
            onMoveToGrid={moveToGrid}
            onSelectPlayer={() => {}}
            onTriggerObjectAction={triggerObjectAction}
            resolveObjectActionNames={resolveObjectActionNames}
          />
        )}
      </div>

      <ConfirmDialog
        open={isLeaveConfirmOpen}
        onOpenChange={setIsLeaveConfirmOpen}
        title={props.role === 'host' ? 'Retourner à la salle d’attente ?' : 'Quitter la partie ?'}
        description={
          props.role === 'host'
            ? 'Tous les joueurs retourneront à la salle d’attente.'
            : undefined
        }
        confirmLabel={props.role === 'host' ? 'Retourner' : 'Quitter'}
        onConfirm={handleConfirmLeave}
      />

      <IdentityDialog
        open={isIdentityDialogOpen}
        onOpenChange={setIsIdentityDialogOpen}
        identity={myIdentity}
      />
    </main>
  )
}

export { GameScreen }
