import type { ValueLifetime, ValueScope } from '@/lib/room-values'
import type { ToastColors } from '@/hooks/use-toast'

// Flows are the gameplay building blocks: small, host-executed actions
// (hide a grid, show a toast, later spawn an object or teleport a
// player...) that compose freely into bigger ones. A flow receives
// everything it operates on — player ids, texts, positions — as plain
// arguments of its factory; the FlowContext only provides the action
// primitives themselves, never data. Their implementation lives in
// use-game-world.tsx next to the rest of the host-authoritative logic,
// which keeps every flow a plain function: trivially composable,
// testable, and runnable anywhere the context exists (waiting room
// included).
//
// Usage reads best namespaced:
//
//   import * as flows from '@/lib/flows'
//
//   executeFlow(
//     flows.sequence(
//       flows.setGridVisible([xId, bId], false),
//       flows.showToast([xId, bId], 'Ta grille a été désactivée')
//     )
//   )
export interface FlowContext {
  // Shows/hides the board of each given player.
  setGridVisible(playerIds: string[], visible: boolean): void
  // Shows a toast to the given players, or to everyone when the list is
  // null/empty.
  showToast(playerIds: string[] | null, text: string, colors?: ToastColors): void
  // Reads a named value (see setValue/getValue in use-game-world.tsx) —
  // the primitive `ping`'s {name} substitution is built on. The
  // defaultValue overload narrows the result to plain T when given.
  getValue<T = unknown>(name: string): Promise<T | undefined>
  getValue<T = unknown>(name: string, defaultValue: T): Promise<T>
  // Stores a named value (see setValue in use-game-world.tsx) — resolves
  // once it's actually persisted, so a later step in the same sequence
  // (e.g. ping) reads the new value, never the old one.
  setValue(name: string, value: unknown, scope: ValueScope, lifetime: ValueLifetime): Promise<void>
  // Shows a templated toast to the given players (null/empty = everyone).
  // Unlike showToast, the {name} placeholders travel unresolved: each
  // target substitutes them from its own local store on arrival (see
  // resolveTemplate), so e.g. a GLOBAL value that reached a player late
  // still shows that player's own view of it.
  ping(playerIds: string[] | null, template: string, colors?: ToastColors): void
  // Future capabilities slot in here (spawnObject, teleportPlayer, ...):
  // add the primitive once, and any number of flows can build on it.
}

// Flows may be async so compositions can span time (see wait); sequence
// awaits each step before starting the next. The optional signal lets a
// flow be cancelled mid-execution — passed through every composition
// helper below (sequence/repeat/run) so a caller only ever needs to
// abort once, at the top, to stop a whole tree of nested flows (see
// executeFlow in use-game-world.tsx, which aborts on every lobby/game
// transition so a flow never outlives the phase it started in).
export type Flow = (context: FlowContext, signal?: AbortSignal) => void | Promise<void>

// Runs the given flows one after the other — the composition primitive:
// a sequence is itself a Flow, so sequences nest arbitrarily.
export function sequence(...flows: Flow[]): Flow {
  return async (context, signal) => {
    for (const flow of flows) {
      if (signal?.aborted) return
      await flow(context, signal)
    }
  }
}

// Pauses a sequence for the given duration — resolves early (without
// running the rest of the sequence) if the signal aborts mid-wait,
// instead of always running out the full duration first.
export function wait(durationMs: number): Flow {
  return (_context, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted) return resolve()
      const timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, durationMs)
      function onAbort() {
        window.clearTimeout(timer)
        resolve()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
}

// Runs the given flows in order, count times over — sugar for repeating
// the same sequence(...flows) block instead of spelling it out N times.
export function repeat(count: number, ...flows: Flow[]): Flow {
  return sequence(...Array.from({ length: count }, () => sequence(...flows)))
}

