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

// Random count of objects generated per grid; tune to taste.
export const OBJECTS_PER_GRID_MIN = 2
export const OBJECTS_PER_GRID_MAX = 5

export interface GridObject {
  id: string
  // A cell holds at most one object, centered on it.
  position: CellPosition
  type: ObjectType
  color: CubeColor
}

export type GridObjectsState = Record<string, GridObject[]>

// An object a player is holding: same identity/appearance as on the
// ground, minus the board position it no longer has while in hand.
export type HeldObject = Omit<GridObject, 'position'>

// One hand slot each for bottom-right (index 0) and bottom-left (index
// 1) of the player's cube — see PlayerCube in game-grid.tsx.
export const MAX_HELD_OBJECTS = 2

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function generateObjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Objects for a single grid: a random count (within the configured
// interval, capped to the number of cells available) of randomly
// typed/colored objects, scattered over random cells — at most one per
// cell.
function generateGridObjects(boardSize: number, boardRadius: number): GridObject[] {
  const boardCells = buildBoardCells(boardSize, boardRadius)
  if (boardCells.length === 0) return []

  const count = Math.min(
    boardCells.length,
    OBJECTS_PER_GRID_MIN + Math.floor(Math.random() * (OBJECTS_PER_GRID_MAX - OBJECTS_PER_GRID_MIN + 1))
  )
  const usedCells = new Set<string>()
  const objects: GridObject[] = []

  // Bounded retries: guards against spinning forever picking already-used
  // cells as the board fills up.
  const maxAttempts = boardCells.length * 4
  let attempts = 0

  while (objects.length < count && attempts < maxAttempts) {
    attempts += 1
    const cell = randomItem(boardCells)
    const cellKey = gridKey(cell)
    if (usedCells.has(cellKey)) continue
    usedCells.add(cellKey)

    objects.push({
      id: generateObjectId(),
      position: cell,
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
