import type { AdminTeeTimesGroup, AdminTeeTimesReadyEntry } from '../data/leagueTypes'

/** Player waiting to tee; guest counts as one extra slot (2 total) when pulled. */
export type TeeReadyEntry = AdminTeeTimesReadyEntry

export type TeeGroupResult = AdminTeeTimesGroup

export type TeamIdLookup = (playerId: string) => string | undefined

function slotCount(e: TeeReadyEntry): number {
  return e.hasGuest ? 2 : 1
}

/** Four roster players (four slots, no +1 on any) all assigned to the same team. */
function isSameTeamFoursome(members: TeeReadyEntry[], getTeamId: TeamIdLookup): boolean {
  if (members.length !== 4) return false
  const teams = members.map((m) => getTeamId(m.playerId))
  if (teams.some((t) => !t)) return false
  const t0 = teams[0]!
  return teams.every((t) => t === t0)
}

function violatesFourSameTeamIndices(
  ready: TeeReadyEntry[],
  indices: number[],
  getTeamId: TeamIdLookup,
): boolean {
  if (indices.length !== 4) return false
  const members = indices.map((i) => ready[i]!)
  return isSameTeamFoursome(members, getTeamId)
}

/** Whether some subset of `ready` sums to exactly 4 slots (each player at most once). */
export function canFillFourTeeSlots(ready: TeeReadyEntry[]): boolean {
  const n = ready.length
  const slots = ready.map(slotCount)
  const used = new Array<boolean>(n).fill(false)

  function go(rem: number): boolean {
    if (rem === 0) return true
    for (let i = 0; i < n; i++) {
      if (used[i] || slots[i]! > rem) continue
      used[i] = true
      if (go(rem - slots[i]!)) return true
      used[i] = false
    }
    return false
  }

  return go(4)
}

/**
 * Whether a foursome can be drawn that fills4 slots and does not put four roster
 * players from the same team in one group (guests do not count toward team membership).
 */
export function canDrawValidTeeGroup(ready: TeeReadyEntry[], getTeamId: TeamIdLookup): boolean {
  if (!canFillFourTeeSlots(ready)) return false
  const n = ready.length
  const slots = ready.map(slotCount)
  const used = new Array<boolean>(n).fill(false)

  function go(rem: number, pickedIdx: number[]): boolean {
    if (rem === 0) return !violatesFourSameTeamIndices(ready, pickedIdx, getTeamId)
    for (let i = 0; i < n; i++) {
      if (used[i] || slots[i]! > rem) continue
      used[i] = true
      if (go(rem - slots[i]!, [...pickedIdx, i])) return true
      used[i] = false
    }
    return false
  }

  return go(4, [])
}

/**
 * Randomly pick players from `ready` until 4 slots are filled, never returning four
 * same-team roster players with no guests. Returns null if impossible or after failed attempts.
 */
export function drawRandomTeeGroup(ready: TeeReadyEntry[], getTeamId: TeamIdLookup): TeeReadyEntry[] | null {
  if (!canDrawValidTeeGroup(ready, getTeamId)) return null

  for (let attempt = 0; attempt < 400; attempt++) {
    const pool = ready.map((r) => ({
      playerId: r.playerId,
      hasGuest: r.hasGuest,
      slots: slotCount(r),
    }))
    let remaining = 4
    const result: TeeReadyEntry[] = []
    while (remaining > 0) {
      const opts = pool.filter(
        (p) => !result.some((x) => x.playerId === p.playerId) && p.slots <= remaining,
      )
      if (opts.length === 0) break
      const pick = opts[Math.floor(Math.random() * opts.length)]!
      result.push({ playerId: pick.playerId, hasGuest: pick.hasGuest })
      remaining -= pick.slots
    }
    if (remaining === 0 && !isSameTeamFoursome(result, getTeamId)) return result
  }

  return null
}
