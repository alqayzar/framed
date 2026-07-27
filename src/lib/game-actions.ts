import {
  type ActionInstance,
  type ActionSpec,
  createActionInstance,
} from '@/lib/actions'
import { CUBE_COLORS, type CubeColor } from '@/lib/cube-colors'
import { type GridObjectsState, OBJECT_TYPES, type ObjectType } from '@/lib/game-objects'
import { CELL_SHAPES, type CellShape, type SpecialCellsState } from '@/lib/special-cells'
import { type PlayersState } from '@/hooks/use-game-world'
import { gridKey, isAdjacent } from '@/lib/world'

// Convenience bundle for callers building createInstance params — not
// used anywhere inside actions.ts/the specs below, each of which only
// declares the specific getter(s) it actually needs.
export interface GameActionsContext {
  getPlayers: () => PlayersState
  getGridObjects: () => GridObjectsState
  getSpecialCells: () => SpecialCellsState
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function pickRandomPlayerId(players: PlayersState): string | undefined {
  return randomItem(Object.keys(players))
}

export function pickRandomDurationMs(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs)
}

export function pickRandomObjectType(): ObjectType {
  return randomItem(OBJECT_TYPES).type
}

export function pickRandomCubeColor(): CubeColor {
  return randomItem(CUBE_COLORS)
}

export function pickRandomCellShape(): CellShape {
  return randomItem(CELL_SHAPES)
}

// e.g. "30 secondes", "1 minute", "1 minute 30" — used by every
// duration-based label below instead of showing raw milliseconds.
function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const minutesLabel = `${minutes} minute${minutes > 1 ? 's' : ''}`
  const secondsLabel = `${seconds} seconde${seconds > 1 ? 's' : ''}`
  if (minutes === 0) return secondsLabel
  if (seconds === 0) return minutesLabel
  return `${minutesLabel} ${secondsLabel}`
}

function isPlayerAdjacentToAnyOther(playerId: string, players: PlayersState): boolean {
  const subject = players[playerId]
  if (!subject) return false
  return Object.entries(players).some(([otherId, other]) => {
    if (otherId === playerId) return false
    return other.gridX === subject.gridX && other.gridY === subject.gridY && isAdjacent(subject.position, other.position)
  })
}

// "Player X must not move for {duration}." Succeeds the moment the
// player has gone durationMs without moving at least once during the
// instance's lifetime — once that's happened, it's permanently true:
// verify() isn't called on a timer, so a qualifying quiet gap has to be
// detected and latched the moment a move ends it (in onEvent), not left
// for whoever next happens to call verify() — a later move must not be
// able to erase an already-completed gap.
interface NoMoveParams {
  targetPlayerId: string
  durationMs: number
}

interface NoMoveState {
  lastMoveTimestamp: number | null
  satisfied: boolean
}

function noMoveSpec(params: NoMoveParams): ActionSpec<NoMoveState> {
  return {
    name: 'no-move',
    label: `Vous devez rester immobile pendant ${formatDuration(params.durationMs)}.`,
    initialState: () => ({ lastMoveTimestamp: null, satisfied: false }),
    onEvent(state, instance, event) {
      if (event.type !== 'player-move' || event.playerId !== params.targetPlayerId) return
      // Check whether the gap this move just ended already qualified
      // before resetting the checkpoint — the fact stays true forever.
      const since = state.lastMoveTimestamp ?? instance.startedAt
      if (since !== null && Date.now() - since >= params.durationMs) state.satisfied = true
      state.lastMoveTimestamp = Date.now()
    },
    verify(state, instance) {
      if (state.satisfied) return true
      const since = state.lastMoveTimestamp ?? instance.startedAt
      return since !== null && Date.now() - since >= params.durationMs
    },
  }
}

export const ActionNoMove = {
  createInstance(params: NoMoveParams): ActionInstance<NoMoveState> {
    return createActionInstance(noMoveSpec(params))
  },
}

// "Player X must stay adjacent to another player for {duration}." Any
// player's move (not just the subject's) can make or break adjacency.
// Same "at least once during its lifetime" latch as no-move above: once
// a continuous streak has lasted durationMs, that stays true forever —
// a later break can't retroactively undo it, so the check has to happen
// in onEvent right when a streak ends, not deferred to verify().
interface StayAdjacentParams {
  targetPlayerId: string
  durationMs: number
  getPlayers: () => PlayersState
}

interface StayAdjacentState {
  // Start of the current unbroken adjacency streak, or null when not
  // currently in one.
  sinceTimestamp: number | null
  satisfied: boolean
}

