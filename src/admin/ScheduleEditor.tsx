import { useState } from 'react'
import type { LeagueData, NineSide, ScheduleRow } from '../data/leagueTypes'
import { toIsoDateLocal } from '../lib/scheduleWeek'
import styles from './editors.module.css'

function sortedByDate(rows: ScheduleRow[]): ScheduleRow[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date))
}

/** Renumber all non-rain-out rows 1, 2, 3… in date order. Rain-out rows get leagueWeekNumber 0. */
function renumbered(rows: ScheduleRow[]): ScheduleRow[] {
  let wk = 1
  return sortedByDate(rows).map((r) =>
    r.rainOut ? { ...r, leagueWeekNumber: 0 } : { ...r, leagueWeekNumber: wk++ },
  )
}

function addMakeupRow(rows: ScheduleRow[]): ScheduleRow[] {
  const sorted = sortedByDate(rows)
  const lastRow = sorted.at(-1)!
  const lastDate = new Date(`${lastRow.date}T12:00:00`)
  lastDate.setDate(lastDate.getDate() + 7)
  const newDate = toIsoDateLocal(lastDate)
  const lastActive = sorted.filter((r) => !r.rainOut).at(-1)
  const newNine: NineSide = lastActive?.nine === 'front' ? 'back' : 'front'
  const newWeekNumber = sorted.filter((r) => !r.rainOut).length + 1
  return [...rows, { date: newDate, leagueWeekNumber: newWeekNumber, nine: newNine }]
}

/**
 * Build a map of old league week number → new league week number by comparing
 * the same calendar dates across two schedule states.
 */
function buildWeekMap(oldSchedule: ScheduleRow[], newSchedule: ScheduleRow[]): Map<number, number> {
  const oldByDate = new Map(
    oldSchedule.filter((r) => !r.rainOut).map((r) => [r.date, r.leagueWeekNumber]),
  )
  const newByDate = new Map(
    newSchedule.filter((r) => !r.rainOut).map((r) => [r.date, r.leagueWeekNumber]),
  )
  const map = new Map<number, number>()
  for (const [date, oldWk] of oldByDate) {
    const newWk = newByDate.get(date)
    if (newWk !== undefined && newWk !== oldWk) {
      map.set(oldWk, newWk)
    }
  }
  return map
}

/** Rename weeklyScores keys according to weekMap (old week number → new week number). */
function migrateWeeklyScores(
  weeklyScores: LeagueData['weeklyScores'],
  weekMap: Map<number, number>,
): LeagueData['weeklyScores'] {
  if (weekMap.size === 0) return weeklyScores
  const result: LeagueData['weeklyScores'] = {}
  for (const [playerId, byWeek] of Object.entries(weeklyScores)) {
    const newByWeek: Record<string, (typeof byWeek)[string]> = {}
    for (const [weekKey, scores] of Object.entries(byWeek)) {
      const oldWeek = Number(weekKey)
      const newWeek = weekMap.get(oldWeek) ?? oldWeek
      newByWeek[String(newWeek)] = scores
    }
    result[playerId] = newByWeek
  }
  return result
}

/**
 * Reconcile weeklyScores keys to match the active schedule weeks.
 * Sorts the week numbers that have score data and the active schedule week numbers,
 * then maps them positionally (1st score-week → 1st schedule-week, etc.).
 * This repairs scores that ended up under the wrong week number after a rain-out
 * was applied before migration logic existed.
 */
function reconcileScoresToSchedule(data: LeagueData): LeagueData {
  const scheduleWeeks = [...data.schedule]
    .filter((r) => !r.rainOut)
    .map((r) => r.leagueWeekNumber)
    .sort((a, b) => a - b)

  const usedWeekKeys = new Set<number>()
  for (const byWeek of Object.values(data.weeklyScores)) {
    for (const k of Object.keys(byWeek)) usedWeekKeys.add(Number(k))
  }
  const scoreWeeks = [...usedWeekKeys].sort((a, b) => a - b)

  const weekMap = new Map<number, number>()
  scoreWeeks.forEach((oldWk, i) => {
    const newWk = scheduleWeeks[i]
    if (newWk !== undefined && newWk !== oldWk) weekMap.set(oldWk, newWk)
  })

  return { ...data, weeklyScores: migrateWeeklyScores(data.weeklyScores, weekMap) }
}

