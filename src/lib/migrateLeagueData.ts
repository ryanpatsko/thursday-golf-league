import type { Course, CourseNine, LeagueData, Player, ScheduleRow } from '../data/leagueTypes'

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

  return out
}
