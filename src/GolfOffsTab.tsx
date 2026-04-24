import { useMemo } from 'react'
import type { LeagueData, Player } from './data/leagueTypes'
import { grossTotalFromHoles } from './lib/handicap'
import { formatIsoDateForDisplay } from './lib/formatIsoDateDisplay'
import { weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

type GolfOffEntry = { player: Player; playedDate: string; gross: number | null }

function golfOffsForWeek(data: LeagueData, week: number): GolfOffEntry[] {
  const wkDate = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)?.date ?? ''
  const out: GolfOffEntry[] = []
  for (const p of data.players) {
    const row = data.weeklyScores[p.id]?.[wkDate]
    const d = row?.golfOffPlayedDate
    if (d) out.push({ player: p, playedDate: d, gross: grossTotalFromHoles(row) })
  }
  out.sort((a, b) => {
    const dc = a.playedDate.localeCompare(b.playedDate)
    if (dc !== 0) return dc
    return a.player.name.localeCompare(b.player.name)
  })
  return out
}

export default function GolfOffsTab({ data }: { data: LeagueData }) {
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])
  const sections = useMemo(
    () =>
      weeks.map((week) => ({
        week,
        title: weekSelectLabel(data, week),
        entries: golfOffsForWeek(data, week),
      })),
    [data, weeks],
  )

  return (
    <div className={styles.golfOffsRoot}>
      {sections.map(({ week, title, entries }) => (
        <section key={week} className={styles.golfOffsWeek}>
          <h2 className={styles.golfOffsWeekHeading}>{title}</h2>
          {entries.length === 0 ? (
            <p className={styles.golfOffsEmpty}>No golf-offs submitted</p>
          ) : (
            <ul className={styles.golfOffsList}>
              {entries.map(({ player, playedDate, gross }) => (
                <li key={player.id} className={styles.golfOffsListItem}>
                  <span className={styles.golfOffsPlayer}>
                    <PlayerNameWithSenior name={player.name} isSenior={player.isSenior} />
                  </span>
                  <span className={styles.golfOffsDetails}>
                    <span className={styles.golfOffsMeta}>{formatIsoDateForDisplay(playedDate)}</span>
                    <span className={styles.golfOffsGrs} title="9-hole gross">
                      GROSS {gross == null ? '—' : gross}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
