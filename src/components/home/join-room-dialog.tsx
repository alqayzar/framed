import * as React from 'react'

import { CartoonButton } from '@/components/home/cartoon-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface JoinRoomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function JoinRoomDialog(props: JoinRoomDialogProps) {
  const [code, setCode] = React.useState('')

  function handleCodeChange(event: React.ChangeEvent<HTMLInputElement>) {
    setCode(event.target.value.toUpperCase().slice(0, 6))
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xs rounded-3xl border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-2xl font-black text-game-ink">
            Rejoindre une partie
          </DialogTitle>
          <DialogDescription className="text-center">
            Entre le code partagé par l'hôte.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={code}
          onChange={handleCodeChange}
          maxLength={6}
          placeholder="ABC123"
          autoComplete="off"
          className="h-14 rounded-2xl border-[3px] border-game-ink bg-white text-center text-2xl font-black tracking-[0.3em] text-game-ink placeholder:text-muted-foreground/40 focus-visible:ring-game-blue/40"
        />
        <CartoonButton tone="green" className="h-12 text-base">
          Rejoindre
        </CartoonButton>
      </DialogContent>
    </Dialog>
  )
}

export { JoinRoomDialog }
