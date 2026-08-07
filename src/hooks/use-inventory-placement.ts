import * as React from 'react'

import { useGameWorld } from '@/hooks/use-game-world'
import type { InventoryItem } from '@/lib/inventory-items'
import type { CellPosition } from '@/lib/world'

// Shared by GameScreen (sandbox-only) and WaitingRoomContent (always
// available) — the Inventaire tool's selection state and the two
// handlers everything else wires up to. Each caller still owns its
// own button's visibility/position and passes placementActive to its
// own <GameGrid> however is appropriate for that screen (GameScreen
// additionally ANDs in a sandbox-mode check; the waiting room doesn't
// need to, since game mode has no effect until the game starts).
export function useInventoryPlacement() {
  const { placeItem, eraseCell } = useGameWorld()
  const [isInventoryDialogOpen, setIsInventoryDialogOpen] = React.useState(false)
  const [selectedInventoryItem, setSelectedInventoryItem] = React.useState<InventoryItem | null>(null)

  function handleInventoryClick() {
    setIsInventoryDialogOpen(true)
  }

  function handlePlaceItem(position: CellPosition) {
    if (!selectedInventoryItem) return
    if (selectedInventoryItem.kind === 'eraser') {
      eraseCell(position)
    } else {
      placeItem(position, selectedInventoryItem)
    }
  }

  return {
    isInventoryDialogOpen,
    setIsInventoryDialogOpen,
    selectedInventoryItem,
    setSelectedInventoryItem,
    handleInventoryClick,
    handlePlaceItem,
  }
}
