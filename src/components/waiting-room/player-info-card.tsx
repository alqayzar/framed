import { Star, UserRoundIcon, XIcon } from 'lucide-react'

import { CartoonButton } from '@/components/home/cartoon-button'

interface PlayerInfoCardProps {
  username: string
  avatarUrl: string | null
  isHost: boolean
  canKick: boolean
  onKick: () => void
  onClose: () => void
}

function PlayerInfoCard(props: PlayerInfoCardProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center p-4">
      <div className="animate-in fade-in slide-in-from-bottom-2 flex w-full items-center gap-3 rounded-[2rem] border-4 border-game-ink bg-white p-2.5 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-game-ink bg-game-purple">
          {props.avatarUrl ? (
            <img
              src={props.avatarUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <UserRoundIcon className="size-5 text-white" strokeWidth={2.5} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {props.isHost && (
            <Star
              className="size-4 shrink-0 fill-(--color-game-yellow) text-(--color-game-yellow) stroke-game-ink stroke-[1.8]"
              aria-hidden="true"
            />
          )}
          <p className="truncate text-base font-black text-game-ink">
            {props.username || 'Joueur'}
          </p>
        </div>

        {props.canKick && (
          <CartoonButton
            tone="red"
            fullWidth={false}
            className="h-9 px-3 text-sm"
            onClick={props.onKick}
          >
            Virer
          </CartoonButton>
        )}

        <button
          type="button"
          onClick={props.onClose}
          aria-label="Fermer"
          className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-game-ink bg-white"
        >
          <XIcon className="size-3.5 text-game-ink" />
        </button>
      </div>
    </div>
  )
}

export { PlayerInfoCard }
