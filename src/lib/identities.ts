export type PlayerIdentity = 'saboteur' | 'innocent'

// The largest number of saboteurs a game with this many players supports.
// E.g. 4 players -> 1, 6 -> 2, 7 -> 3.
export function maxSaboteurs(playerCount: number): number {
  return Math.max(0, Math.floor((playerCount - 1) / 2))
}

// Randomly assigns every player id an identity: exactly
// clamp(saboteurCount, 0, maxSaboteurs(playerIds.length)) of them become
// saboteur, the rest innocent. Rolled once by the host at game start (see
// startGameRef in use-game-world.tsx), not derived from anything else.
export function assignIdentities(
  playerIds: string[],
  saboteurCount: number
): Record<string, PlayerIdentity> {
  const count = Math.min(Math.max(saboteurCount, 0), maxSaboteurs(playerIds.length))
  const shuffled = [...playerIds]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const saboteurIds = new Set(shuffled.slice(0, count))
  const identities: Record<string, PlayerIdentity> = {}
  for (const playerId of playerIds) {
    identities[playerId] = saboteurIds.has(playerId) ? 'saboteur' : 'innocent'
  }
  return identities
}
