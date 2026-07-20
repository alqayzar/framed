import { Star, UserRoundIcon } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlayerActionsMenu } from '@/components/waiting-room/player-info-card'
import type { PlayersState } from '@/hooks/use-game-world'
import { CUBE_COLOR_PALETTE } from '@/lib/cube-colors'

interface PlayerListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  players: PlayersState
  avatarUrls: Record<string, string>
  hostPlayerId: string | null
  localPlayerId: string
  isHost: boolean
  onPing: (playerId: string) => void
  onKick: (playerId: string) => void
}

function PlayerListDialog(props: PlayerListDialogProps) {
  const playerEntries = Object.entries(props.players)

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            Joueurs ({playerEntries.length})
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
          {playerEntries.map(([playerId, player]) => (
            <div
              key={playerId}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className="flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2"
            >
              <div
                style={{ backgroundColor: CUBE_COLOR_PALETTE[player.color].bg }}
                className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink"
              >
                {props.avatarUrls[playerId] ? (
                  <img
                    src={props.avatarUrls[playerId]}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {playerId === props.hostPlayerId && (
                  <Star
                    className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
                    aria-hidden="true"
                  />
                )}
                <p className="truncate text-base font-black text-game-ink">
                  {player.username || 'Joueur'}
                </p>
              </div>

              {props.isHost && (
                <PlayerActionsMenu
                  canPing={true}
                  onPing={() => props.onPing(playerId)}
                  canKick={playerId !== props.localPlayerId}
                  onKick={() => props.onKick(playerId)}
                />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { PlayerListDialog }
