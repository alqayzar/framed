import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
}

// Generic yes/no confirmation, styled like the room's other dialogs (see
// RoomInviteDialog) — used wherever an action shouldn't fire on a single
// accidental tap (leaving the room, returning everyone to the lobby, ...).
function ConfirmDialog(props: ConfirmDialogProps) {
  function handleConfirm() {
    props.onOpenChange(false)
    props.onConfirm()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-8 text-center text-2xl font-black text-game-ink">
            {props.title}
          </DialogTitle>
          {props.description && (
            <DialogDescription className="text-center text-base">
              {props.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <CartoonButton tone="red" className="h-14 text-lg" onClick={handleConfirm}>
            {props.confirmLabel}
          </CartoonButton>
          <CartoonButton
            tone="blue"
            className="h-14 text-lg"
            onClick={() => props.onOpenChange(false)}
          >
            {props.cancelLabel ?? 'Annuler'}
          </CartoonButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
