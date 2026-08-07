import * as React from 'react'
import { Circle, Square, Star, Triangle, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { buildInventoryItems, inventoryItemKey, type InventoryItem } from '@/lib/inventory-items'
import { specialCellBackground, type CellShape } from '@/lib/special-cells'
import { cn } from '@/lib/utils'

// Same shape<->icon mapping as game-grid.tsx's own SHAPE_ICONS — kept
// as a separate local copy since that one isn't exported and this is
// the only other place that needs it.
const SHAPE_ICONS: Record<CellShape, React.ComponentType<{ className?: string }>> = {
  circle: Circle,
  triangle: Triangle,
  square: Square,
  star: Star,
}

interface InventoryItemIconProps {
  item: InventoryItem
  className?: string
}

// Renders one item's icon/swatch only — no label. Used both inside the
// picker's grid and, once something is selected, as the Inventaire
// button's own content in game-screen.tsx.
function InventoryItemIcon(props: InventoryItemIconProps) {
  if (props.item.kind === 'object') {
    return <img src={props.item.iconUrl} alt="" className={cn('size-full object-contain', props.className)} />
  }
  if (props.item.kind === 'color') {
    return (
      <div
        className={cn('size-full rounded-md border-2 border-game-ink', props.className)}
        style={{ backgroundColor: specialCellBackground(props.item.color) }}
      />
    )
  }
  if (props.item.kind === 'eraser') {
    return <X className={cn('size-full text-game-red stroke-3', props.className)} />
  }
  const ShapeIcon = SHAPE_ICONS[props.item.shape]
  return (
    <ShapeIcon
      className={cn(
        'size-full fill-transparent text-game-ink stroke-2',
        props.item.shape === 'star' && 'rotate-45',
        props.className
      )}
    />
  )
}

interface InventoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedItem: InventoryItem | null
  onSelect: (item: InventoryItem | null) => void
}

const ALL_ITEMS = buildInventoryItems()

// Sandbox mode's item picker (see the Inventaire button in
// game-screen.tsx) — full-screen like IdentityDialog, since this is
// the one dialog whose whole purpose is browsing a long list rather
// than a quick glance. Selecting an item reports it up and closes
// itself, same pattern as EmojiPickerDialog.
function InventoryDialog(props: InventoryDialogProps) {
  const [search, setSearch] = React.useState('')

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return ALL_ITEMS
    return ALL_ITEMS.filter((item) => item.label.toLowerCase().includes(query))
  }, [search])

  function handleSelect(item: InventoryItem) {
    props.onSelect(item)
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        initialFocus={false}
        className="flex h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] max-w-none flex-col rounded-[2.5rem] border-4 border-game-ink p-8 shadow-[6px_6px_0_0_var(--color-game-ink)]"
      >
        <DialogHeader>
          <DialogTitle className="px-8 text-center text-xl font-bold tracking-wide text-muted-foreground uppercase">
            Inventaire
          </DialogTitle>
        </DialogHeader>

        <Input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 rounded-2xl border-2 border-game-ink px-4 text-base"
        />

        {props.selectedItem && (
          // Pinned copy of the currently-selected item — clicking it
          // deselects (unlike its regular copy further down, which
          // still appears in its normal spot and just re-selects).
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => props.onSelect(null)}
              className="flex w-28 cursor-pointer flex-col items-center gap-2 rounded-2xl border-4 border-game-blue bg-white p-3 transition-transform hover:scale-105"
            >
              <div className="size-12">
                <InventoryItemIcon item={props.selectedItem} />
              </div>
              <span className="text-center text-xs font-bold text-game-ink">{props.selectedItem.label}</span>
            </button>
          </div>
        )}

        <div className="mt-4 grid flex-1 auto-rows-min grid-cols-3 gap-3 overflow-x-hidden overflow-y-auto sm:grid-cols-4">
          {filteredItems.map((item) => (
            <button
              key={inventoryItemKey(item)}
              type="button"
              onClick={() => handleSelect(item)}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-4 border-game-ink bg-white p-3 transition-transform hover:scale-105"
            >
              <div className="size-12">
                <InventoryItemIcon item={item} />
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { InventoryDialog, InventoryItemIcon }
