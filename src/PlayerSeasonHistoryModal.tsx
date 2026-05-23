import { useEffect, useMemo, useState } from 'react'
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

// ── Score-type bucket helpers (mirrors CourseStatsTab logic) ──────────────────

type RowKey = 'eagleOrBetter' | 'birdie' | 'par' | 'bogey' | 'double' | 'tripleOrWorse'

const ROW_KEYS: RowKey[] = ['eagleOrBetter', 'birdie', 'par', 'bogey', 'double', 'tripleOrWorse']

const ROW_LABELS: Record<RowKey, string> = {
  eagleOrBetter: 'Eagle',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  double: 'Double bogey',
  tripleOrWorse: 'Triple or worse',
}

const ROW_INDICATOR: Record<RowKey, string> = {
  eagleOrBetter: styles.courseStatsIndicatorEagle,
  birdie: styles.courseStatsIndicatorBirdie,
  par: styles.courseStatsIndicatorPar,
  bogey: styles.courseStatsIndicatorBogey,
  double: styles.courseStatsIndicatorDouble,
  tripleOrWorse: styles.courseStatsIndicatorTriple,
}

const ROW_REL: Record<RowKey, number> = {
  eagleOrBetter: -2,
  birdie: -1,
  par: 0,
  bogey: 1,
  double: 2,
  tripleOrWorse: 3,
}

type HoleBuckets = Record<RowKey, number> & { total: number }

function emptyBuckets(): HoleBuckets {
  return { eagleOrBetter: 0, birdie: 0, par: 0, bogey: 0, double: 0, tripleOrWorse: 0, total: 0 }
}

function addBuckets(a: HoleBuckets, b: HoleBuckets): void {
  for (const key of ROW_KEYS) a[key] += b[key]
  a.total += b.total
}

function avgRelToPar(b: HoleBuckets): number | null {
  if (b.total === 0) return null
  const weighted = ROW_KEYS.reduce((sum, key) => sum + b[key] * ROW_REL[key], 0)
  return weighted / b.total
}

