import * as flows from '@/lib/flows'
import type { Flow } from '@/lib/flows'
import { CUBE_COLOR_PALETTE } from './cube-colors'

// Actual flow scripts for the game live here — compositions built out of
// the primitives in flows.ts. use-game-world.tsx only ever runs whatever
// Flow it's handed (see executeFlow); it doesn't author any of them.

// Proves out the Flow architecture end to end: every given player's grid
// blinks off/on four times, with a GLOBAL round counter incremented at
// the top of each loop and shown in the ping ("Round 1".."Round 4" —
// its 'game' lifetime means returning to the lobby wipes it, so a fresh
// game restarts at 1). Remove once real flows replace it.
export function testFlow(playerIds: string[]): Flow {
  return flows.repeat(
    4,
    flows.run(async (context) =>
      flows.setValue('round', (await context.getValue('round', 0)) + 1, 'global', 'game')
    ),
    flows.wait(3000),
    flows.setGridVisible(playerIds, false),
    flows.ping([], 'Round {round}, hi {{playerName}}', CUBE_COLOR_PALETTE['red']),
    flows.wait(3000),
    flows.setGridVisible(playerIds, true)
  )
}

// Entry points for the self-looping flow driver (see runFlowLoop in
// flows.ts): each does one unit of game-phase work and reports whether
// it should be called again right away. GameScreen/WaitingRoomContent
// only ever call these — never a raw Flow — so all of the game's actual
// logic/pacing stays in this file, not spread across components.
export async function beginGameFlow(
  playerIds: string[],
  executeFlow: (flow: Flow, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal
): Promise<boolean> {
  await executeFlow(testFlow(playerIds), signal)
  return false
}

// Nothing runs in the waiting room yet — a no-op stub so the calling
// convention (see WaitingRoomContent) is already in place once it does.
export async function beginWaitRoomFlow(
  _playerIds: string[],
  _executeFlow: (flow: Flow, signal?: AbortSignal) => Promise<void>,
  _signal?: AbortSignal
): Promise<boolean> {
  return false
}
