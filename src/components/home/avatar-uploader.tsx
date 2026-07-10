import * as React from 'react'
import { CameraIcon, UserRoundIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface AvatarUploaderProps {
  imageUrl: string | null
  onImageChange: (url: string) => void
  className?: string
}

function AvatarUploader(props: AvatarUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const url = props.imageUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [props.imageUrl])

  function handlePick() {
    inputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    props.onImageChange(URL.createObjectURL(file))
    event.target.value = ''
  }

  return (
    <div className={cn('relative inline-flex', props.className)}>
      <button
        type="button"
        onClick={handlePick}
        aria-label="Changer la photo de profil"
        className="flex size-28 items-center justify-center overflow-hidden rounded-full border-4 border-game-ink bg-gradient-to-br from-game-purple to-game-pink shadow-[4px_4px_0_0_var(--color-game-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--color-game-ink)]"
      >
        {props.imageUrl ? (
          <img
            src={props.imageUrl}
            alt="Photo de profil"
            className="size-full object-cover"
          />
        ) : (
          <UserRoundIcon className="size-12 text-white" strokeWidth={2.5} />
        )}
      </button>
      <span className="pointer-events-none absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full border-[3px] border-game-ink bg-game-yellow">
        <CameraIcon className="size-4 text-game-ink" strokeWidth={2.5} />
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />
    </div>
  )
}

export { AvatarUploader }