function formatAvg(v: number | null): string {
  if (v === null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

function buildRankMap(statsMap: Map<number, HoleBuckets>, holes: number[]): Map<number, number> {
  const holesWithData = holes
    .map((h) => ({ hole: h, avg: avgRelToPar(statsMap.get(h)!) }))
    .filter((x): x is { hole: number; avg: number } => x.avg !== null)
    .sort((a, b) => b.avg - a.avg)
  const rankMap = new Map<number, number>()
  for (let i = 0; i < holesWithData.length; i++) {
    const curr = holesWithData[i]!
    const rank =
      i > 0 && curr.avg === holesWithData[i - 1]!.avg ? rankMap.get(holesWithData[i - 1]!.hole)! : i + 1
    rankMap.set(curr.hole, rank)
  }
  return rankMap
}

function computeStatsForPlayer(
  data: LeagueData,
  player: Player,
): { front: Map<number, HoleBuckets>; back: Map<number, HoleBuckets> } {
  const front = new Map<number, HoleBuckets>()
  const back = new Map<number, HoleBuckets>()
  for (let h = 1; h <= 9; h++) front.set(h, emptyBuckets())
  for (let h = 10; h <= 18; h++) back.set(h, emptyBuckets())

  const schedRows = data.schedule.filter((r) => !r.rainOut)

  for (const sched of schedRows) {
    const nine = sched.nine
    const statsMap = nine === 'front' ? front : back

    const scoreRow = data.weeklyScores[player.id]?.[sched.date]
    if (!scoreRow) continue
    if (scoreRow.pulledNet != null || scoreRow.pulledGross != null) continue

    const courseNine =
      nine === 'front'
        ? player.isSenior
          ? data.course.senior.front
          : data.course.nonSenior.front
        : player.isSenior
          ? data.course.senior.back
          : data.course.nonSenior.back

    for (let i = 0; i < 9; i++) {
      const score = scoreRow.holes[i]
      if (score == null) continue
      const par = courseNine.holes[i]?.par
      if (par == null) continue

      const rel = score - par
      const holeNum = nine === 'front' ? i + 1 : i + 10
      const b = statsMap.get(holeNum)!
      b.total++
      if (rel <= -2) b.eagleOrBetter++
      else if (rel === -1) b.birdie++
      else if (rel === 0) b.par++
      else if (rel === 1) b.bogey++
      else if (rel === 2) b.double++
      else b.tripleOrWorse++
    }
  }

  return { front, back }
}

function PlayerNineTable({
  statsMap,
  holeStart,
  title,
  leagueHcp,
}: {
  statsMap: Map<number, HoleBuckets>
  holeStart: number
  title: string
  leagueHcp: Map<number, number>
}) {
  const holes = Array.from({ length: 9 }, (_, i) => holeStart + i)
  const hasData = holes.some((h) => (statsMap.get(h)?.total ?? 0) > 0)

  const nineTotals = emptyBuckets()
  for (const h of holes) {
    const b = statsMap.get(h)
    if (b) addBuckets(nineTotals, b)
  }

  const hcpRank = buildRankMap(statsMap, holes)

  return (
    <div className={styles.courseStatsNine}>
      <h3 className={styles.courseStatsNineTitle}>{title}</h3>
      <div className={styles.standingsTableWrap}>
        <table className={`${styles.standingsTable} ${styles.courseStatsTable}`}>
          <thead>
            <tr>
              <th className={styles.courseStatsScoreCol}>Score</th>
              {holes.map((h) => (
                <th key={h} className={styles.courseStatsHoleCol}>
                  {h}
                </th>
              ))}
              <th className={styles.courseStatsTotalCol}>Total</th>
            </tr>
          </thead>
          {hasData ? (
            <>
              <tbody>
                {ROW_KEYS.map((key) => {
                  const rowTotal = holes.reduce((acc, h) => acc + (statsMap.get(h)?.[key] ?? 0), 0)
                  return (
                    <tr key={key}>
                      <td className={styles.courseStatsScoreLabel}>
                        <span
                          className={`${styles.courseStatsIndicator} ${ROW_INDICATOR[key]}`}
                          aria-hidden
                        />
                        {ROW_LABELS[key]}
                      </td>
                      {holes.map((h) => {
                        const val = statsMap.get(h)?.[key] ?? 0
                        return (
                          <td key={h} className={`${styles.courseStatsHoleCol} ${styles.courseStatsCount}`}>
                            {val > 0 ? val : <span className={styles.courseStatsDash}>—</span>}
                          </td>
                        )
                      })}
                      <td className={`${styles.courseStatsTotalCol} ${styles.courseStatsCount}`}>
                        {rowTotal > 0 ? rowTotal : <span className={styles.courseStatsDash}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={styles.courseStatsFooterRow}>
                  <td className={styles.courseStatsScoreLabel}>Avg vs par</td>
                  {holes.map((h) => {
                    const avg = avgRelToPar(statsMap.get(h)!)
                    const rank = hcpRank.get(h)
                    const bg =
                      rank != null
                        ? `hsla(${Math.round(((rank - 1) / 8) * 120)}, 60%, 38%, 0.55)`
                        : undefined
                    return (
                      <td
                        key={h}
                        className={`${styles.courseStatsHoleCol} ${styles.courseStatsAvgCell}`}
                        style={bg ? { background: bg } : undefined}
                      >
                        {formatAvg(avg)}
                      </td>
                    )
                  })}
                  <td className={`${styles.courseStatsTotalCol} ${styles.courseStatsAvgCell}`}>
                    {formatAvg(avgRelToPar(nineTotals))}
                  </td>
                </tr>
                <tr className={styles.courseStatsHcpRow}>
                  <td className={styles.courseStatsScoreLabel}>Hardest holes (rank)</td>
                  {holes.map((h) => {
                    const rank = hcpRank.get(h)
                    return (
                      <td
                        key={h}
                        className={`${styles.courseStatsHoleCol} ${rank != null ? styles.courseStatsHcpRank : ''}`}
                      >
                        {rank ?? <span className={styles.courseStatsDash}>—</span>}
                      </td>
                    )
                  })}
                  <td className={styles.courseStatsTotalCol}>
                    <span className={styles.courseStatsDash}>—</span>
                  </td>
                </tr>
                <tr className={styles.courseStatsHcpRow}>
                  <td className={styles.courseStatsScoreLabel}>Official League Handicap</td>
                  {holes.map((h) => {
                    const lhcp = leagueHcp.get(h)
                    return (
                      <td
                        key={h}
                        className={`${styles.courseStatsHoleCol} ${lhcp != null ? styles.courseStatsHcpCourse : ''}`}
                      >
                        {lhcp ?? <span className={styles.courseStatsDash}>—</span>}
                      </td>
                    )
                  })}
                  <td className={styles.courseStatsTotalCol}>
                    <span className={styles.courseStatsDash}>—</span>
                  </td>
                </tr>
              </tfoot>
            </>
          ) : (
            <tbody>
              <tr>
                <td colSpan={11} className={styles.courseStatsNoData}>
                  No scores available
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  )
}

type ModalTab = 'scores' | 'stats'

export type PlayerModalTab = ModalTab

export default function PlayerSeasonHistoryModal({
  data,
  player,
  onClose,
  initialTab = 'scores',
}: {
  data: LeagueData
  player: Player
  onClose: () => void
  initialTab?: PlayerModalTab
}) {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab)

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

  const { front: statsFront, back: statsBack } = useMemo(
    () => computeStatsForPlayer(data, player),
    [data, player],
  )

  const leagueHcp = useMemo(() => {
    const map = new Map<number, number>()
    const c = player.isSenior ? data.course.senior : data.course.nonSenior
    c.front.holes.forEach((hole, i) => {
      if (hole.leagueHandicap != null) map.set(i + 1, hole.leagueHandicap)
    })
    c.back.holes.forEach((hole, i) => {
      if (hole.leagueHandicap != null) map.set(i + 10, hole.leagueHandicap)
    })
    return map
  }, [data.course, player.isSenior])

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
          <div className={styles.playerModalTabToggle} role="group" aria-label="View selection">
            <button
              type="button"
              className={`${styles.playerModalTabBtn} ${activeTab === 'scores' ? styles.playerModalTabBtnActive : ''}`}
              onClick={() => setActiveTab('scores')}
            >
              Scores
            </button>
            <button
              type="button"
              className={`${styles.playerModalTabBtn} ${activeTab === 'stats' ? styles.playerModalTabBtnActive : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              Stats
            </button>
          </div>
          <button type="button" className={styles.weeklyHistoryClose} onClick={onClose}>
            Close
          </button>
        </header>

        {activeTab === 'scores' ? (
          <>
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
          </>
        ) : (
          <div className={`${styles.weeklyHistoryTableWrap} ${styles.playerStatsTabContent}`}>
            <PlayerNineTable
              statsMap={statsFront}
              holeStart={1}
              title="Front Nine"
              leagueHcp={leagueHcp}
            />
            <PlayerNineTable
              statsMap={statsBack}
              holeStart={10}
              title="Back Nine"
              leagueHcp={leagueHcp}
            />
          </div>
        )}
      </div>
    </div>
  )
}
