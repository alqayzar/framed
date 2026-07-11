import { QRCodeSVG } from 'qrcode.react'

import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

interface RoomInviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomCode: string
}

function RoomInviteDialog(props: RoomInviteDialogProps) {
  const { showToast } = useToast()
  const joinUrl = `${window.location.origin}/join?code=${props.roomCode}`

  function handleCopyCode() {
    void navigator.clipboard.writeText(props.roomCode)
    showToast('Copié')
    props.onOpenChange(false)
  }

  function handleCopyLink() {
    void navigator.clipboard.writeText(joinUrl)
    showToast('Copié')
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            Inviter
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Scanne le code ou partage le lien.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center rounded-3xl border-4 border-game-ink bg-white p-4">
          <QRCodeSVG value={joinUrl} size={180} />
        </div>

        <div className="flex flex-col gap-3">
          <CartoonButton
            tone="yellow"
            className="h-14 text-lg"
            onClick={handleCopyCode}
          >
            Copier le code
          </CartoonButton>
          <CartoonButton
            tone="blue"
            className="h-14 text-lg"
            onClick={handleCopyLink}
          >
            Copier le lien
          </CartoonButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { RoomInviteDialog }
