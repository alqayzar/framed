import * as React from 'react'

import { useGameWorld } from '@/hooks/use-game-world'
import { runFlowLoop } from '@/lib/flows'
import { beginGameFlow } from '@/lib/game-flows'
import { CartoonButton } from '@/components/home/cartoon-button'
import { ConfirmDialog } from '@/components/waiting-room/confirm-dialog'
import { GameGrid } from '@/components/waiting-room/game-grid'
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
    gridObjects,
    myIdentity,
    gridVisible,
    movePlayer,
    moveToGrid,
    returnToLobby,
    executeFlow,
    leaveRoom,
  } = useGameWorld()
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = React.useState(false)
  const [isIdentityDialogOpen, setIsIdentityDialogOpen] = React.useState(false)

  // Drives beginGameFlow (see game-flows.ts) for as long as it keeps
  // returning true, starting once as the game screen first mounts (i.e.
  // once per game start — see startGame/returnToLobby in
  // use-game-world.tsx). executeFlow no-ops for a guest, so this runs
  // (harmlessly) regardless of role. The AbortController stops a flow
  // that's already running the instant this effect is torn down — not
  // just the next loop iteration (the `cancelled` flag only prevents
  // that) — which matters both when the screen unmounts for real (the
  // game ends) and for React StrictMode's dev-only double-invoke (mount,
  // cleanup, mount again), which would otherwise let the first, discarded
  // mount's flow keep running to completion alongside the real one.
  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    void runFlowLoop(
      () => beginGameFlow(Object.keys(players), executeFlow, controller.signal),
      () => cancelled
    )
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <main className="bg-grid flex min-h-svh flex-col overflow-x-hidden bg-white p-6">
      <div className="flex justify-end gap-3">
        {myIdentity && (
          <CartoonButton
            tone="purple"
            fullWidth={false}
            className="h-11 px-5 text-base"
            onClick={handleIdentityClick}
          >
            Identité
          </CartoonButton>
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

      <div className="flex flex-1 items-center justify-center py-16">
        {!myIdentity ? (
          // The grid must not appear before this player's own identity
          // (see myIdentity in use-game-world.tsx) has actually arrived —
          // for a guest that's an asynchronous network round trip, not
          // instant like it is for the host.
          <p className="text-lg font-bold text-game-ink">
            Attribution des identités...
          </p>
        ) : gridVisible ? (
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
            onSelectPlayer={() => {}}
          />
        ) : // Hidden by the setGridVisible flow (see flows.ts): nothing in
        // its place — the flow that hid it decides what the player is
        // told (e.g. a toast).
        null}
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
