import { useEffect, useMemo } from 'react'
import type { LeagueData, Player } from './data/leagueTypes'
import {
  formatHandicapIndex,
  getNineForWeek,
  grossTotalFromHoles,
  isPullRow,
  netTotalForRow,
  playerHandicapIndexAtWeek,
} from './lib/handicap'
import { holeScoreBadgeClassName } from './lib/holeScoreDisplay'
import {
  flightPointsForWeek,
  formatStandingPoints,
  handicapTotalsBeforeWeek,
} from './lib/leagueScoring'
import { formatIsoDateForDisplay } from './lib/formatIsoDateDisplay'
import styles from './Home.module.css'

const HOLE_COUNT = 9

export default function PlayerSeasonHistoryModal({
  data,
  player,
  onClose,
}: {
  data: LeagueData
  player: Player
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rounds = useMemo(() => {
    const sorted = [...data.schedule].filter((r) => !r.rainOut).sort((a, b) => a.date.localeCompare(b.date))
    return sorted.map((schedule) => {
      const week = schedule.leagueWeekNumber
      const nineSide = schedule.nine
      const scoreRow = data.weeklyScores[player.id]?.[schedule.date]
      const nine = getNineForWeek(data.course, nineSide, player)
      const gross = grossTotalFromHoles(scoreRow)
      const handicapHistory = handicapTotalsBeforeWeek(data, player, week)
      const hcp = playerHandicapIndexAtWeek(player, handicapHistory, week)
      const net = netTotalForRow(scoreRow, hcp)
      const flightPts = flightPointsForWeek(data, player.flight, week).get(player.id) ?? 0
      return { schedule, week, nineSide, scoreRow, nine, gross, net, hcp, flightPts }
    })
  }, [data, player])

  const playerFrontHoles = (player.isSenior ? data.course.senior.front : data.course.nonSenior.front).holes
  const playerBackHoles = (player.isSenior ? data.course.senior.back : data.course.nonSenior.back).holes
  const priorLast7Scores = player.priorSeasonScores.slice(-7)

  return (
    <div
      className={styles.weeklyHistoryBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={styles.weeklyHistoryDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-history-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.weeklyHistoryHeader}>
          <h2 id="weekly-history-title" className={styles.weeklyHistoryTitle}>
            {player.name} ({player.flight}) - SEASON
          </h2>
          <button type="button" className={styles.weeklyHistoryClose} onClick={onClose}>
            Close
          </button>
        </header>
        <div className={styles.weeklyHistoryTableWrap}>
          <table className={`${styles.weeklyTable} ${styles.weeklyHistoryTable}`}>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className={`${styles.weeklyStickyCol} ${styles.weeklyHistoryDateCol}`}>
                  Date
                </th>
                <th rowSpan={2} scope="col" className={styles.weeklyThNum}>
                  Wk
                </th>
                <th rowSpan={2} scope="col" className={styles.weeklyThFlight}>
                  Nine
                </th>
                {Array.from({ length: HOLE_COUNT }, (_, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={`${styles.weeklyThHole} ${styles.weeklyHistoryHoleHead}`}
                  >
                    <span className={styles.weeklyThHoleNumPair}>
                      {i + 1}
                      <span className={styles.weeklyMetaSep}>/</span>
                      {i + 10}
                    </span>
                  </th>
                ))}
                <th rowSpan={2} scope="col" className={`${styles.weeklyThNum} ${styles.weeklyThSep}`}>
                  Gross
                </th>
                <th rowSpan={2} scope="col" className={`${styles.weeklyThNum} ${styles.weeklyThSepLeft}`}>
                  Net
                </th>
                <th rowSpan={2} scope="col" className={styles.weeklyThNum}>
                  HCP
                </th>
                <th rowSpan={2} scope="col" className={`${styles.weeklyThNum} ${styles.weeklyThSepLeft}`}>
                  FLPTS
                </th>
              </tr>
              <tr>
                {Array.from({ length: HOLE_COUNT }, (_, i) => (
                  <th
                    key={`par-${i}`}
                    scope="col"
                    className={`${styles.weeklyThPar} ${player.isSenior ? styles.weeklyHistoryParSenior : ''}`}
                  >
                    {playerFrontHoles[i]?.par ?? '—'}
                    <span className={styles.weeklyMetaSep}>/</span>
                    {playerBackHoles[i]?.par ?? '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rounds.map(
                ({
                  schedule,
                  week,
                  nineSide,
                  scoreRow: row,
                  nine,
                  gross,
                  net,
                  hcp: idx,
                  flightPts,
                }) => (
                  <tr key={`${schedule.date}-w${week}-${nineSide}`}>
                    <td className={`${styles.weeklyStickyCol} ${styles.weeklyHistoryDateCol}`}>
                      <div className={styles.weeklyPlayerCell}>
                        <span>{formatIsoDateForDisplay(schedule.date)}</span>
                        {row?.golfOffPlayedDate ? (
                          <span className={styles.weeklyGolfOffNote} title="Golf-off round">
                            Golf-off {formatIsoDateForDisplay(row.golfOffPlayedDate)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={styles.weeklyTdNum}>{week}</td>
                    <td className={styles.weeklyHistoryNineTd}>
                      {nineSide === 'front' ? 'Front' : 'Back'}
                    </td>
                    {nine.holes.map((h, i) => {
                      const stroke = row?.holes[i] ?? null
                      const badge = holeScoreBadgeClassName(stroke, h.par)
                      return (
                        <td key={h.holeNumber} className={styles.weeklyTdHole}>
                          {stroke == null ? (
                            '—'
                          ) : badge ? (
                            <span className={badge}>{stroke}</span>
                          ) : (
                            stroke
                          )}
                        </td>
                      )
                    })}
                    <td className={`${styles.weeklyTdNum} ${styles.weeklyThSep}`}>
                      {isPullRow(row) ? (
                        <span className={styles.weeklyPullBadge} title="Pull — net score copied from a flight peer">
                          P
                        </span>
                      ) : gross == null ? (
                        '—'
                      ) : (
                        gross
                      )}
                    </td>
                    <td className={`${styles.weeklyTdNum} ${styles.weeklyThSepLeft}`}>
                      {net == null ? '—' : net}
                    </td>
                    <td className={styles.weeklyTdNum}>{formatHandicapIndex(idx)}</td>
                    <td className={`${styles.weeklyTdNum} ${styles.weeklyThSepLeft}`}>
                      {isPullRow(row) || net == null ? '—' : formatStandingPoints(flightPts)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className={styles.weeklyHistoryFooter}>
          Last 7 scores from last year:{' '}
          {priorLast7Scores.length > 0 ? priorLast7Scores.join(', ') : '—'}
        </p>
      </div>
    </div>
  )
}
