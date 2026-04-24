import type { LeagueData, LeagueMeta } from '../data/leagueTypes'
import { formatIsoDateUsMdY } from './formatIsoDateDisplay'

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Default week: league night on this calendar Thursday (today) if it matches a row;
 * else the first scheduled week on or after today; else the last scheduled week.
 * Rain-out rows are excluded.
 */
export function defaultLeagueWeekNumber(data: LeagueData, today: Date = new Date()): number {
  const iso = toIsoDateLocal(today)
  const dow = today.getDay()
  const rows = [...data.schedule]
    .filter((r) => !r.rainOut)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length === 0) return 1

  if (dow === 4) {
    const row = rows.find((r) => r.date === iso)
    if (row) return row.leagueWeekNumber
  }

  const upcoming = rows.find((r) => r.date >= iso)
  if (upcoming) return upcoming.leagueWeekNumber

  return rows[rows.length - 1]!.leagueWeekNumber
}

/**
 * Returns the ISO date for the active (non-rain-out) schedule row with the given week number,
 * or `undefined` if no matching row exists. Use this to look up weeklyScores by date.
 */
export function dateForWeek(schedule: LeagueData['schedule'], weekNum: number): string | undefined {
  return schedule.find((r) => r.leagueWeekNumber === weekNum && !r.rainOut)?.date
}

/** Active (non-rain-out) league week numbers in ascending order. */
export function weekNumbersInOrder(data: LeagueData): number[] {
  return [...new Set(data.schedule.filter((r) => !r.rainOut).map((r) => r.leagueWeekNumber))].sort(
    (a, b) => a - b,
  )
}

/** Label for week dropdowns, e.g. `Week 1 · 4/16/2026`. */
export function weekSelectLabel(data: LeagueData, week: number): string {
  const row = data.schedule.find((r) => r.leagueWeekNumber === week)
  return row ? `Week ${week} · ${formatIsoDateUsMdY(row.date)}` : `Week ${week}`
}

/** Course hole number on the scorecard for this league nine (front 1–9, back 10–18). */
export function displayHoleNumberOnNine(scheduledNine: 'front' | 'back', index: number): number {
  return scheduledNine === 'front' ? index + 1 : index + 10
}

/** League week numbers for the half containing `week` (e.g. 1–9 vs 10–18). */
export function halfWeekRange(meta: LeagueMeta, week: number): { start: number; end: number } {
  const { weeksPerHalf, totalWeeks } = meta
  if (week <= weeksPerHalf) return { start: 1, end: weeksPerHalf }
  return { start: weeksPerHalf + 1, end: totalWeeks }
}

/** Scheduled weeks from the start of `week`'s half through `asOfWeek` (inclusive). */
export function leagueWeeksInHalfThrough(data: LeagueData, asOfWeek: number): number[] {
  const { start } = halfWeekRange(data.meta, asOfWeek)
  return weekNumbersInOrder(data).filter((w) => w >= start && w <= asOfWeek)
}