function stayAdjacentSpec(params: StayAdjacentParams): ActionSpec<StayAdjacentState> {
  function checkStreak(state: StayAdjacentState, streakStart: number | null) {
    if (streakStart !== null && Date.now() - streakStart >= params.durationMs) state.satisfied = true
  }

  return {
    name: 'stay-adjacent',
    label: `Vous devez rester à côté d'un autre joueur pendant ${formatDuration(params.durationMs)}.`,
    initialState: () => ({ sinceTimestamp: null, satisfied: false }),
    onEvent(state, _instance, event) {
      if (event.type !== 'player-move') return
      if (isPlayerAdjacentToAnyOther(params.targetPlayerId, params.getPlayers())) {
        state.sinceTimestamp ??= Date.now()
        return
      }
      // Adjacency just broke: check whether the streak that just ended
      // already qualified before forgetting when it started.
      checkStreak(state, state.sinceTimestamp)
      state.sinceTimestamp = null
    },
    verify(state, instance) {
      if (state.satisfied) return true
      // No move event may have fired yet — since a player's position only
      // ever changes via a dispatched event, a still-null sinceTimestamp
      // while currently adjacent means the streak has held since start.
      if (state.sinceTimestamp === null && isPlayerAdjacentToAnyOther(params.targetPlayerId, params.getPlayers())) {
        state.sinceTimestamp = instance.startedAt
      }
      checkStreak(state, state.sinceTimestamp)
      return state.satisfied
    },
  }
}

export const ActionStayAdjacent = {
  createInstance(params: StayAdjacentParams): ActionInstance<StayAdjacentState> {
    return createActionInstance(stayAdjacentSpec(params))
  },
}

// "Move object X to a cell [of color Y] [of shape Z]." Purely
// event-driven — only the constraints actually passed are checked; can
// stay pending forever if never satisfied.
interface MoveObjectToCellParams {
  objectType: ObjectType
  color?: CubeColor
  shape?: CellShape
  getSpecialCells: () => SpecialCellsState
}

interface MoveObjectToCellState {
  satisfied: boolean
}

function moveObjectToCellSpec(params: MoveObjectToCellParams): ActionSpec<MoveObjectToCellState> {
  const constraints: string[] = []
  if (params.color) constraints.push(`de couleur ${params.color}`)
  if (params.shape) constraints.push(`en forme de ${params.shape}`)
  const label =
    `Déplacez {{object:${params.objectType}}} sur une case spéciale` +
    (constraints.length > 0 ? ` ${constraints.join(' et ')}` : '') +
    '.'

  return {
    name: 'move-object-to-cell',
    label,
    initialState: () => ({ satisfied: false }),
    onEvent(state, _instance, event) {
      if (event.type !== 'object-move' || event.object.type !== params.objectType) return
      const destCell = (params.getSpecialCells()[gridKey(event.toGrid)] ?? []).find(
        (cell) => cell.position.x === event.to.x && cell.position.y === event.to.y
      )
      if (params.color && destCell?.color !== params.color) return
      if (params.shape && destCell?.shape !== params.shape) return
      state.satisfied = true
    },
    verify(state) {
      return state.satisfied
    },
  }
}

export const ActionMoveObjectToCell = {
  createInstance(params: MoveObjectToCellParams): ActionInstance<MoveObjectToCellState> {
    return createActionInstance(moveObjectToCellSpec(params))
  },
}

function allObjectsOfTypeInOneGrid(objectType: ObjectType | undefined, getGridObjects: () => GridObjectsState): boolean {
  const gridsWithObjects = new Set<string>()
  let count = 0
  for (const [key, objects] of Object.entries(getGridObjects())) {
    for (const object of objects) {
      if (objectType && object.type !== objectType) continue
      count += 1
      gridsWithObjects.add(key)
    }
  }
  return count > 0 && gridsWithObjects.size === 1
}

// "Put all objects of type X in one grid." Checked by pulling verify()
// only — re-scanning the whole world on every single object move isn't
// worth doing eagerly (see ActionAllObjectsOneGrid below too).
interface AllObjectsOfTypeOneGridParams {
  objectType: ObjectType
  getGridObjects: () => GridObjectsState
}

function allObjectsOfTypeOneGridSpec(params: AllObjectsOfTypeOneGridParams): ActionSpec<object> {
  return {
    name: 'all-objects-of-type-one-grid',
    label: `Rassemblez tous les {{object:${params.objectType}}} dans la même grille.`,
    initialState: () => ({}),
    verify() {
      return allObjectsOfTypeInOneGrid(params.objectType, params.getGridObjects)
    },
  }
}

export const ActionAllObjectsOfTypeOneGrid = {
  createInstance(params: AllObjectsOfTypeOneGridParams): ActionInstance<object> {
    return createActionInstance(allObjectsOfTypeOneGridSpec(params))
  },
}

// "Put all objects (of every type) in one grid." Same as above with no
// type filter.
interface AllObjectsOneGridParams {
  getGridObjects: () => GridObjectsState
}

function allObjectsOneGridSpec(params: AllObjectsOneGridParams): ActionSpec<object> {
  return {
    name: 'all-objects-one-grid',
    label: 'Rassemblez tous les objets dans la même grille.',
    initialState: () => ({}),
    verify() {
      return allObjectsOfTypeInOneGrid(undefined, params.getGridObjects)
    },
  }
}

export const ActionAllObjectsOneGrid = {
  createInstance(params: AllObjectsOneGridParams): ActionInstance<object> {
    return createActionInstance(allObjectsOneGridSpec(params))
  },
}
