import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FourManConfig, FourManHalf, HoleDef, LeagueData, Player } from './data/leagueTypes'
import {
  formatHandicapIndex,
  getNineForWeek,
  playerHandicapIndexAtWeek,
} from './lib/handicap'
import { handicapTotalsBeforeWeek } from './lib/leagueScoring'
import { displayHoleNumberOnNine, weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

/** Name + Fl + HCP + 9 holes + This Week + Overall */
const TOTAL_COLS = 14

const FLIGHT_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

type SortKey = 'thisWeek' | 'overall'

type HoleResult = { winnerPid: string; score: number; holePar: number }
type TeamResult = {
  holeResults: Array<HoleResult | null>
  total: number | null
  relToPar: number | null
}

function resolveActiveHalf(
  config: FourManConfig,
  week: number,
): { half: FourManHalf; halfLabel: string } {
  const { firstHalf, secondHalf } = config
  if (week >= firstHalf.startWeek && week <= firstHalf.endWeek) {
    return { half: firstHalf, halfLabel: 'First Half' }
  }
  if (week >= secondHalf.startWeek && week <= secondHalf.endWeek) {
    return { half: secondHalf, halfLabel: 'Second Half' }
  }
  return week <= firstHalf.endWeek
    ? { half: firstHalf, halfLabel: 'First Half' }
    : { half: secondHalf, halfLabel: 'Second Half' }
}

function isStrokeHole(hole: HoleDef, strokes: number): boolean {
  const hcp = hole.leagueHandicap ?? hole.strokeIndex
  return strokes > 0 && hcp <= strokes
}

function formatRelToPar(rel: number): string {
  if (rel === 0) return '(E)'
  if (rel > 0) return `(+${rel})`
  return `(${rel})`
}

function formatOverall(rel: number): string {
  if (rel === 0) return 'E'
  if (rel > 0) return `+${rel}`
  return `${rel}`
}

/**
 * Computes { hcp, strokes } for every league player for a given week.
 * strokes = max(0, playerHcp − leagueMinHcp).
 */
function computePlayerStatsForWeek(
  data: LeagueData,
  week: number,
): Map<string, { hcp: number | null; strokes: number }> {
  const hcpByPlayer = new Map<string, number | null>()
  for (const p of data.players) {
    const totals = handicapTotalsBeforeWeek(data, p, week)
    hcpByPlayer.set(p.id, playerHandicapIndexAtWeek(p, totals, week))
  }
  let minHcp: number | null = null
  for (const hcp of hcpByPlayer.values()) {
    if (hcp != null && (minHcp === null || hcp < minHcp)) minHcp = hcp
  }
  const statsMap = new Map<string, { hcp: number | null; strokes: number }>()
  for (const p of data.players) {
    const hcp = hcpByPlayer.get(p.id) ?? null
    const strokes = hcp != null && minHcp != null ? Math.max(0, hcp - minHcp) : 0
    statsMap.set(p.id, { hcp, strokes })
  }
  return statsMap
}

/**
 * For a set of players with known stats, compute the best-score result for one week.
 * Returns { relToPar } or null if no scores found.
 */
function computeTeamWeekRelToPar(
  data: LeagueData,
  players: Player[],
  schedDate: string,
  scheduledNine: 'front' | 'back',
  statsForWeek: Map<string, { hcp: number | null; strokes: number }>,
): number | null {
  const whiteHoles = data.course.nonSenior[scheduledNine].holes
  let weekTotal = 0
  let weekPar = 0
  let weekHasScore = false

  for (let i = 0; i < whiteHoles.length; i++) {
    const whitePar = whiteHoles[i]?.par ?? 0
    const candidates: Array<{ pid: string; flight: string; score: number }> = []

    for (const p of players) {
      const stroke = data.weeklyScores[p.id]?.[schedDate]?.holes[i] ?? null
      if (stroke == null) continue
      const stats = statsForWeek.get(p.id) ?? { hcp: null, strokes: 0 }
      const nine = getNineForWeek(data.course, scheduledNine, p)
      const h = nine.holes[i]
      if (!h) continue
      const adjusted = isStrokeHole(h, stats.strokes) ? stroke - 1 : stroke
      candidates.push({ pid: p.id, flight: p.flight, score: adjusted })
    }

    if (candidates.length === 0) continue
    candidates.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return (FLIGHT_ORDER[a.flight] ?? 9) - (FLIGHT_ORDER[b.flight] ?? 9)
    })
    weekTotal += candidates[0]!.score
    weekPar += whitePar
    weekHasScore = true
  }

  return weekHasScore ? weekTotal - weekPar : null
}

