import appleUrl from '@/assets/objects/apple.svg'
import basketballUrl from '@/assets/objects/basketball.svg'
import carrotUrl from '@/assets/objects/carrot.svg'
import giftUrl from '@/assets/objects/gift.svg'
import penguinUrl from '@/assets/objects/penguin.svg'
import poopUrl from '@/assets/objects/poop.svg'
import soccerBallUrl from '@/assets/objects/soccer-ball.svg'
import trexUrl from '@/assets/objects/trex.svg'
import tvUrl from '@/assets/objects/tv.svg'
import watermelonUrl from '@/assets/objects/watermelon.svg'
import { buildBoardCells, type CellPosition, type GridCoord, gridKey } from '@/lib/board'
import { CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'

interface ObjectDefinition {
  type: string
  iconUrl: string
}

// Single source of truth for every object type: each one's name appears
// exactly once, right here, alongside its icon. ObjectType is derived
// from this list instead of being maintained by hand alongside it.
export const OBJECT_TYPES = [
  { type: 'apple', iconUrl: appleUrl },
  { type: 'basketball', iconUrl: basketballUrl },
  { type: 'carrot', iconUrl: carrotUrl },
  { type: 'gift', iconUrl: giftUrl },
  { type: 'penguin', iconUrl: penguinUrl },
  { type: 'poop', iconUrl: poopUrl },
  { type: 'soccer-ball', iconUrl: soccerBallUrl },
  { type: 'trex', iconUrl: trexUrl },
  { type: 'tv', iconUrl: tvUrl },
  { type: 'watermelon', iconUrl: watermelonUrl },
] as const satisfies ObjectDefinition[]

export type ObjectType = (typeof OBJECT_TYPES)[number]['type']

const OBJECT_TYPES_BY_ID = new Map(OBJECT_TYPES.map((definition) => [definition.type, definition]))

export function getObjectIconUrl(type: ObjectType): string {
  // OBJECT_TYPES_BY_ID is built from every entry of OBJECT_TYPES, and
  // ObjectType only ever holds one of those entries' type — always found.
  return OBJECT_TYPES_BY_ID.get(type)!.iconUrl
}

// Where an object sits within its cell, as a fraction of the cell's own
// size (used when rendering — see GridObjectBadge in game-grid.tsx). A
// cell can hold at most 2 objects, each pinned to a different index
// here. Only 3 spots, not 4: top-left is deliberately left out,
// mirroring the host star badge already anchored there on player cubes
// (see PlayerCube). The names in the comments are just for reading —
// nothing in the code refers to a corner by name, only by index.
export const OBJECT_CORNER_OFFSETS = [
  { x: 0.75, y: 0.25 }, // top-right
  { x: 0.25, y: 0.75 }, // bottom-left
  { x: 0.75, y: 0.75 }, // bottom-right
] as const

// Random count of objects generated per grid; tune to taste.
export const OBJECTS_PER_GRID_MIN = 2
export const OBJECTS_PER_GRID_MAX = 5

export interface GridObject {
  id: string
  position: CellPosition
  // Index into OBJECT_CORNER_OFFSETS.
  corner: number
  type: ObjectType
  color: CubeColor
}

export type GridObjectsState = Record<string, GridObject[]>

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function generateObjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Objects for a single grid: a random count (within the configured
// interval) of randomly typed/colored objects, scattered over random
// cells and corners, respecting the 2-per-cell / 1-per-corner cap. Cells
// that already hold 2 objects, or whichever corners are already taken,
// are skipped when picking a spot for the next one.
function generateGridObjects(boardSize: number, boardRadius: number): GridObject[] {
  const boardCells = buildBoardCells(boardSize, boardRadius)
  if (boardCells.length === 0) return []

  const count =
    OBJECTS_PER_GRID_MIN + Math.floor(Math.random() * (OBJECTS_PER_GRID_MAX - OBJECTS_PER_GRID_MIN + 1))
  const cornersByCell = new Map<string, Set<number>>()
  const objects: GridObject[] = []

  // Bounded retries: with only a handful of objects spread over dozens
  // of cells, collisions are rare — this just guards against an
  // unlucky run (or a saturated board) spinning forever.
  const maxAttempts = boardCells.length * OBJECT_CORNER_OFFSETS.length * 4
  let attempts = 0

  while (objects.length < count && attempts < maxAttempts) {
    attempts += 1
    const cell = randomItem(boardCells)
    const cellKey = gridKey(cell)
    const usedCorners = cornersByCell.get(cellKey) ?? new Set<number>()
    if (usedCorners.size >= 2) continue

    const availableCorners = OBJECT_CORNER_OFFSETS.map((_, index) => index).filter(
      (index) => !usedCorners.has(index)
    )
    const corner = randomItem(availableCorners)
    usedCorners.add(corner)
    cornersByCell.set(cellKey, usedCorners)

    objects.push({
      id: generateObjectId(),
      position: cell,
      corner,
      type: randomItem(OBJECT_TYPES).type,
      color: randomItem(CUBE_COLORS),
    })
  }

  return objects
}

// Rolls objects for every grid of the world in one pass — mirrors
// generateGridColors in board.ts: generated once by the host at the
// start of a game and persisted (see room-store.ts), not derived from
// coordinates.
export function generateWorldObjects(
  worldSize: number,
  boardSize: number,
  boardRadius: number
): GridObjectsState {
  const state: GridObjectsState = {}
  for (let y = 0; y < worldSize; y++) {
    for (let x = 0; x < worldSize; x++) {
      const grid: GridCoord = { x, y }
      state[gridKey(grid)] = generateGridObjects(boardSize, boardRadius)
    }
  }
  return state
}
