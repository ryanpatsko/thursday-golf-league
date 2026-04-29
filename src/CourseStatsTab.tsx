import { useState, useMemo } from 'react'
import type { LeagueData } from './data/leagueTypes'
import { weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import styles from './Home.module.css'

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

const ROW_CSS_KEY: Record<RowKey, keyof typeof styles> = {
  eagleOrBetter: 'courseStatsRowEagle',
  birdie: 'courseStatsRowBirdie',
  par: 'courseStatsRowPar',
  bogey: 'courseStatsRowBogey',
  double: 'courseStatsRowDouble',
  tripleOrWorse: 'courseStatsRowTriple',
}

const ROW_INDICATOR: Record<RowKey, keyof typeof styles> = {
  eagleOrBetter: 'courseStatsIndicatorEagle',
  birdie: 'courseStatsIndicatorBirdie',
  par: 'courseStatsIndicatorPar',
  bogey: 'courseStatsIndicatorBogey',
  double: 'courseStatsIndicatorDouble',
  tripleOrWorse: 'courseStatsIndicatorTriple',
}

// Relative-to-par weight for each bucket (eagle uses -2 as representative)
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

/** Rank holes by avg vs par descending (1 = hardest). Ties share the same rank. */
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

function computeStats(
  data: LeagueData,
  filterWeek: number | null,
): { front: Map<number, HoleBuckets>; back: Map<number, HoleBuckets> } {
  const front = new Map<number, HoleBuckets>()
  const back = new Map<number, HoleBuckets>()
  for (let h = 1; h <= 9; h++) front.set(h, emptyBuckets())
  for (let h = 10; h <= 18; h++) back.set(h, emptyBuckets())

  const schedRows = data.schedule.filter(
    (r) => !r.rainOut && (filterWeek === null || r.leagueWeekNumber === filterWeek),
  )

  for (const sched of schedRows) {
    const nine = sched.nine
    const statsMap = nine === 'front' ? front : back

    for (const player of data.players) {
      const scoreRow = data.weeklyScores[player.id]?.[sched.date]
      if (!scoreRow) continue

      // Skip pulled scores — no actual hole-by-hole data
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
  }

  return { front, back }
}

function NineTable({
  statsMap,
  holeStart,
  title,
  fullCourseRank,
  courseHcp,
}: {
  statsMap: Map<number, HoleBuckets>
  holeStart: number
  title: string
  fullCourseRank: Map<number, number>
  courseHcp: Map<number, number>
}) {
  const holes = Array.from({ length: 9 }, (_, i) => holeStart + i)
  const hasData = holes.some((h) => (statsMap.get(h)?.total ?? 0) > 0)
  const nineHcpLabel = holeStart === 1 ? 'Front 9 Handicap' : 'Back 9 Handicap'

  // Aggregate all holes into a single bucket for the Total column
  const nineTotals = emptyBuckets()
  for (const h of holes) {
    const b = statsMap.get(h)
    if (b) addBuckets(nineTotals, b)
  }

  const hcpRank = buildRankMap(statsMap, holes)

  return (
    <div className={styles.courseStatsNine}>
      <h2 className={styles.courseStatsNineTitle}>{title}</h2>
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
                    <tr key={key} className={styles[ROW_CSS_KEY[key]]}>
                      <td className={styles.courseStatsScoreLabel}>
                        <span className={`${styles.courseStatsIndicator} ${styles[ROW_INDICATOR[key]]}`} aria-hidden />
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
                  <td className={styles.courseStatsScoreLabel}>{nineHcpLabel}</td>
                  {holes.map((h) => {
                    const rank = hcpRank.get(h)
                    return (
                      <td key={h} className={`${styles.courseStatsHoleCol} ${rank != null ? styles.courseStatsHcpRank : ''}`}>
                        {rank ?? <span className={styles.courseStatsDash}>—</span>}
                      </td>
                    )
                  })}
                  <td className={styles.courseStatsTotalCol}>
                    <span className={styles.courseStatsDash}>—</span>
                  </td>
                </tr>
                <tr className={styles.courseStatsHcpRow}>
                  <td className={styles.courseStatsScoreLabel}>18 Hole Handicap (League)</td>
                  {holes.map((h) => {
                    const rank = fullCourseRank.get(h)
                    return (
                      <td key={h} className={`${styles.courseStatsHoleCol} ${rank != null ? styles.courseStatsHcpRank : ''}`}>
                        {rank ?? <span className={styles.courseStatsDash}>—</span>}
                      </td>
                    )
                  })}
                  <td className={styles.courseStatsTotalCol}>
                    <span className={styles.courseStatsDash}>—</span>
                  </td>
                </tr>
                <tr className={styles.courseStatsHcpRow}>
                  <td className={styles.courseStatsScoreLabel}>18 Hole Handicap (Course)</td>
                  {holes.map((h) => {
                    const official = courseHcp.get(h)
                    return (
                      <td key={h} className={`${styles.courseStatsHoleCol} ${official != null ? styles.courseStatsHcpCourse : ''}`}>
                        {official ?? <span className={styles.courseStatsDash}>—</span>}
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

export default function CourseStatsTab({ data }: { data: LeagueData }) {
  const [filterWeek, setFilterWeek] = useState<number | null>(null)
  const weeks = weekNumbersInOrder(data)
  const { front, back } = useMemo(() => computeStats(data, filterWeek), [data, filterWeek])

  // Combined 18-hole rank map built from both nines
  const fullCourseRank = useMemo(() => {
    const allHoles = new Map<number, HoleBuckets>([...front, ...back])
    return buildRankMap(allHoles, Array.from({ length: 18 }, (_, i) => i + 1))
  }, [front, back])

  // Official course handicap (stroke index) per hole number from the admin-configured course data
  const courseHcp = useMemo(() => {
    const map = new Map<number, number>()
    const c = data.course.nonSenior
    for (const hole of c.front.holes) map.set(hole.holeNumber, hole.strokeIndex)
    for (const hole of c.back.holes) map.set(hole.holeNumber, hole.strokeIndex)
    return map
  }, [data.course])

  return (
    <div className={styles.courseStatsRoot}>
      <div className={styles.courseStatsToolbar}>
        <label className={styles.weekLabel}>
          View
          <select
            className={styles.weekSelect}
            value={filterWeek ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value)
              setFilterWeek(v === 0 ? null : v)
            }}
          >
            <option value={0}>Season</option>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekSelectLabel(data, w)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <NineTable statsMap={front} holeStart={1} title="Front Nine" fullCourseRank={fullCourseRank} courseHcp={courseHcp} />
      <NineTable statsMap={back} holeStart={10} title="Back Nine" fullCourseRank={fullCourseRank} courseHcp={courseHcp} />
    </div>
  )
}
