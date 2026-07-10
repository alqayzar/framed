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
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-full bg-game-ink"
      />
      <button
        type="button"
        onClick={handlePick}
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
      <span className="pointer-events-none absolute right-0 bottom-0 flex size-11 items-center justify-center rounded-full border-4 border-game-ink bg-game-orange">
        <CameraIcon className="size-5 text-white" strokeWidth={2.5} />
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
