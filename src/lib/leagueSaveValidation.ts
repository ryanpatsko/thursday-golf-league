import type { FourManConfig, LeagueData } from '../data/leagueTypes'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FLIGHT_SLOTS = ['A', 'B', 'C', 'D'] as const

export function describeFourManSaveBlocker(
  config: FourManConfig,
  data: LeagueData,
): string | null {
  const halves = [
    { half: config.firstHalf, label: 'First Half' },
    { half: config.secondHalf, label: 'Second Half' },
  ] as const

  for (const { half, label } of halves) {
    if (!Number.isFinite(half.startWeek) || half.startWeek < 1) {
      return `${label}: start week must be at least 1.`
    }
    if (!Number.isFinite(half.endWeek) || half.endWeek < half.startWeek) {
      return `${label}: end week must be greater than or equal to start week.`
    }

    const seenInHalf = new Set<string>()
    for (const t of half.teams) {
      if (!SLUG_RE.test(t.id)) return `Four Man ${label}: team id "${t.id}" is invalid.`
      if (t.playerIds.length !== 4) {
        return `Four Man ${label}: team "${t.name}" must have exactly four player slots.`
      }
      for (let i = 0; i < 4; i++) {
        const pid = t.playerIds[i]
        const want = FLIGHT_SLOTS[i]
        if (!pid || !SLUG_RE.test(pid)) {
          return `Four Man ${label}: team "${t.name}" has an empty Flight ${want} slot.`
        }
        const pl = data.players.find((p) => p.id === pid)
        if (!pl) {
          return `Four Man ${label}: team "${t.name}" references missing player id "${pid}".`
        }
        if (pl.flight !== want) {
          return `Four Man ${label}: in "${t.name}", ${pl.name} must be flight ${want} for column ${i + 1}.`
        }
        if (seenInHalf.has(pid)) {
          return `Four Man ${label}: ${pl.name} appears on more than one team.`
        }
        seenInHalf.add(pid)
      }
    }
  }

  return null
}

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
  for (const p of data.players) {
    const h = p.handicapOverride
    if (h == null) continue
    if (typeof h.active !== 'boolean') {
      return `"${p.name}": handicap override must include active true or false.`
    }
    if (typeof h.value !== 'number' || !Number.isFinite(h.value)) {
      return `"${p.name}": handicap override value must be a finite number.`
    }
    if (h.active && (h.value < -10 || h.value > 60)) {
      return `"${p.name}": when override is on, index must be between -10 and 60.`
    }
  }
  if (data.fourMan != null) {
    const fourManBlocker = describeFourManSaveBlocker(data.fourMan, data)
    if (fourManBlocker) return fourManBlocker
  }
  return null
}
