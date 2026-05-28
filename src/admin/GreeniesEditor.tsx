import { useMemo } from 'react'
import type { LeagueData } from '../data/leagueTypes'
import {
  commitGreeniesWinner,
  eligibleGreeniesPlayerCount,
  formatGreeniesDollars,
  GREENIES_ENTRY_FEE,
  greeniesPotDollars,
  greeniesWinnerPayoutDollars,
  greeniesWinnersForWeek,
  par3HolesOnNine,
} from '../lib/greenies'
import { displayHoleNumberOnNine, weekNumbersInOrder, weekSelectLabel } from '../lib/scheduleWeek'
import styles from './editors.module.css'

export default function GreeniesEditor({
  data,
  selectedWeek,
  onSelectWeek,
  persistLeague,
  setSaveMsg,
}: {
  data: LeagueData
  selectedWeek: number
  onSelectWeek: (week: number) => void
  persistLeague: (doc: LeagueData) => Promise<{ ok: true } | { ok: false; message: string }>
  setSaveMsg: (msg: string | null) => void
}) {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === selectedWeek && !s.rainOut)
  const weekKeys = weekNumbersInOrder(data)
  const players = useMemo(
    () => [...data.players].sort((a, b) => a.name.localeCompare(b.name)),
    [data.players],
  )

  const scheduledNine = sched?.nine
  const par3Holes = scheduledNine != null ? par3HolesOnNine(data.course, scheduledNine) : []
  const eligibleCount = eligibleGreeniesPlayerCount(data, selectedWeek)
  const pot = greeniesPotDollars(eligibleCount)
  const payout = greeniesWinnerPayoutDollars(eligibleCount)
  const winners = greeniesWinnersForWeek(data.greenies, selectedWeek, data.schedule)

  async function onWinnerChange(holeNumber: number, playerId: string) {
    const next = commitGreeniesWinner(data, selectedWeek, holeNumber, playerId)
    const r = await persistLeague(next)
    if (r.ok) setSaveMsg('Saved Greenies.')
    else setSaveMsg(r.message)
  }

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <label className={styles.inline}>
          Week
          <select
            className={styles.weekSelect}
            value={selectedWeek}
            onChange={(e) => onSelectWeek(Number(e.target.value))}
          >
            {weekKeys.map((w) => (
              <option key={w} value={w}>
                {weekSelectLabel(data, w)}
              </option>
            ))}
          </select>
        </label>
        {sched ? (
          <span className={styles.help}>
            League night: <strong>{sched.nine}</strong> nine · Pot{' '}
            <strong>{formatGreeniesDollars(pot)}</strong> ({eligibleCount} in × ${GREENIES_ENTRY_FEE}) ·{' '}
            {formatGreeniesDollars(payout)} per par 3
          </span>
        ) : null}
      </div>

      {!sched || !scheduledNine ? (
        <p className={styles.warnBox}>No schedule row matches this week number.</p>
      ) : par3Holes.length === 0 ? (
        <p className={styles.warnBox}>No par 3 holes on this nine.</p>
      ) : (
        <div className={styles.greeniesAdminList}>
          {par3Holes.map((hole) => {
            const displayHole = displayHoleNumberOnNine(scheduledNine, hole.holeNumber - 1)
            const selected = winners[String(hole.holeNumber)] ?? ''
            return (
              <label key={hole.holeNumber} className={styles.greeniesAdminRow}>
                <span className={styles.greeniesAdminHole}>
                  Hole {displayHole}
                  <span className={styles.greeniesAdminHoleMeta}>
                    par 3 · {hole.yardage} yds
                  </span>
                </span>
                <select
                  className={styles.greeniesAdminSelect}
                  value={selected}
                  onChange={(e) => void onWinnerChange(hole.holeNumber, e.target.value)}
                >
                  <option value="">— No winner —</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isSenior ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>
      )}

      <p className={styles.help}>
        Pot includes every rostered player except golf-offs and pulls ($2 each). Each par-3 winner
        takes half the pot.
      </p>
    </div>
  )
}
