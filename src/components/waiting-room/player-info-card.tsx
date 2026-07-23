import * as React from 'react'
import { BellIcon, EllipsisVerticalIcon, Star, UserRoundIcon, XIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface PlayerActionsMenuProps {
  canPing: boolean
  onPing: () => void
  canKick: boolean
  onKick: () => void
}

function PlayerActionsMenu(props: PlayerActionsMenuProps) {
  if (!props.canPing && !props.canKick) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Options"
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-game-ink bg-white active:translate-x-0.5 active:translate-y-0.5"
      >
        <EllipsisVerticalIcon className="size-4 text-game-ink" strokeWidth={2.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="flex min-w-36 flex-col gap-1.5 rounded-2xl border-4 border-game-ink bg-white p-1.5 shadow-[4px_4px_0_0_var(--color-game-ink)]"
      >
        {props.canPing && (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={props.onPing}
            className="cursor-pointer justify-center gap-2 rounded-xl bg-game-blue px-2.5 py-2 text-sm font-bold text-white focus:bg-game-blue focus:text-white hover:text-white"
          >
            <BellIcon className="size-4" strokeWidth={2.5} aria-hidden="true" />
            Ping
          </DropdownMenuItem>
        )}
        {props.canKick && (
          <DropdownMenuItem
            closeOnClick={true}
            onClick={props.onKick}
            className="cursor-pointer justify-center gap-2 rounded-xl bg-game-red px-2.5 py-2 text-sm font-bold text-white focus:text-white hover:text-white focus:bg-game-red"
          >
            Virer
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface PlayerInfoCardProps {
  username: string
  avatarUrl: string | null
  isHost: boolean
  canKick: boolean
  onKick: () => void
  canPing: boolean
  onPing: () => void
  onOpenPlayerList: () => void
  onClose: () => void
  // Only provided when this card is showing the local player's own
  // avatar — clicking it then opens the profile-picture picker instead
  // of doing nothing.
  onAvatarClick?: () => void
}

function PlayerInfoCard(props: PlayerInfoCardProps) {
  function handleOpenPlayerList() {
    props.onOpenPlayerList()
  }

  function handleClose(event: React.MouseEvent) {
    event.stopPropagation()
    props.onClose()
  }

  function handleAvatarClick(event: React.MouseEvent | React.KeyboardEvent) {
    event.stopPropagation()
    props.onAvatarClick?.()
  }

  return (
    // The whole card (padding included) is the trigger; the action menu
    // and close button stop propagation so they don't also open the list.
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpenPlayerList}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleOpenPlayerList()
        }
      }}
      aria-label="Voir les joueurs"
      className="animate-in fade-in slide-in-from-top-2 flex w-full cursor-pointer items-center gap-3 rounded-[2rem] border-4 border-game-ink bg-white p-2.5 shadow-[6px_6px_0_0_var(--color-game-ink)]"
    >
      <div
        onClick={props.onAvatarClick ? handleAvatarClick : undefined}
        onKeyDown={
          props.onAvatarClick
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleAvatarClick(event)
                }
              }
            : undefined
        }
        role={props.onAvatarClick ? 'button' : undefined}
        tabIndex={props.onAvatarClick ? 0 : undefined}
        aria-label={props.onAvatarClick ? 'Changer la photo de profil' : undefined}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-game-ink bg-game-purple',
          props.onAvatarClick && 'cursor-pointer'
        )}
      >
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

      <div onClick={(event) => event.stopPropagation()}>
        <PlayerActionsMenu
          canPing={props.canPing}
          onPing={props.onPing}
          canKick={props.canKick}
          onKick={props.onKick}
        />
      </div>

      <button
        type="button"
        onClick={handleClose}
        aria-label="Fermer"
        className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-game-ink bg-white"
      >
        <XIcon className="size-3.5 text-game-ink" />
      </button>
    </div>
  )
}

export { PlayerActionsMenu, PlayerInfoCard }