export default function FourManTab({
  data,
  selectedWeek,
  onSelectWeek,
}: {
  data: LeagueData
  selectedWeek: number
  onSelectWeek: (week: number) => void
}) {
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])
  const config = data.fourMan

  const sched = data.schedule.find((s) => s.leagueWeekNumber === selectedWeek && !s.rainOut)
  const scheduledNine = sched?.nine

  const { half, halfLabel } = useMemo(() => {
    if (!config) return { half: null, halfLabel: '' }
    return resolveActiveHalf(config, selectedWeek)
  }, [config, selectedWeek])

  const byId = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])

  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Reset sort when the active half changes
  useEffect(() => {
    setSortKey(null)
  }, [halfLabel])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 'desc') {
        setSortKey(null) // third click: remove sort, restore default team order
      } else {
        setSortDir('desc') // second click: flip to descending
      }
    } else {
      setSortKey(key) // first click on a new column: ascending
      setSortDir('asc')
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  /** Per-player handicap and stroke-allocation for the currently displayed week. */
  const playerStatsMap = useMemo(
    () => computePlayerStatsForWeek(data, selectedWeek),
    [data, selectedWeek],
  )

  /** Lowest handicap index among all league players this week (the baseline for stroke allocation). */
  const minHcp = useMemo(() => {
    let min: number | null = null
    for (const { hcp } of playerStatsMap.values()) {
      if (hcp != null && (min === null || hcp < min)) min = hcp
    }
    return min
  }, [playerStatsMap])

  /**
   * For each team: per-hole winner + this-week team total and relative-to-par.
   */
  const teamResultsMap = useMemo(() => {
    if (!half || !sched || !scheduledNine) return new Map<string, TeamResult>()

    const whiteHoles = data.course.nonSenior[scheduledNine].holes
    const map = new Map<string, TeamResult>()

    for (const team of half.teams) {
      const validPlayers = team.playerIds
        .filter((pid) => pid && byId.has(pid))
        .map((pid) => byId.get(pid)!)

      const holeResults: Array<HoleResult | null> = []
      let teamTotal = 0
      let teamParTotal = 0
      let hasAnyScore = false

      for (let i = 0; i < whiteHoles.length; i++) {
        const whitePar = whiteHoles[i]?.par ?? 0
        const candidates: Array<{ pid: string; flight: string; score: number }> = []

        for (const p of validPlayers) {
          const stroke = data.weeklyScores[p.id]?.[sched.date]?.holes[i] ?? null
          if (stroke == null) continue
          const stats = playerStatsMap.get(p.id) ?? { hcp: null, strokes: 0 }
          const nine = getNineForWeek(data.course, scheduledNine, p)
          const h = nine.holes[i]
          if (!h) continue
          const adjusted = isStrokeHole(h, stats.strokes) ? stroke - 1 : stroke
          candidates.push({ pid: p.id, flight: p.flight, score: adjusted })
        }

        if (candidates.length === 0) {
          holeResults.push(null)
          continue
        }
        candidates.sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score
          return (FLIGHT_ORDER[a.flight] ?? 9) - (FLIGHT_ORDER[b.flight] ?? 9)
        })
        const winner = candidates[0]!
        holeResults.push({ winnerPid: winner.pid, score: winner.score, holePar: whitePar })
        teamTotal += winner.score
        teamParTotal += whitePar
        hasAnyScore = true
      }

      map.set(team.id, {
        holeResults,
        total: hasAnyScore ? teamTotal : null,
        relToPar: hasAnyScore ? teamTotal - teamParTotal : null,
      })
    }
    return map
  }, [half, sched, scheduledNine, data, byId, playerStatsMap])

  /**
   * Cumulative relative-to-par for each team across all completed weeks in the active half.
   * A week counts if at least one team player has a score for it.
   */
  const overallMap = useMemo(() => {
    if (!half) return new Map<string, number | null>()
    const map = new Map<string, number | null>()

    for (const team of half.teams) {
      const validPlayers = team.playerIds
        .filter((pid) => pid && byId.has(pid))
        .map((pid) => byId.get(pid)!)

      let cumRelToPar = 0
      let hasAnyWeek = false

      for (let week = half.startWeek; week <= half.endWeek; week++) {
        const weekSched = data.schedule.find(
          (s) => s.leagueWeekNumber === week && !s.rainOut,
        )
        if (!weekSched) continue

        // Skip weeks where no team player has any score yet
        const hasScores = validPlayers.some(
          (p) => data.weeklyScores[p.id]?.[weekSched.date]?.holes.some((h) => h != null),
        )
        if (!hasScores) continue

        const statsForWeek = computePlayerStatsForWeek(data, week)
        const rel = computeTeamWeekRelToPar(
          data,
          validPlayers,
          weekSched.date,
          weekSched.nine,
          statsForWeek,
        )
        if (rel != null) {
          cumRelToPar += rel
          hasAnyWeek = true
        }
      }

      map.set(team.id, hasAnyWeek ? cumRelToPar : null)
    }
    return map
  }, [half, data, byId])

  /** Teams in render order, optionally sorted by this-week or overall score. */
  const sortedTeams = useMemo(() => {
    if (!half) return []
    const teams = [...half.teams]
    if (!sortKey) return teams
    teams.sort((a, b) => {
      const aVal =
        sortKey === 'thisWeek'
          ? (teamResultsMap.get(a.id)?.relToPar ?? null)
          : (overallMap.get(a.id) ?? null)
      const bVal =
        sortKey === 'thisWeek'
          ? (teamResultsMap.get(b.id)?.relToPar ?? null)
          : (overallMap.get(b.id) ?? null)
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1
      if (bVal === null) return -1
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
    return teams
  }, [half, sortKey, sortDir, teamResultsMap, overallMap])

  const whiteHoles =
    scheduledNine != null ? data.course.nonSenior[scheduledNine].holes : []
  const goldHoles =
    scheduledNine != null ? data.course.senior[scheduledNine].holes : []

  const nineLabel =
    scheduledNine === 'front' ? 'Front nine' : scheduledNine === 'back' ? 'Back nine' : null

  return (
    <div className={styles.weeklyRoot}>
      <div className={styles.weeklyToolbar}>
        <label className={styles.weekLabel}>
          Scores for
          <select
            className={styles.weekSelect}
            value={selectedWeek}
            onChange={(e) => onSelectWeek(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekSelectLabel(data, w)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!config ? (
        <p className={styles.placeholder}>
          Four Man rosters have not been configured yet. Visit the Admin dashboard to set them up.
        </p>
      ) : !sched || !scheduledNine ? (
        <p className={styles.weeklyWarn}>No schedule row matches this week number.</p>
      ) : !half || half.teams.length === 0 ? (
        <p className={styles.placeholder}>No teams configured for this half.</p>
      ) : (
        <>
          <p className={styles.weeklyMeta}>
            {halfLabel}
            <span className={styles.weeklyMetaSep}> · </span>
            {nineLabel}
            {minHcp != null ? (
              <>
                <span className={styles.weeklyMetaSep}> · </span>
                <span>Low HCP: {minHcp}</span>
              </>
            ) : null}
          </p>

          <div className={styles.weeklyTableWrap}>
            <table className={styles.weeklyTable}>
              <thead>
                {/* Row 1 — hole numbers */}
                <tr>
                  <th rowSpan={3} scope="col" className={styles.weeklyStickyCol} />
                  <th rowSpan={3} scope="col" className={styles.weeklyThFlight}>
                    Fl
                  </th>
                  <th scope="col" className={`${styles.weeklyThNum} ${styles.fourManHcpRowLabel}`}>
                    Hole
                  </th>
                  {whiteHoles.map((_, i) => (
                    <th key={i} scope="col" className={styles.weeklyThHole}>
                      {displayHoleNumberOnNine(scheduledNine, i)}
                    </th>
                  ))}
                  <th
                    rowSpan={3}
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.weeklyThSep}`}
                  >
                    <button
                      type="button"
                      className={`${styles.weeklySortBtn} ${sortKey === 'thisWeek' ? styles.weeklySortBtnActive : ''}`}
                      onClick={() => handleSort('thisWeek')}
                    >
                      This Week{sortMark('thisWeek')}
                    </button>
                  </th>
                  <th
                    rowSpan={3}
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.weeklyThSepLeft}`}
                  >
                    <button
                      type="button"
                      className={`${styles.weeklySortBtn} ${sortKey === 'overall' ? styles.weeklySortBtnActive : ''}`}
                      onClick={() => handleSort('overall')}
                    >
                      Overall{sortMark('overall')}
                    </button>
                  </th>
                </tr>
                {/* Row 2 — white tee league handicap */}
                <tr>
                  <th
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.fourManWhiteHcpHeader} ${styles.fourManHcpRowLabel}`}
                  >
                    HCP-W
                  </th>
                  {whiteHoles.map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className={`${styles.weeklyThPar} ${styles.fourManWhiteHcpHeader}`}
                      title="White tee league handicap"
                    >
                      {h.leagueHandicap ?? '—'}
                    </th>
                  ))}
                </tr>
                {/* Row 3 — gold tee league handicap */}
                <tr>
                  <th
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.fourManGoldHcpHeader} ${styles.fourManHcpRowLabel}`}
                  >
                    HCP-G
                  </th>
                  {goldHoles.map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className={`${styles.weeklyThPar} ${styles.fourManGoldHcpHeader}`}
                      title="Gold tee league handicap"
                    >
                      {h.leagueHandicap ?? '—'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team) => {
                  const validPlayers = team.playerIds
                    .filter((pid) => pid && byId.has(pid))
                    .map((pid) => byId.get(pid)!)
                  const teamResult = teamResultsMap.get(team.id)
                  const overallRel = overallMap.get(team.id) ?? null

                  return (
                    <Fragment key={team.id}>
                      <tr className={styles.handicapsTeamGroupRow}>
                        <td className={styles.handicapsTeamGroupCell} colSpan={TOTAL_COLS}>
                          <span className={styles.handicapsTeamGroupLabel}>{team.name}</span>
                        </td>
                      </tr>
                      {validPlayers.map((p, playerIndex) => {
                        const scoreRow = data.weeklyScores[p.id]?.[sched.date]
                        const stats = playerStatsMap.get(p.id) ?? { hcp: null, strokes: 0 }
                        const nine = getNineForWeek(data.course, scheduledNine, p)

                        return (
                          <tr key={p.id}>
                            <td className={styles.weeklyStickyCol}>
                              <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                            </td>
                            <td className={styles.weeklyTdFlight}>{p.flight}</td>
                            <td className={styles.fourManHcpCell}>
                              {formatHandicapIndex(stats.hcp)}
                            </td>
                            {nine.holes.map((h, i) => {
                              const stroke = scoreRow?.holes[i] ?? null
                              const isStroke = isStrokeHole(h, stats.strokes)
                              const adjustedScore =
                                stroke == null ? null : isStroke ? stroke - 1 : stroke
                              const isWinner =
                                adjustedScore != null &&
                                teamResult?.holeResults[i]?.winnerPid === p.id
                              return (
                                <td key={h.holeNumber} className={styles.weeklyTdHole}>
                                  <div className={styles.fourManHoleCell}>
                                    {adjustedScore == null ? (
                                      <span>—</span>
                                    ) : isWinner ? (
                                      <span className={styles.fourManBestScore}>
                                        {adjustedScore}
                                      </span>
                                    ) : (
                                      <span>{adjustedScore}</span>
                                    )}
                                    <span
                                      className={styles.fourManStrokeDot}
                                      style={isStroke ? undefined : { visibility: 'hidden' }}
                                      aria-hidden
                                    />
                                  </div>
                                </td>
                              )
                            })}
                            {playerIndex === 0 ? (
                              <>
                                {/* This Week */}
                                <td
                                  rowSpan={validPlayers.length}
                                  className={styles.fourManTotalCell}
                                >
                                  {teamResult?.total != null ? (
                                    <>
                                      <span className={styles.fourManTotalScore}>
                                        {teamResult.total}
                                      </span>
                                      {teamResult.relToPar != null ? (
                                        <span className={styles.fourManTotalPar}>
                                          {formatRelToPar(teamResult.relToPar)}
                                        </span>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span className={styles.fourManTotalScore}>—</span>
                                  )}
                                </td>
                                {/* Overall */}
                                <td
                                  rowSpan={validPlayers.length}
                                  className={`${styles.fourManTotalCell} ${styles.fourManOverallCell}`}
                                >
                                  {overallRel != null ? (
                                    <span className={styles.fourManTotalScore}>
                                      {formatOverall(overallRel)}
                                    </span>
                                  ) : (
                                    <span className={styles.fourManTotalScore}>—</span>
                                  )}
                                </td>
                              </>
                            ) : null}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
