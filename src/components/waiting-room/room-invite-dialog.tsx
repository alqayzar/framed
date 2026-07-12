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
  const joinUrl = (() => {
    const url = new URL(window.location.href)
    url.hash = `#/join?code=${props.roomCode}`
    return url.toString()
  })()

  async function copyText(text: string) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (error) {
        console.error('Clipboard write failed', error)
      }
    }

    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.setAttribute('readonly', '')
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    document.body.appendChild(textArea)
    textArea.select()

    try {
      const wasCopied = document.execCommand('copy')
      return wasCopied
    } catch (error) {
      console.error('Fallback clipboard copy failed', error)
      return false
    } finally {
      document.body.removeChild(textArea)
    }
  }

  async function handleCopyCode() {
    const copied = await copyText(props.roomCode)
    if (copied) {
      showToast('Copié')
      props.onOpenChange(false)
    } else {
      showToast('Impossible de copier')
    }
  }

  async function handleCopyLink() {
    const copied = await copyText(joinUrl)
    if (copied) {
      showToast('Copié')
      props.onOpenChange(false)
    } else {
      showToast('Impossible de copier')
    }
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
