import * as React from 'react'

import { DEFAULT_GAME_SETTINGS, type GameSettings } from '@/lib/game-settings'

interface GameSettingsContextValue {
  settings: GameSettings
  setSettings: (settings: GameSettings) => void
}

const GameSettingsContext = React.createContext<GameSettingsContextValue | null>(null)

interface GameSettingsProviderProps {
  children: React.ReactNode
}

function GameSettingsProvider(props: GameSettingsProviderProps) {
  const [settings, setSettings] = React.useState<GameSettings>(DEFAULT_GAME_SETTINGS)

  const value = React.useMemo(() => ({ settings, setSettings }), [settings])

  return (
    <GameSettingsContext.Provider value={value}>
      {props.children}
    </GameSettingsContext.Provider>
  )
}

function useGameSettings(): GameSettingsContextValue {
  const context = React.useContext(GameSettingsContext)
  if (!context) throw new Error('useGameSettings must be used within a GameSettingsProvider')
  return context
}

export { GameSettingsProvider, useGameSettings }
