import * as React from 'react'
import { Star, UserRoundIcon } from 'lucide-react'

import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlayerActionsMenu } from '@/components/waiting-room/player-info-card'
import type { PlayersState } from '@/hooks/use-game-world'
import { CUBE_COLOR_PALETTE } from '@/lib/cube-colors'
import { cn } from '@/lib/utils'

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
  // Opens RoomInviteDialog (QR code + copy code/link) — this dialog is
  // the only way there now, see handleOpenInvite in waiting-room.tsx.
  onInvite: () => void
  roomCode: string
  // Row to visually pick out and scroll to — set when the dialog was
  // opened by long-pressing that player's cube (see PlayerCube in
  // game-grid.tsx). Null/absent when opened from the room-code button.
  highlightedPlayerId?: string | null
}

function PlayerListDialog(props: PlayerListDialogProps) {
  const playerEntries = Object.entries(props.players)
  // The list is capped at max-h-[60vh], so the highlighted player can
  // easily be below the fold on a busy room.
  const highlightedRowRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!props.open || !props.highlightedPlayerId) return
    highlightedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [props.open, props.highlightedPlayerId])

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
              ref={playerId === props.highlightedPlayerId ? highlightedRowRef : undefined}
              style={{
                backgroundColor: `color-mix(in srgb, ${CUBE_COLOR_PALETTE[player.color].bg} 30%, white)`,
              }}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-4 border-game-ink p-2',
                // Border colour only — same width, so the row doesn't
                // shift. Purple reads against every row background,
                // which is always that player's own colour mixed pale
                // with white.
                playerId === props.highlightedPlayerId && 'border-game-purple'
              )}
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

        <div className="flex flex-col gap-3">
          Inviter des joueurs
          <CartoonButton tone="yellow" className="h-14 text-lg" onClick={props.onInvite}>
            {props.roomCode}
          </CartoonButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { PlayerListDialog }
