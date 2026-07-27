import type { CellPosition, GridCoord } from '@/lib/world'
import type { GridObject } from '@/lib/game-objects'

export type ActionEvent =
  | {
      type: 'player-move'
      playerId: string
      fromGrid: GridCoord
      toGrid: GridCoord
      from: CellPosition
      to: CellPosition
    }
  | {
      type: 'object-move'
      object: GridObject
      // The player whose move caused this push, not the object itself.
      playerId: string
      fromGrid: GridCoord
      toGrid: GridCoord
      from: CellPosition
      to: CellPosition
    }

export interface ActionInstance<State = unknown> {
  id: string
  name: string
  // Player-facing description, fully rendered from this instance's own
  // params at creation time (see game-actions.ts) — not a template
  // needing further substitution.
  label: string
  startedAt: number | null
  state: State
  // Optional: an action only ever checked by pulling verify() (e.g. "are
  // all objects in one grid") doesn't need to react to every event. Never
  // decides completion itself — only updates state for verify() to read.
  // May be async (e.g. a definition that needs to await something).
  onEvent?(event: ActionEvent): void | Promise<void>
  // The only place completion is ever decided — true when the condition
  // currently holds. Callable anytime, as many times as wanted. May be
  // async.
  verify(): boolean | Promise<boolean>
}

// A definition builds one of these (params baked in via closure) and
// hands it to createActionInstance — the "generic form with some parts
// left as parameters" that gets filled in per-instance. Any game-state
// accessor a definition needs (getPlayers, etc.) is part of that same
// params object, supplied once at createInstance time — this engine
// itself has no notion of game state at all, only of events.
export interface ActionSpec<State> {
  name: string
  label: string
  initialState(): State
  onEvent?(state: State, instance: ActionInstance<State>, event: ActionEvent): void | Promise<void>
  verify(state: State, instance: ActionInstance<State>): boolean | Promise<boolean>
}

function generateActionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const activeInstances = new Set<ActionInstance>()

export function createActionInstance<State>(spec: ActionSpec<State>): ActionInstance<State> {
  const state = spec.initialState()
  const instance: ActionInstance<State> = {
    id: generateActionId(),
    name: spec.name,
    label: spec.label,
    startedAt: null,
    state,
    verify: () => spec.verify(state, instance),
  }
  if (spec.onEvent) {
    instance.onEvent = (event) => spec.onEvent!(state, instance, event)
  }
  return instance
}

export function startAction(instance: ActionInstance): void {
  instance.startedAt = Date.now()
  activeInstances.add(instance)
}

export function stopAction(instance: ActionInstance): void {
  activeInstances.delete(instance)
}

// Fire-and-forget: none of this engine's callers await dispatch, so an
// async onEvent that rejects is caught here instead of becoming an
// unhandled rejection.
export function dispatchActionEvent(event: ActionEvent): void {
  for (const instance of activeInstances) {
    void Promise.resolve(instance.onEvent?.(event)).catch((error: unknown) => {
      console.error(`Action "${instance.name}" onEvent failed`, error)
    })
  }
}

export function verifyAction(instance: ActionInstance): boolean | Promise<boolean> {
  return instance.verify()
}
