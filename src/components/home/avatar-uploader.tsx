import * as React from 'react'
import { UserRoundIcon } from 'lucide-react'

import { AvatarPickerDialogs } from '@/components/home/avatar-picker-dialogs'
import { cn } from '@/lib/utils'

interface AvatarUploaderProps {
  imageUrl: string | null
  onFileSelected: (file: File) => void
  onEmojiSelected: (emoji: string) => void
  onRemove: () => void
  className?: string
}

function AvatarUploader(props: AvatarUploaderProps) {
  const [isPickDialogOpen, setIsPickDialogOpen] = React.useState(false)

  function handleOpenPickDialog() {
    setIsPickDialogOpen(true)
  }

  return (
    <div className={cn('relative inline-flex', props.className)}>
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-full bg-game-ink"
      />
      <button
        type="button"
        onClick={handleOpenPickDialog}
        aria-label="Changer la photo de profil"
        className="relative flex size-32 items-center justify-center overflow-hidden rounded-full border-4 border-game-ink bg-linear-to-br from-game-purple to-game-blue transition-transform active:translate-x-1.5 active:translate-y-1.5"
      >
        {props.imageUrl ? (
          <img
            src={props.imageUrl}
            alt="Photo de profil"
            className="size-full object-cover"
          />
        ) : (
          <UserRoundIcon className="size-14 text-white" strokeWidth={2.5} />
        )}
      </button>

      <AvatarPickerDialogs
        open={isPickDialogOpen}
        onOpenChange={setIsPickDialogOpen}
        hasImage={!!props.imageUrl}
        onFileSelected={props.onFileSelected}
        onEmojiSelected={props.onEmojiSelected}
        onRemove={props.onRemove}
      />
    </div>
  )
}

export { AvatarUploader }
