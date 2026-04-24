import type { Course, CourseNine, LeagueData, Player, ScheduleRow, WeeklyScoreRow } from '../data/leagueTypes'

function normalizeHandicapOverride(
  raw: Player['handicapOverride'],
): Player['handicapOverride'] | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const active = raw.active === true
  const v = typeof raw.value === 'number' ? raw.value : Number(raw.value)
  if (!Number.isFinite(v)) return undefined
  return { value: v, active }
}
import {
  defaultLeagueSeniorIds,
  ensureLakevueNorthHandicapsAndLabels,
  lakevueNorthSeniorHalves,
} from '../data/defaultLeagueData'
import { addDaysIso } from './dates'

function isLegacyCourse(course: unknown): course is { name: string; front: CourseNine; back: CourseNine } {
  if (!course || typeof course !== 'object') return false
  const c = course as Record<string, unknown>
  return (
    typeof c.name === 'string' &&
    c.front != null &&
    c.back != null &&
    c.nonSenior == null &&
    c.senior == null
  )
}

/** If the schedule has fewer rows than `meta.totalWeeks`, append weeks (date +7, alternating nine). */
function padScheduleToMetaTotalWeeks(data: LeagueData): LeagueData {
  const { schedule, meta } = data
  if (schedule.length >= meta.totalWeeks) return data
  const next: ScheduleRow[] = [...schedule]
  while (next.length < meta.totalWeeks) {
    const prev = next[next.length - 1]
    if (!prev) break
    const leagueWeekNumber = prev.leagueWeekNumber + 1
    next.push({
      date: addDaysIso(prev.date, 7),
      leagueWeekNumber,
      nine: prev.nine === 'front' ? 'back' : 'front',
      ...(leagueWeekNumber === 19 ? { label: 'Playoffs' } : {}),
    })
  }
  return { ...data, schedule: next }
}

const WEEK_NUM_RE = /^\d{1,2}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Migrates weeklyScores from legacy week-number keys ("1", "2", …) to ISO date keys
 * ("2026-04-23", …).
 *
 * Uses a **positional** reconcile before mapping to dates: the i-th unique week-number key
 * found across the entire dataset is mapped to the i-th active schedule week.  This correctly
 * handles the rain-out scenario where, e.g., all scores were stored under key "2" but the
 * rain-out renumbered that date as week 1 — so "2" maps to the week-1 date, not week-2.
 *
 * Date-keyed entries are passed through unchanged.
 */
function migrateWeeklyScoresToDateKeys(data: LeagueData): LeagueData {
  const hasLegacyKeys = Object.values(data.weeklyScores).some((byWeek) =>
    Object.keys(byWeek).some((k) => WEEK_NUM_RE.test(k)),
  )
  if (!hasLegacyKeys) return data

  // Active schedule rows in week-number order, used for the positional mapping
  const activeScheduleRows = data.schedule
    .filter((r) => !r.rainOut && r.leagueWeekNumber > 0)
    .sort((a, b) => a.leagueWeekNumber - b.leagueWeekNumber)

  // Collect all unique legacy week-number keys across all players, sorted numerically
  const allUsedLegacyKeys = [
    ...new Set(
      Object.values(data.weeklyScores).flatMap((byWeek) =>
        Object.keys(byWeek)
          .filter((k) => WEEK_NUM_RE.test(k))
          .map(Number),
      ),
    ),
  ].sort((a, b) => a - b)

  // Positional reconcile: the i-th legacy key maps to the i-th active schedule week's date.
  // Example: only key "2" exists, schedule's first active week is "2026-04-23" → "2" → that date.
  const legacyKeyToDate = new Map<number, string>()
  allUsedLegacyKeys.forEach((key, i) => {
    const schedRow = activeScheduleRows[i]
    if (schedRow) legacyKeyToDate.set(key, schedRow.date)
  })

  const newScores: Record<string, Record<string, WeeklyScoreRow>> = {}
  for (const [playerId, byWeek] of Object.entries(data.weeklyScores)) {
    const newByWeek: Record<string, WeeklyScoreRow> = {}
    for (const [key, row] of Object.entries(byWeek)) {
      if (ISO_DATE_RE.test(key)) {
        newByWeek[key] = row // already a date key — pass through
      } else if (WEEK_NUM_RE.test(key)) {
        const date = legacyKeyToDate.get(Number(key))
        if (date) newByWeek[date] = row
      }
    }
    if (Object.keys(newByWeek).length > 0) newScores[playerId] = newByWeek
  }
  return { ...data, weeklyScores: newScores }
}

/** Upgrades pre–dual-tee JSON and ensures `isSenior` exists on players. */
export function migrateLeagueData(raw: LeagueData): LeagueData {
  let course: Course = raw.course
  if (isLegacyCourse(course)) {
    const front = course.front
    const back = course.back
    course = {
      name: course.name,
      nonSenior: { front, back },
      senior: lakevueNorthSeniorHalves(),
    }
  }

  course = ensureLakevueNorthHandicapsAndLabels(course)

  const players: Player[] = raw.players.map((p) => {
    const isSenior =
      typeof p.isSenior === 'boolean' ? p.isSenior : defaultLeagueSeniorIds.has(p.id)
    const handicapOverride = normalizeHandicapOverride(p.handicapOverride)
    return { ...p, isSenior, handicapOverride }
  })

  let out: LeagueData = { ...raw, course, players }

  // 2026 league: 18 regular weeks + week 19 playoffs (saved S3 JSON before this change).
  if (
    out.meta.seasonYear === 2026 &&
    out.meta.totalWeeks === 18 &&
    out.schedule.length === 18
  ) {
    out = { ...out, meta: { ...out.meta, totalWeeks: 19 } }
  }
  out = padScheduleToMetaTotalWeeks(out)
  out = migrateWeeklyScoresToDateKeys(out)

  return out
}