// Defers building the flows to run until this step actually executes,
// instead of upfront at composition time like sequence(...)/repeat(...)
// do — for when which flows to run depends on something only known then
// (e.g. the current player list, a random pick, a stored value). The
// builder receives the FlowContext and may be async, so stored values
// can be read and transformed inline; it may return one Flow or an
// array. Otherwise runs exactly like a sequence of whatever it returns.
//
//   flows.run(() => [flows.wait(time)])
//   flows.run(async (context) =>
//     flows.setValue('round', (await context.getValue('round', 0)) + 1, 'global', 'game')
//   )
export function run(build: (context: FlowContext) => Flow | Flow[] | Promise<Flow | Flow[]>): Flow {
  return async (context, signal) => {
    const built = await build(context)
    if (signal?.aborted) return
    return sequence(...(Array.isArray(built) ? built : [built]))(context, signal)
  }
}

export function setGridVisible(playerIds: string[], visible: boolean): Flow {
  return (context) => context.setGridVisible(playerIds, visible)
}

// Derive the value from the current one with run (see above) — reads are
// async, so a plain argument can't express "current + 1" by itself.
export function setValue(name: string, value: unknown, scope: ValueScope, lifetime: ValueLifetime): Flow {
  return (context) => context.setValue(name, value, scope, lifetime)
}

export function showToast(playerIds: string[] | null, text: string, colors?: ToastColors): Flow {
  return (context) => context.showToast(playerIds, text, colors)
}

// Shows a templated toast: every {name} in the template is replaced —
// on the receiving player's side, from its own local store (see
// FlowContext.ping/resolveTemplate) — by the stored value of that name,
// or '' when absent. playerIds empty targets everyone (same convention
// as showToast).
//
//   flows.ping([], 'Hello {username} and {other player}!')
export function ping(playerIds: string[], template: string, colors?: ToastColors): Flow {
  return (context) => context.ping(playerIds.length > 0 ? playerIds : null, template, colors)
}

// Two separate, non-overlapping substitution passes over a ping
// template, both run on each ping target (see the 'ping' message in
// use-game-world.tsx) against that player's own local data — never
// resolved before the message leaves the host, so e.g. {{playerName}}
// means whoever is reading the toast, not whoever sent the ping:
//
// - {{name}} — a special variable, looked up in specialValues (e.g.
//   {{playerName}} -> the recipient's own username).
// - {name} — a stored value, looked up via getValue (see setValue/
//   getValue in use-game-world.tsx).
//
// Unknown names of either kind resolve to ''. Double-brace is resolved
// first so {{playerName}} is never misread as the single-brace stored
// value 'playerName'.
export async function resolveTemplate(
  template: string,
  getValue: (name: string) => Promise<unknown>,
  specialValues: Record<string, string> = {}
): Promise<string> {
  const withSpecials = template.replace(/\{\{([^{}]+)\}\}/g, (_, name: string) => specialValues[name] ?? '')
  const names = new Set<string>()
  for (const match of withSpecials.matchAll(/\{([^{}]+)\}/g)) names.add(match[1])
  const values = new Map<string, unknown>()
  await Promise.all([...names].map(async (name) => values.set(name, await getValue(name))))
  return withSpecials.replace(/\{([^{}]+)\}/g, (_, name: string) => String(values.get(name) ?? ''))
}

// A step in a self-looping flow driver (see beginGameFlow/
// beginWaitRoomFlow in game-flows.ts): does one unit of work and reports
// whether it should run again right away.
export type FlowLoopStep = () => Promise<boolean>

// Calls step over and over for as long as it returns true, stopping
// early once isCancelled reports true (e.g. because the screen driving
// the loop — GameScreen, WaitingRoomContent — unmounted).
export async function runFlowLoop(step: FlowLoopStep, isCancelled: () => boolean): Promise<void> {
  while (!isCancelled()) {
    const again = await step()
    if (!again) return
  }
}

// Aborts the instant either input does — lets a Flow observe two
// independent cancellation sources at once. Used by executeFlow in
// use-game-world.tsx to combine its own phase-scoped controller (aborted
// on startGame/returnToLobby) with an optional per-call signal from the
// caller (e.g. GameScreen's flow-loop effect, aborted on cleanup — this
// is what stops a flow that's already running when React unmounts the
// effect, including its StrictMode dev double-invoke, which the
// isCancelled flag above only prevents from *starting again*, not from
// finishing an already in-flight run).
export function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted || b.aborted) {
    const aborted = new AbortController()
    aborted.abort()
    return aborted.signal
  }
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}
