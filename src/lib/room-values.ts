import { idbDel, idbGet, idbSet } from '@/lib/idb-store'

// General-purpose named value store for gameplay logic (see setValue/
// getValue in use-game-world.tsx) — distinct from room-store.ts, whose
// save/load helpers are one per fixed field, not name-keyed. Values are
// grouped by lifetime, one IndexedDB key per lifetime holding a whole
// name->value map, so clearing a lifetime is a single key delete.
export type ValueScope = 'global' | 'local'
export type ValueLifetime = 'shared' | 'wait_room' | 'game'

type ValueMap = Record<string, unknown>

const VALUES_KEY: Record<ValueLifetime, string> = {
  wait_room: 'room:values:wait_room',
  game: 'room:values:game',
  shared: 'room:values:shared',
}

export async function setStoredValue(name: string, value: unknown, lifetime: ValueLifetime): Promise<void> {
  const map = (await idbGet<ValueMap>(VALUES_KEY[lifetime])) ?? {}
  await idbSet(VALUES_KEY[lifetime], { ...map, [name]: value })
}

// Checked wait_room, then game, then shared — a caller fetches by name
// alone, without needing to remember which lifetime it used to store it.
// The optional defaultValue is returned (and the return type narrows to
// plain T) when the name isn't stored anywhere.
export async function getStoredValue<T>(name: string): Promise<T | undefined>
export async function getStoredValue<T>(name: string, defaultValue: T): Promise<T>
export async function getStoredValue<T>(name: string, defaultValue?: T): Promise<T | undefined> {
  for (const lifetime of ['wait_room', 'game', 'shared'] as const) {
    const map = await idbGet<ValueMap>(VALUES_KEY[lifetime])
    if (map && name in map) return map[name] as T
  }
  return defaultValue
}

// Called when a phase ends (see startGameRef/returnToLobbyRef in
// use-game-world.tsx) — drops every value stored under that lifetime.
export function clearValuesForLifetime(lifetime: Extract<ValueLifetime, 'wait_room' | 'game'>): Promise<void> {
  return idbDel(VALUES_KEY[lifetime])
}

// Wipes all three lifetimes — called from clearRoomInfo() in
// room-store.ts so leaving/being kicked doesn't leave stale values behind
// for the next room in the same browser.
export async function clearAllStoredValues(): Promise<void> {
  await idbDel(VALUES_KEY.wait_room)
  await idbDel(VALUES_KEY.game)
  await idbDel(VALUES_KEY.shared)
}
