import * as React from 'react'
import { UserRoundIcon } from 'lucide-react'

import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface AvatarUploaderProps {
  imageUrl: string | null
  onFileSelected: (file: File) => void
  onRemove: () => void
  className?: string
}

function AvatarUploader(props: AvatarUploaderProps) {
  const cameraInputRef = React.useRef<HTMLInputElement>(null)
  const galleryInputRef = React.useRef<HTMLInputElement>(null)
  const [isPickDialogOpen, setIsPickDialogOpen] = React.useState(false)

  function handleOpenPickDialog() {
    setIsPickDialogOpen(true)
  }

  function handleTakePhoto() {
    setIsPickDialogOpen(false)
    cameraInputRef.current?.click()
  }

  function handlePickFromGallery() {
    setIsPickDialogOpen(false)
    galleryInputRef.current?.click()
  }

  function handleRemove() {
    setIsPickDialogOpen(false)
    props.onRemove()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    props.onFileSelected(file)
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
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      <Dialog open={isPickDialogOpen} onOpenChange={setIsPickDialogOpen}>
        <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
          <DialogHeader>
            <DialogTitle className="px-8 text-center text-2xl font-black text-game-ink">
              Photo de profil
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <CartoonButton
              tone="purple"
              className="h-14 px-4 text-base whitespace-nowrap"
              onClick={handleTakePhoto}
            >
              Prendre une photo
            </CartoonButton>
            <CartoonButton
              tone="blue"
              className="h-14 px-4 text-base whitespace-nowrap"
              onClick={handlePickFromGallery}
            >
              Choisir dans la galerie
            </CartoonButton>
            {props.imageUrl && (
              <CartoonButton
                tone="red"
                className="h-14 px-4 text-base whitespace-nowrap"
                onClick={handleRemove}
              >
                Supprimer l'image
              </CartoonButton>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { AvatarUploader }
