import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useGameSettings } from '@/hooks/use-game-settings'
import type { GameSettings } from '@/lib/game-settings'

interface GameSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SettingsSectionProps {
  title: string
  children: React.ReactNode
}

function SettingsSection(props: SettingsSectionProps) {
  return (
    <Collapsible defaultOpen className="flex flex-col gap-2">
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between px-1 py-1 text-sm font-black tracking-wide text-muted-foreground uppercase">
        {props.title}
        <ChevronDownIcon className="size-4 transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex h-(--collapsible-panel-height) flex-col gap-2 overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        {props.children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function GameSettingsDialog(props: GameSettingsDialogProps) {
  const { settings, setSettings } = useGameSettings()

  function handleDebugModeChange(checked: boolean) {
    setSettings({ ...settings, debugMode: checked })
  }

  function handleNumberChange(key: keyof Omit<GameSettings, 'debugMode'>) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value)
      if (!Number.isInteger(value) || value < 1) return
      setSettings({ ...settings, [key]: value })
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        initialFocus={false}
        className="max-w-xs rounded-[2.5rem] border-4 border-game-ink p-6 shadow-[6px_6px_0_0_var(--color-game-ink)]"
      >
        <DialogHeader>
          <DialogTitle className="px-4 text-center text-3xl font-black text-game-ink">
            Paramètres
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto">
          <SettingsSection title="Grille">
            <label className="flex items-center justify-between gap-3 rounded-2xl border-4 border-game-ink bg-white px-4 py-3">
              <span className="text-base font-bold text-game-ink">
                Taille du plateau
              </span>
              <Input
                type="number"
                min={1}
                step={1}
                value={settings.boardSize}
                onChange={handleNumberChange('boardSize')}
                className="h-9 w-16 rounded-xl border-2 border-game-ink text-center text-base font-bold text-game-ink"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-2xl border-4 border-game-ink bg-white px-4 py-3">
              <span className="text-base font-bold text-game-ink">
                Rayon du plateau
              </span>
              <Input
                type="number"
                min={1}
                step={1}
                value={settings.boardRadius}
                onChange={handleNumberChange('boardRadius')}
                className="h-9 w-16 rounded-xl border-2 border-game-ink text-center text-base font-bold text-game-ink"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-2xl border-4 border-game-ink bg-white px-4 py-3">
              <span className="text-base font-bold text-game-ink">
                Taille du monde
              </span>
              <Input
                type="number"
                min={1}
                step={1}
                value={settings.worldSize}
                onChange={handleNumberChange('worldSize')}
                className="h-9 w-16 rounded-xl border-2 border-game-ink text-center text-base font-bold text-game-ink"
              />
            </label>
          </SettingsSection>

          <SettingsSection title="Avancées">
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
          </SettingsSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { GameSettingsDialog }
