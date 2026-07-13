import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useGameSettings } from '@/hooks/use-game-settings'

interface GameSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GameSettingsDialog(props: GameSettingsDialogProps) {
  const { settings, setSettings } = useGameSettings()

  function handleDebugModeChange(checked: boolean) {
    setSettings({ ...settings, debugMode: checked })
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]">
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            Paramètres
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="px-1 text-sm font-black tracking-wide text-muted-foreground uppercase">
            Avancées
          </p>
          <label className="flex items-center justify-between gap-3 rounded-2xl border-4 border-game-ink bg-white px-4 py-3">
            <span className="text-base font-bold text-game-ink">
              Mode debug
            </span>
            <Checkbox
              checked={settings.debugMode}
              onCheckedChange={handleDebugModeChange}
              className="size-6 rounded-md border-2 border-game-ink data-checked:bg-game-green data-checked:text-white"
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { GameSettingsDialog }
