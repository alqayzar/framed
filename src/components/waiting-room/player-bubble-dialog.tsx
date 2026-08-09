import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface PlayerBubbleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  onTeleport: () => void
}

// Opened by tapping another player's off-screen indicator bubble (see
// OffScreenPlayerBubble in game-grid.tsx) — titled with that player's
// name, and holding whatever actions target them. Just the one for now;
// the button column is meant to grow.
function PlayerBubbleDialog(props: PlayerBubbleDialogProps) {
  function handleTeleport() {
    props.onOpenChange(false)
    props.onTeleport()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            {props.username}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <CartoonButton tone="blue" className="h-14 text-lg" onClick={handleTeleport}>
            Téléporter
          </CartoonButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { PlayerBubbleDialog }
