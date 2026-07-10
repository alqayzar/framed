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
      <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            Rejoindre une partie
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Entre le code partagé par l'hôte.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={code}
          onChange={handleCodeChange}
          maxLength={6}
          placeholder="ABC123"
          autoComplete="off"
          className="h-16 rounded-full border-4 border-game-ink bg-white text-center text-3xl font-black tracking-[0.3em] text-game-ink placeholder:text-muted-foreground/40 focus-visible:ring-game-blue/40"
        />
        <CartoonButton tone="green" className="h-14 text-xl">
          Rejoindre
        </CartoonButton>
      </DialogContent>
    </Dialog>
  )
}

export { JoinRoomDialog }
