import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from '@/components/ui/emoji-picker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EmojiPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (emoji: string) => void
}

// frimousse has no popover/dialog of its own by design — it's meant to
// be composed inside one, so this wraps it in the same Dialog primitive
// AvatarUploader's own pick dialog uses.
function EmojiPickerDialog(props: EmojiPickerDialogProps) {
  function handleEmojiSelect({ emoji }: { emoji: string }) {
    props.onSelect(emoji)
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex sm:max-w-xl flex-col rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-8 text-center text-2xl font-black text-game-ink">
            Choisis un emoji
          </DialogTitle>
        </DialogHeader>

        {/* w-full overrides the base component's own w-fit (sized for
            popover use) — our dialog is a fixed width, so the picker
            should fill it instead of shrink-wrapping to one side.
            columns controls how many emoji share each row's width, i.e.
            how big each one renders (see emoji-picker.tsx's flex-1
            button). */}
        <EmojiPicker onEmojiSelect={handleEmojiSelect} columns={8} className="h-80 w-full">
          <EmojiPickerSearch />
          <EmojiPickerContent />
        </EmojiPicker>
      </DialogContent>
    </Dialog>
  )
}

export { EmojiPickerDialog }
