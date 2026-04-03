import type { LeagueData } from '../data/leagueTypes'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FLIGHT_SLOTS = ['A', 'B', 'C', 'D'] as const

export function describeLeagueSaveBlocker(data: LeagueData): string | null {
  if (data.players.length < 1) return 'Add at least one player before saving.'
  const ids = new Set<string>()
  for (const p of data.players) {
    if (!SLUG_RE.test(p.id)) return `Player id "${p.id}" is invalid (lowercase slug only).`
    if (ids.has(p.id)) return `Duplicate player id "${p.id}".`
    ids.add(p.id)
  }
  for (const t of data.teams) {
    if (t.playerIds.length !== 4) {
      return `Team "${t.name}" must list exactly four players (one per flight column).`
    }
    for (let i = 0; i < 4; i++) {
      const pid = t.playerIds[i]
      const want = FLIGHT_SLOTS[i]
      if (!pid || !SLUG_RE.test(pid)) {
        return `Team "${t.name}" still has an open "${want}" slot.`
      }
      const pl = data.players.find((p) => p.id === pid)
      if (!pl) return `Team "${t.name}" references missing player id "${pid}".`
      if (pl.flight !== want) {
        return `In "${t.name}", ${pl.name} must be flight ${want} for column ${i + 1}.`
      }
    }
  }
  const counts = new Map<string, number>()
  for (const t of data.teams) {
    for (const pid of t.playerIds) {
      if (!pid) continue
      counts.set(pid, (counts.get(pid) ?? 0) + 1)
    }
  }
  for (const p of data.players) {
    const n = counts.get(p.id) ?? 0
    if (n !== 1) {
      return `"${p.name}" must appear on exactly one team (currently ${n}).`
    }
  }
  return null
}
