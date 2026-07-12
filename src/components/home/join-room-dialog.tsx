import * as React from 'react'
import { CameraIcon } from 'lucide-react'
import QrScanner from 'qr-scanner'

import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { extractRoomCodeFromLink } from '@/lib/room-code'

interface JoinRoomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoin: (code: string) => void
}

function JoinRoomDialog(props: JoinRoomDialogProps) {
  const [code, setCode] = React.useState('')
  const [isScanning, setIsScanning] = React.useState(false)
  const [lastScanText, setLastScanText] = React.useState<string | null>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  React.useEffect(() => {
    if (!props.open) setIsScanning(false)
  }, [props.open])

  React.useEffect(() => {
    if (!isScanning || !videoRef.current) return

    setLastScanText(null)

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        setLastScanText(result.data)
        const scannedCode = extractRoomCodeFromLink(result.data)
        if (scannedCode) {
          setCode(scannedCode)
          setIsScanning(false)
        }
      },
      { highlightScanRegion: true, highlightCodeOutline: true }
    )

    void scanner.start().catch(() => {
      setLastScanText('Impossible d’accéder à la caméra.')
      setIsScanning(false)
    })

    return () => {
      scanner.stop()
      scanner.destroy()
    }
  }, [isScanning])

  function handleCodeChange(event: React.ChangeEvent<HTMLInputElement>) {
    setCode(event.target.value.toUpperCase().slice(0, 6))
  }

  function handleJoinClick() {
    props.onJoin(code)
  }

  function handleStartScan() {
    setIsScanning(true)
  }

  function handleStopScan() {
    setIsScanning(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            Rejoindre
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            {isScanning
              ? 'Scanne le QR code de la partie.'
              : 'Rejoingez une partie en entrant un code.'}
          </DialogDescription>
        </DialogHeader>

        {isScanning ? (
          <React.Fragment key="scanning">
            <video
              ref={videoRef}
              className="aspect-square w-full rounded-3xl border-4 border-game-ink object-cover"
              muted
              playsInline
            />
            <p className="truncate text-center text-sm font-semibold text-muted-foreground">
              {lastScanText ? `${lastScanText}` : 'En attente d’un QR code…'}
            </p>
            <CartoonButton
              tone="red"
              className="h-14 text-xl"
              onClick={handleStopScan}
            >
              Annuler
            </CartoonButton>
          </React.Fragment>
        ) : (
          <React.Fragment key="idle">
            <Input
              value={code}
              onChange={handleCodeChange}
              maxLength={6}
              placeholder="ABC123"
              autoComplete="off"
              className="h-16 rounded-full border-4 border-game-ink bg-white text-center text-3xl font-black tracking-[0.3em] text-game-ink placeholder:text-muted-foreground/40 focus-visible:ring-game-blue/40"
            />
            <CartoonButton
              tone="green"
              className="h-14 text-xl"
              disabled={code.length !== 6}
              onClick={handleJoinClick}
            >
              Rejoindre
            </CartoonButton>
            <CartoonButton
              tone="blue"
              className="h-12 text-base"
              onClick={handleStartScan}
            >
              <CameraIcon className="size-5" strokeWidth={2.5} />
              Scanner un QR code
            </CartoonButton>
          </React.Fragment>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { JoinRoomDialog }
