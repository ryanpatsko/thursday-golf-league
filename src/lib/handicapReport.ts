import type { LeagueData, Player } from '../data/leagueTypes'
import {
  computeHandicapIndex,
  computeHandicapIndexUnrounded,
  getNineForWeek,
  handicapTotalFromHoles,
} from './handicap'

/** League-week columns on the Handicaps grid. */
export const HANDICAPS_LEAGUE_WEEK_COLUMNS = 18

/** Prior-season column labels (weeks 12–18). */
export const HANDICAPS_PRIOR_WEEK_LABELS = [12, 13, 14, 15, 16, 17, 18] as const

const PRIOR_HEADER_LAST_WEEK = 18

/**
 * Whether a prior-season column header (labeled 12–18) gets the same “rolling band” highlight
 * as current-season weeks: for weeks 1–7, the index pool takes the newest
 * `max(0, 7 − (asOfLeagueWeek − 1))` prior totals, which align to the rightmost labels in 12–18.
 */
export function priorSeasonHeaderInRollingBand(asOfLeagueWeek: number, labeledWeek: number): boolean {
  if (asOfLeagueWeek > 7) return false
  const needFromPrior = Math.max(0, 7 - (asOfLeagueWeek - 1))
  if (needFromPrior === 0) return false
  const firstLabeledWeek = PRIOR_HEADER_LAST_WEEK + 1 - needFromPrior
  return labeledWeek >= firstLabeledWeek && labeledWeek <= PRIOR_HEADER_LAST_WEEK
}

export type HandicapCellRole = 'none' | 'inPool' | 'droppedLow' | 'droppedHigh' | 'countsForIndex'

export type HcPoolEntry =
  | { kind: 'prior'; priorIdx: number; value: number }
  | { kind: 'week'; week: number; value: number }

function weekHandicapTotal(data: LeagueData, player: Player, week: number): number | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
  if (!sched) return null
  const row = data.weeklyScores[player.id]?.[String(week)]
  const nine = getNineForWeek(data.course, sched.nine, player)
  return handicapTotalFromHoles(row, nine.holes)
}

/** Last 7 prior-season stored values aligned to columns 12…18 (oldest … newest). */
export function priorSeasonColumnValues(priors: number[]): (number | null)[] {
  const out: (number | null)[] = []
  for (let c = 0; c < 7; c++) {
    const idx = priors.length - 7 + c
    out.push(idx >= 0 ? priors[idx]! : null)
  }
  return out
}

export function handicapBreakdownForPlayer(
  data: LeagueData,
  player: Player,
  asOfLeagueWeek: number,
): {
  handicapIndex: number | null
  /** Same pool as {@link handicapIndex}, but `(avg−36)×0.8` before rounding (e.g. for display). */
  handicapIndexUnrounded: number | null
  priorColumns: (number | null)[]
  /** role per prior column index 0..6 (weeks 12..18) */
  priorRoles: HandicapCellRole[]
  /** role per league week 1..{@link HANDICAPS_LEAGUE_WEEK_COLUMNS} */
  weekRoles: Map<number, HandicapCellRole>
  /** values shown in prior/week cells (week map matches grid) */
  weekValues: Map<number, number | null>
} {
  const priors = [...player.priorSeasonScores]
  const curEntries: { week: number; total: number }[] = []
  for (let w = 1; w < asOfLeagueWeek; w++) {
    const t = weekHandicapTotal(data, player, w)
    if (t != null) curEntries.push({ week: w, total: t })
  }
  const curTotals = curEntries.map((e) => e.total)

  const handicapIndexUnrounded = computeHandicapIndexUnrounded({
    priorSeasonScores: priors,
    currentSeasonTotals: curTotals,
    asOfLeagueWeek,
  })
  const handicapIndex = computeHandicapIndex({
    priorSeasonScores: priors,
    currentSeasonTotals: curTotals,
    asOfLeagueWeek,
  })

  const priorColumns = priorSeasonColumnValues(priors)

  const weekValues = new Map<number, number | null>()
  for (let w = 1; w <= HANDICAPS_LEAGUE_WEEK_COLUMNS; w++) {
    weekValues.set(w, weekHandicapTotal(data, player, w))
  }

  const priorRoles: HandicapCellRole[] = Array(7).fill('none')
  const weekRoles = new Map<number, HandicapCellRole>()
  for (let w = 1; w <= HANDICAPS_LEAGUE_WEEK_COLUMNS; w++) weekRoles.set(w, 'none')

  let poolEntries: HcPoolEntry[] = []
  if (asOfLeagueWeek <= 7) {
    const needFromPrior = Math.max(0, 7 - curTotals.length)
    const start = Math.max(0, priors.length - needFromPrior)
    for (let i = start; i < priors.length; i++) {
      poolEntries.push({ kind: 'prior', priorIdx: i, value: priors[i]! })
    }
    for (const e of curEntries) {
      poolEntries.push({ kind: 'week', week: e.week, value: e.total })
    }
  } else {
    poolEntries = curEntries.slice(Math.max(0, curEntries.length - 7)).map((e) => ({
      kind: 'week' as const,
      week: e.week,
      value: e.total,
    }))
  }

  if (poolEntries.length < 7) {
    return {
      handicapIndex,
      handicapIndexUnrounded,
      priorColumns,
      priorRoles,
      weekRoles,
      weekValues,
    }
  }

  const last7 = poolEntries.slice(-7)
  const indexed = last7.map((entry, i) => ({ entry, i }))
  const sorted = [...indexed].sort((a, b) => a.entry.value - b.entry.value)
  const lowI = sorted[0]!.i
  const highI = sorted[6]!.i
  const used = new Set<number>()
  for (let k = 1; k <= 5; k++) used.add(sorted[k]!.i)

  for (const { entry, i } of indexed) {
    let role: HandicapCellRole = 'inPool'
    if (i === lowI) role = 'droppedLow'
    else if (i === highI) role = 'droppedHigh'
    else if (used.has(i)) role = 'countsForIndex'
    else role = 'inPool'

    if (entry.kind === 'prior') {
      const col = entry.priorIdx - (priors.length - 7)
      if (col >= 0 && col <= 6) priorRoles[col] = role
    } else {
      weekRoles.set(entry.week, role)
    }
  }

  return {
    handicapIndex,
    handicapIndexUnrounded,
    priorColumns,
    priorRoles,
    weekRoles,
    weekValues,
  }
}