function applyRainOut(data: LeagueData, targetDate: string): LeagueData {
  let rows = data.schedule.map((r) =>
    r.date === targetDate ? { ...r, rainOut: true as const, leagueWeekNumber: 0 } : r,
  )
  rows = renumbered(rows)
  if (rows.filter((r) => !r.rainOut).length < data.meta.totalWeeks) {
    rows = addMakeupRow(rows)
  }
  const weekMap = buildWeekMap(data.schedule, rows)
  return { ...data, schedule: rows, weeklyScores: migrateWeeklyScores(data.weeklyScores, weekMap) }
}

function restoreRainOut(data: LeagueData, targetDate: string): LeagueData {
  let rows = data.schedule.map((r) => {
    if (r.date !== targetDate) return r
    const { rainOut: _, ...rest } = r
    return rest as ScheduleRow
  })
  rows = renumbered(rows)
  const activeRows = sortedByDate(rows).filter((r) => !r.rainOut)
  if (activeRows.length > data.meta.totalWeeks) {
    const lastActive = activeRows.at(-1)!
    rows = rows.filter((r) => r.date !== lastActive.date)
  }
  const weekMap = buildWeekMap(data.schedule, rows)
  return { ...data, schedule: rows, weeklyScores: migrateWeeklyScores(data.weeklyScores, weekMap) }
}

const WEEK_NUM_RE = /^\d{1,2}$/

