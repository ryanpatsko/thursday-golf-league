import type { LeagueData } from '../data/leagueTypes'
import styles from './editors.module.css'

export default function ScheduleEditor({
  data,
  onChange,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
}) {
  const { meta, schedule } = data

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
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Week #</th>
              <th>Nine</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row, idx) => (
              <tr key={`${row.date}-${idx}`}>
                <td>
                  <input
                    className={styles.inputScheduleTableDate}
                    value={row.date}
                    onChange={(e) => {
                      const next = [...schedule]
                      next[idx] = { ...row, date: e.target.value.trim() }
                      onChange({ ...data, schedule: next })
                    }}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputNarrow}
                    type="number"
                    min={1}
                    max={99}
                    value={row.leagueWeekNumber}
                    onChange={(e) => {
                      const next = [...schedule]
                      next[idx] = { ...row, leagueWeekNumber: Number(e.target.value) }
                      onChange({ ...data, schedule: next })
                    }}
                  />
                </td>
                <td>
                  <select
                    className={styles.inputMed}
                    value={row.nine}
                    onChange={(e) => {
                      const next = [...schedule]
                      const nine = e.target.value === 'front' ? 'front' : 'back'
                      next[idx] = { ...row, nine }
                      onChange({ ...data, schedule: next })
                    }}
                  >
                    <option value="front">Front</option>
                    <option value="back">Back</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
