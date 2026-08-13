import { CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'
import { getObjectItemVariants, getObjectLabel, OBJECT_TYPES, type ObjectType } from '@/lib/game-objects'
import { CELL_SHAPES, type CellShape } from '@/lib/special-cells'

// Sandbox mode's Inventaire picker (see inventory-dialog.tsx) — every
// pickable item is one of these four kinds. Placement-on-the-board
// logic (use-game-world.tsx's placeItem/eraseCell) consumes whichever
// one gets selected — 'eraser' has no placement payload of its own,
// it routes to eraseCell instead of placeItem (see game-screen.tsx).
export type InventoryItem =
  | { kind: 'object'; type: ObjectType; variant?: string; iconUrl: string; label: string }
  | { kind: 'color'; color: CubeColor; label: string }
  | { kind: 'shape'; shape: CellShape; label: string }
  | { kind: 'eraser'; label: string }

export const ERASER_ITEM: InventoryItem = { kind: 'eraser', label: 'Croix' }

// Unique per item, for list keys and for comparing against the
// currently-selected item (see InventoryDialog's pinned row).
export function inventoryItemKey(item: InventoryItem): string {
  if (item.kind === 'object') return `object-${item.type}${item.variant !== undefined ? `-${item.variant}` : ''}`
  if (item.kind === 'color') return `color-${item.color}`
  if (item.kind === 'shape') return `shape-${item.shape}`
  return 'eraser'
}

const CUBE_COLOR_LABELS: Record<CubeColor, string> = {
  red: 'Rouge',
  purple: 'Violet',
  green: 'Vert',
  blue: 'Bleu',
  orange: 'Orange',
  yellow: 'Jaune',
  pink: 'Rose',
  teal: 'Sarcelle',
  lime: 'Citron vert',
  indigo: 'Indigo',
}

const CELL_SHAPE_LABELS: Record<CellShape, string> = {
  circle: 'Cercle',
  triangle: 'Triangle',
  square: 'Carré',
  star: 'Étoile',
}

export function buildInventoryItems(): InventoryItem[] {
  return [
    ERASER_ITEM,
    ...OBJECT_TYPES.flatMap((object) =>
      getObjectItemVariants(object.type).map((v) => ({
        kind: 'object' as const,
        type: object.type,
        variant: v.variant,
        iconUrl: v.iconUrl,
        label: getObjectLabel(object.type),
      }))
    ),
    ...CUBE_COLORS.map((color) => ({
      kind: 'color' as const,
      color,
      label: CUBE_COLOR_LABELS[color],
    })),
    ...CELL_SHAPES.map((shape) => ({
      kind: 'shape' as const,
      shape,
      label: CELL_SHAPE_LABELS[shape],
    })),
  ]
}
