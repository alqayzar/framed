import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PlayerIdentity } from '@/lib/identities'
import { cn } from '@/lib/utils'

interface IdentityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  identity: PlayerIdentity | null
}

const IDENTITY_DESCRIPTIONS: Record<PlayerIdentity, string> = {
  innocent: 'Tu dois accomplir tes missions, aider les autres joueurs et éliminer les saboteurs !',
  saboteur: 'Tu dois saboter les missions des autres joueurs. Mais attention, ne te fais pas attraper !',
}

// Purely informational — no confirm/cancel, just a reminder of a secret
// only this player should ever see (see myIdentity in use-game-world.tsx).
// Near-fullscreen: this is the one dramatic reveal of the round, not a
// routine dialog, so it gets the whole window (margins aside) rather than
// a small card.
function IdentityDialog(props: IdentityDialogProps) {
  const isSaboteur = props.identity === 'saboteur'

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] max-w-none flex-col rounded-[2.5rem] border-4 border-game-ink p-8 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-8 text-center text-xl font-bold tracking-wide text-muted-foreground uppercase">
            Ton identité
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {/* No filled background — just the identity's own name in its
              color, subtle rather than a loud block. */}
          <p
            className={cn(
              'text-6xl font-black',
              isSaboteur ? 'text-game-red' : 'text-game-blue'
            )}
          >
            {isSaboteur ? 'Saboteur' : 'Innocent'}
          </p>
          {props.identity && (
            <p className="max-w-sm text-lg font-semibold text-game-ink">
              {IDENTITY_DESCRIPTIONS[props.identity]}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { IdentityDialog }
