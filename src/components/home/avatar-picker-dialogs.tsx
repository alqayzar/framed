import * as React from 'react'

import { CartoonButton } from '@/components/home/cartoon-button'
import { EmojiPickerDialog } from '@/components/home/emoji-picker-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AvatarPickerDialogsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasImage: boolean
  onFileSelected: (file: File) => void
  onEmojiSelected: (emoji: string) => void
  // Omit to hide "Supprimer l'image" entirely — not every caller offers
  // removal (e.g. changing an avatar mid-room only ever replaces it).
  onRemove?: () => void
}

// The actual photo/gallery/emoji picking UI, extracted out of
// AvatarUploader so it can be triggered from something other than that
// component's own big round button — e.g. clicking the small avatar
// inside PlayerInfoCard. Owns the hidden file inputs and the emoji
// dialog; the caller only owns when it's open.
function AvatarPickerDialogs(props: AvatarPickerDialogsProps) {
  const cameraInputRef = React.useRef<HTMLInputElement>(null)
  const galleryInputRef = React.useRef<HTMLInputElement>(null)
  const [isEmojiDialogOpen, setIsEmojiDialogOpen] = React.useState(false)

  function handleTakePhoto() {
    props.onOpenChange(false)
    cameraInputRef.current?.click()
  }

  function handlePickFromGallery() {
    props.onOpenChange(false)
    galleryInputRef.current?.click()
  }

  function handleOpenEmojiPicker() {
    props.onOpenChange(false)
    setIsEmojiDialogOpen(true)
  }

  function handleRemove() {
    props.onOpenChange(false)
    props.onRemove?.()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    props.onFileSelected(file)
    event.target.value = ''
  }

  return (
    <>
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

      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
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
            <CartoonButton
              tone="green"
              className="h-14 px-4 text-base whitespace-nowrap"
              onClick={handleOpenEmojiPicker}
            >
              Choisir un emoji
            </CartoonButton>
            {props.hasImage && props.onRemove && (
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

      <EmojiPickerDialog
        open={isEmojiDialogOpen}
        onOpenChange={setIsEmojiDialogOpen}
        onSelect={props.onEmojiSelected}
      />
    </>
  )
}

export { AvatarPickerDialogs }