export default function ScheduleEditor({
  data,
  onChange,
  persistLeague,
  setSaveMsg,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
  persistLeague: (doc: LeagueData) => Promise<{ ok: true } | { ok: false; message: string }>
  setSaveMsg: (msg: string | null) => void
}) {
  const { meta } = data
  const schedule = sortedByDate(data.schedule)
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false)
  const [reconcileSaving, setReconcileSaving] = useState(false)

  // Only show reconcile panel when score keys are still old-style week numbers (not dates).
  // After the date-based migration runs on load this will be false and the panel disappears.
  const hasLegacyKeys = Object.values(data.weeklyScores).some((byWeek) =>
    Object.keys(byWeek).some((k) => WEEK_NUM_RE.test(k)),
  )

  // Preview what reconcileScoresToSchedule would do (only meaningful for legacy keys)
  const reconcilePreview = (() => {
    if (!hasLegacyKeys) return []
    const scheduleWeeks = schedule
      .filter((r) => !r.rainOut)
      .map((r) => r.leagueWeekNumber)
      .sort((a, b) => a - b)
    const usedWeekKeys = new Set<number>()
    for (const byWeek of Object.values(data.weeklyScores)) {
      for (const k of Object.keys(byWeek)) {
        if (WEEK_NUM_RE.test(k)) usedWeekKeys.add(Number(k))
      }
    }
    const scoreWeeks = [...usedWeekKeys].sort((a, b) => a - b)
    const moves: string[] = []
    scoreWeeks.forEach((oldWk, i) => {
      const newWk = scheduleWeeks[i]
      if (newWk !== undefined && newWk !== oldWk) moves.push(`Week ${oldWk} → Week ${newWk}`)
    })
    return moves
  })()

  return (
    <div className={styles.stack}>
      <div className={styles.scheduleMetaRow}>
        <label className={styles.field}>
          Season year
          <input
            className={`${styles.input} ${styles.inputScheduleMetaShort}`}
            type="number"
            value={meta.seasonYear}
            onChange={(e) =>
              onChange({
                ...data,
                meta: { ...meta, seasonYear: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className={styles.field}>
          First Thursday
          <input
            className={`${styles.input} ${styles.inputScheduleMetaDate}`}
            value={meta.seasonStartDate}
            onChange={(e) =>
              onChange({
                ...data,
                meta: { ...meta, seasonStartDate: e.target.value.trim() },
              })
            }
          />
        </label>
        <label className={styles.field}>
          Weeks per half
          <input
            className={`${styles.input} ${styles.inputScheduleMetaShort}`}
            type="number"
            min={1}
            max={25}
            value={meta.weeksPerHalf}
            onChange={(e) =>
              onChange({
                ...data,
                meta: { ...meta, weeksPerHalf: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className={styles.field}>
          Total league weeks
          <input
            className={`${styles.input} ${styles.inputScheduleMetaShort}`}
            type="number"
            min={1}
            max={40}
            value={meta.totalWeeks}
            onChange={(e) =>
              onChange({
                ...data,
                meta: { ...meta, totalWeeks: Number(e.target.value) },
              })
            }
          />
        </label>
      </div>
      {hasLegacyKeys && reconcilePreview.length > 0 && (
        <div className={styles.scheduleReconcileBox}>
          <p className={styles.scheduleReconcileHeading}>
            Score week numbers are out of sync with the schedule.
          </p>
          <p className={styles.scheduleReconcileDetail}>
            Clicking <strong>Fix now</strong> will remap scores to match the current schedule
            week order ({reconcilePreview.join(', ')}) and immediately save to the server.
          </p>
          {showReconcileConfirm ? (
            <div className={styles.scheduleReconcileActions}>
              <span className={styles.scheduleReconcileConfirmText}>Are you sure?</span>
              <button
                type="button"
                className={styles.btn}
                disabled={reconcileSaving}
                onClick={() => setShowReconcileConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={reconcileSaving}
                onClick={async () => {
                  setReconcileSaving(true)
                  setSaveMsg(null)
                  const fixed = reconcileScoresToSchedule(data)
                  onChange(fixed)
                  const result = await persistLeague(fixed)
                  setSaveMsg(result.ok ? 'Saved.' : result.message)
                  setShowReconcileConfirm(false)
                  setReconcileSaving(false)
                }}
              >
                {reconcileSaving ? 'Saving…' : 'Yes, fix it'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setShowReconcileConfirm(true)}
            >
              Fix now
            </button>
          )}
        </div>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Week #</th>
              <th>Nine</th>
              <th aria-label="Rain-out actions" />
            </tr>
          </thead>
          <tbody>
            {schedule.map((row, idx) => (
              <tr
                key={`${row.date}-${idx}`}
                className={row.rainOut ? styles.scheduleRainOutRow : undefined}
              >
                <td>
                  <input
                    className={styles.inputScheduleTableDate}
                    value={row.date}
                    onChange={(e) => {
                      const next = data.schedule.map((r) =>
                        r === row ? { ...r, date: e.target.value.trim() } : r,
                      )
                      onChange({ ...data, schedule: next })
                    }}
                  />
                </td>
                <td>
                  {row.rainOut ? (
                    <span className={styles.scheduleRainOutLabel}>Rain out</span>
                  ) : (
                    <input
                      className={styles.inputNarrow}
                      type="number"
                      min={1}
                      max={99}
                      value={row.leagueWeekNumber}
                      onChange={(e) => {
                        const next = data.schedule.map((r) =>
                          r === row ? { ...r, leagueWeekNumber: Number(e.target.value) } : r,
                        )
                        onChange({ ...data, schedule: next })
                      }}
                    />
                  )}
                </td>
                <td>
                  <select
                    className={styles.inputMed}
                    value={row.nine}
                    disabled={row.rainOut}
                    onChange={(e) => {
                      const nine = e.target.value === 'front' ? 'front' : ('back' as NineSide)
                      const next = data.schedule.map((r) => (r === row ? { ...r, nine } : r))
                      onChange({ ...data, schedule: next })
                    }}
                  >
                    <option value="front">Front</option>
                    <option value="back">Back</option>
                  </select>
                </td>
                <td>
                  {row.rainOut ? (
                    <button
                      type="button"
                      className={styles.btn}
                      title="Restore this week — removes the makeup row added at the end"
                      onClick={() => onChange(restoreRainOut(data, row.date))}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.scheduleRainOutBtn}
                      title="Mark as rain out — renumbers remaining weeks and adds a makeup date at the end"
                      onClick={() => onChange(applyRainOut(data, row.date))}
                    >
                      Rain out
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
