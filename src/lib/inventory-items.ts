import { CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'
import { getObjectItemVariants, getObjectLabel, OBJECT_TYPES, type GridObject, type ObjectType } from '@/lib/game-objects'
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

// Turns an existing placed object back into the inventory entry that
// originally created it. Old saved objects may predate .variant, so use
// the type's first inventory variant in that case (the same default used
// when such an object is generated).
export function inventoryItemForObject(object: Pick<GridObject, 'type' | 'variant'>): InventoryItem {
  const variants = getObjectItemVariants(object.type)
  const selectedVariant = variants.find((variant) => variant.variant === object.variant) ?? variants[0]
  return {
    kind: 'object',
    type: object.type,
    variant: selectedVariant.variant,
    iconUrl: selectedVariant.iconUrl,
    label: getObjectLabel(object.type),
  }
}

export function inventoryItemForColor(color: CubeColor): InventoryItem {
  return { kind: 'color', color, label: CUBE_COLOR_LABELS[color] }
}

export function inventoryItemForShape(shape: CellShape): InventoryItem {
  return { kind: 'shape', shape, label: CELL_SHAPE_LABELS[shape] }
}

export function buildInventoryItems(): InventoryItem[] {
  return [
    ERASER_ITEM,
    ...OBJECT_TYPES.flatMap((object) =>
      getObjectItemVariants(object.type).map((variant) => inventoryItemForObject({ type: object.type, variant: variant.variant }))
    ),
    ...CUBE_COLORS.map(inventoryItemForColor),
    ...CELL_SHAPES.map(inventoryItemForShape),
  ]
}
