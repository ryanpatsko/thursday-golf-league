import { useMemo } from 'react'
import type { LeagueData } from './data/leagueTypes'
import {
  formatGreeniesDollars,
  greeniesSeasonStats,
  greeniesWeekSummary,
} from './lib/greenies'
import { weekNumbersInOrder } from './lib/scheduleWeek'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

export default function GreeniesTab({ data }: { data: LeagueData }) {
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])
  const { leaderboard, seniorSplit } = useMemo(() => greeniesSeasonStats(data), [data])
  const weekSections = useMemo(
    () =>
      weeks
        .map((week) => greeniesWeekSummary(data, week))
        .filter((s): s is NonNullable<typeof s> => s != null),
    [data, weeks],
  )

  const totalWins = seniorSplit.seniorWins + seniorSplit.nonSeniorWins

  return (
    <div className={styles.greeniesRoot}>
      <section className={styles.greeniesSummary} aria-label="Greenies season summary">
        <h2 className={styles.greeniesSummaryHeading}>Season</h2>
        <div className={styles.greeniesSeniorSplit}>
          <div className={styles.greeniesSeniorStat}>
            <span className={styles.greeniesSeniorStatValue}>{seniorSplit.seniorWins}</span>
            <span className={styles.greeniesSeniorStatLabel}>Senior wins</span>
          </div>
          <div className={styles.greeniesSeniorStat}>
            <span className={styles.greeniesSeniorStatValue}>{seniorSplit.nonSeniorWins}</span>
            <span className={styles.greeniesSeniorStatLabel}>Non-senior wins</span>
          </div>
          {totalWins > 0 ? (
            <p className={styles.greeniesSeniorNote}>
              {Math.round((seniorSplit.seniorWins / totalWins) * 100)}% of greenies won by seniors
            </p>
          ) : null}
        </div>

        {leaderboard.length === 0 ? (
          <p className={styles.greeniesEmpty}>No greenies recorded yet.</p>
        ) : (
          <div className={styles.greeniesTableWrap}>
            <table className={styles.greeniesTable}>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col" className={styles.greeniesNumCol}>
                    Wins
                  </th>
                  <th scope="col" className={styles.greeniesNumCol}>
                    Won
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(({ player, wins, earningsDollars }) => (
                  <tr key={player.id}>
                    <td>
                      <PlayerNameWithSenior name={player.name} isSenior={player.isSenior} />
                    </td>
                    <td className={styles.greeniesNumCol}>{wins}</td>
                    <td className={styles.greeniesNumCol}>{formatGreeniesDollars(earningsDollars)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.greeniesWeeks} aria-label="Greenies by week">
        <h2 className={styles.greeniesSummaryHeading}>By week</h2>
        {weekSections.map((summary) => {
          const hasWinners = summary.holes.some((h) => h.winner != null)
          return (
            <article key={summary.week} className={styles.greeniesWeek}>
              <h3 className={styles.greeniesWeekHeading}>{summary.title}</h3>
              <p className={styles.greeniesWeekMeta}>
                {summary.nine} nine · Pot {formatGreeniesDollars(summary.potDollars)} (
                {summary.eligibleCount} in) · {formatGreeniesDollars(summary.payoutPerWinner)} per par 3
              </p>
              {!hasWinners ? (
                <p className={styles.greeniesEmpty}>Winners not set</p>
              ) : (
                <ul className={styles.greeniesHoleList}>
                  {summary.holes.map((hole) => (
                    <li key={hole.holeNumber} className={styles.greeniesHoleItem}>
                      <span className={styles.greeniesHoleLabel}>
                        Hole {hole.displayHole}
                        <span className={styles.greeniesHoleYds}>{hole.yardage} yds</span>
                      </span>
                      {hole.winner ? (
                        <span className={styles.greeniesHoleWinner}>
                          <PlayerNameWithSenior
                            name={hole.winner.name}
                            isSenior={hole.winner.isSenior}
                          />
                          <span className={styles.greeniesHolePayout}>
                            {formatGreeniesDollars(hole.payoutDollars ?? 0)}
                          </span>
                        </span>
                      ) : (
                        <span className={styles.greeniesHolePending}>—</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
