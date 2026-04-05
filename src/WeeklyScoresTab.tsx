import { useEffect, useMemo, useState } from 'react'
import type { CourseNine, FlightId, LeagueData, Player, WeeklyScoreRow } from './data/leagueTypes'
import { computeHandicapIndex, formatHandicapIndex, getNineForWeek, grossTotalFromHoles, netNineFromGrossAndIndex } from './lib/handicap'
import { holeScoreBadgeClassName } from './lib/holeScoreDisplay'
import {
  flightPointsForWeek,
  formatStandingPoints,
  handicapTotalsBeforeWeek,
} from './lib/leagueScoring'
import { formatIsoDateForDisplay } from './lib/formatIsoDateDisplay'
import { displayHoleNumberOnNine, weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import PlayerSeasonHistoryModal from './PlayerSeasonHistoryModal.tsx'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

const FLIGHTS: FlightId[] = ['A', 'B', 'C', 'D']

type WeeklySortKey =
  | 'player'
  | 'flight'
  | `hole-${number}`
  | 'gross'
  | 'net'
  | 'hcp'
  | 'flpts'

type WeeklyRow = {
  player: Player
  scoreRow: WeeklyScoreRow | undefined
  nine: CourseNine
  gross: number | null
  net: number | null
  hcp: number | null
  flightPts: number | null
  holeScores: (number | null)[]
}

function cmpNullableNum(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const c = a - b
  return dir === 'asc' ? c : -c
}

function sortWeeklyRows(rows: WeeklyRow[], key: WeeklySortKey, dir: 'asc' | 'desc'): WeeklyRow[] {
  const out = [...rows]
  out.sort((A, B) => {
    let c = 0
    switch (key) {
      case 'player': {
        const cmp = A.player.name.localeCompare(B.player.name)
        c = dir === 'asc' ? cmp : -cmp
        break
      }
      case 'flight': {
        const pf = A.player.flight.localeCompare(B.player.flight)
        if (pf !== 0) {
          c = dir === 'asc' ? pf : -pf
        } else {
          c = A.player.name.localeCompare(B.player.name)
        }
        break
      }
      case 'gross':
        c = cmpNullableNum(A.gross, B.gross, dir)
        break
      case 'net':
        c = cmpNullableNum(A.net, B.net, dir)
        break
      case 'hcp':
        c = cmpNullableNum(A.hcp, B.hcp, dir)
        break
      case 'flpts':
        c = cmpNullableNum(A.flightPts, B.flightPts, dir)
        break
      default:
        if (key.startsWith('hole-')) {
          const i = Number(key.slice(5))
          const sa = A.holeScores[i] ?? null
          const sb = B.holeScores[i] ?? null
          c = cmpNullableNum(sa, sb, dir)
        }
        break
    }
    if (c !== 0) return c
    return A.player.name.localeCompare(B.player.name)
  })
  return out
}

export default function WeeklyScoresTab({
  data,
  selectedWeek,
  onSelectWeek,
}: {
  data: LeagueData
  selectedWeek: number
  onSelectWeek: (week: number) => void
}) {
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])
  const sched = data.schedule.find((s) => s.leagueWeekNumber === selectedWeek)
  const [sortKey, setSortKey] = useState<WeeklySortKey>('player')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [flightFilter, setFlightFilter] = useState<FlightId | 'all'>('all')
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null)

  useEffect(() => {
    setSortKey('player')
    setSortDir('asc')
  }, [selectedWeek])

  function onHeaderSort(column: WeeklySortKey) {
    if (sortKey === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column)
      setSortDir('asc')
    }
  }

  const scheduledNine = sched?.nine
  const whiteHoles =
    scheduledNine != null ? data.course.nonSenior[scheduledNine].holes : []
  const goldHoles = scheduledNine != null ? data.course.senior[scheduledNine].holes : []

  const nineLabel = scheduledNine === 'front' ? 'Front nine' : scheduledNine === 'back' ? 'Back nine' : null

  const tableRows = useMemo(() => {
    if (!sched || !scheduledNine) return []
    const ptsByFlight = {
      A: flightPointsForWeek(data, 'A', selectedWeek),
      B: flightPointsForWeek(data, 'B', selectedWeek),
      C: flightPointsForWeek(data, 'C', selectedWeek),
      D: flightPointsForWeek(data, 'D', selectedWeek),
    } as const
    return data.players.map((p): WeeklyRow => {
      const scoreRow = data.weeklyScores[p.id]?.[String(selectedWeek)]
      const nine = getNineForWeek(data.course, scheduledNine, p)
      const gross = grossTotalFromHoles(scoreRow)
      const handicapHistory = handicapTotalsBeforeWeek(data, p, selectedWeek)
      const hcp =
        gross != null
          ? computeHandicapIndex({
              priorSeasonScores: p.priorSeasonScores,
              currentSeasonTotals: handicapHistory,
              asOfLeagueWeek: selectedWeek,
            })
          : null
      const net = netNineFromGrossAndIndex(gross, hcp)
      const holeScores = nine.holes.map((_, i) => scoreRow?.holes[i] ?? null)
      const flightPts =
        gross != null && !scoreRow?.pulledGross ? (ptsByFlight[p.flight].get(p.id) ?? 0) : null
      return { player: p, scoreRow, nine, gross, net, hcp, flightPts, holeScores }
    })
  }, [data, selectedWeek, sched, scheduledNine])

  const sortedRows = useMemo(
    () => sortWeeklyRows(tableRows, sortKey, sortDir),
    [tableRows, sortKey, sortDir],
  )

  const displayRows = useMemo(() => {
    if (flightFilter === 'all') return sortedRows
    return sortedRows.filter((r) => r.player.flight === flightFilter)
  }, [sortedRows, flightFilter])

  function sortBtnClass(column: WeeklySortKey) {
    return `${styles.weeklySortBtn} ${sortKey === column ? styles.weeklySortBtnActive : ''}`
  }

  function sortMark(column: WeeklySortKey) {
    if (sortKey !== column) return null
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

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
        <label className={styles.weekLabel}>
          Flight
          <select
            className={styles.weekSelect}
            value={flightFilter}
            onChange={(e) => setFlightFilter(e.target.value as FlightId | 'all')}
          >
            <option value="all">All golfers</option>
            {FLIGHTS.map((f) => (
              <option key={f} value={f}>
                Flight {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!sched || !scheduledNine ? (
        <p className={styles.weeklyWarn}>No schedule row matches this week number.</p>
      ) : (
        <>
          <p className={styles.weeklyMeta}>
            {nineLabel}
            <span className={styles.weeklyMetaSep}> · </span>
            Par by tee: white <span className={styles.weeklyMetaGold}>/</span> gold
          </p>
          <div className={styles.weeklyTableWrap}>
            <table className={styles.weeklyTable}>
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    scope="col"
                    className={styles.weeklyStickyCol}
                    aria-sort={
                      sortKey === 'player' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className={sortBtnClass('player')}
                      onClick={() => onHeaderSort('player')}
                    >
                      Player{sortMark('player')}
                    </button>
                  </th>
                  <th
                    rowSpan={2}
                    scope="col"
                    className={styles.weeklyThFlight}
                    aria-sort={
                      sortKey === 'flight' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className={sortBtnClass('flight')}
                      onClick={() => onHeaderSort('flight')}
                    >
                      Fl{sortMark('flight')}
                    </button>
                  </th>
                  {whiteHoles.map((_, i) => {
                    const col: WeeklySortKey = `hole-${i}`
                    return (
                      <th
                        key={i}
                        scope="col"
                        className={styles.weeklyThHole}
                        aria-sort={
                          sortKey === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        <button
                          type="button"
                          className={sortBtnClass(col)}
                          onClick={() => onHeaderSort(col)}
                        >
                          {displayHoleNumberOnNine(scheduledNine, i)}
                          {sortMark(col)}
                        </button>
                      </th>
                    )
                  })}
                  <th
                    rowSpan={2}
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.weeklyThSep}`}
                    aria-sort={
                      sortKey === 'gross' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" className={sortBtnClass('gross')} onClick={() => onHeaderSort('gross')}>
                      Gross{sortMark('gross')}
                    </button>
                  </th>
                  <th
                    rowSpan={2}
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.weeklyThSepLeft}`}
                    aria-sort={
                      sortKey === 'net' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" className={sortBtnClass('net')} onClick={() => onHeaderSort('net')}>
                      Net{sortMark('net')}
                    </button>
                  </th>
                  <th
                    rowSpan={2}
                    scope="col"
                    className={styles.weeklyThNum}
                    aria-sort={
                      sortKey === 'hcp' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" className={sortBtnClass('hcp')} onClick={() => onHeaderSort('hcp')}>
                      HCP{sortMark('hcp')}
                    </button>
                  </th>
                  <th
                    rowSpan={2}
                    scope="col"
                    className={`${styles.weeklyThNum} ${styles.weeklyThSepLeft}`}
                    aria-sort={
                      sortKey === 'flpts' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" className={sortBtnClass('flpts')} onClick={() => onHeaderSort('flpts')}>
                      FLPTS{sortMark('flpts')}
                    </button>
                  </th>
                </tr>
                <tr>
                  {whiteHoles.map((_, i) => {
                    const wp = whiteHoles[i]?.par
                    const gp = goldHoles[i]?.par
                    return (
                      <th key={i} scope="col" className={styles.weeklyThPar}>
                        {wp}
                        <span className={styles.weeklyParGold}>/{gp}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {displayRows.map(({ player: p, scoreRow: row, nine, gross, net, hcp: idx, flightPts }) => (
                  <tr key={p.id}>
                    <td className={styles.weeklyStickyCol}>
                      <div className={styles.weeklyPlayerCell}>
                        <button
                          type="button"
                          className={styles.weeklyPlayerNameBtn}
                          aria-label={`${p.name} season history`}
                          onClick={() => setHistoryPlayer(p)}
                        >
                          <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                        </button>
                        {row?.golfOffPlayedDate ? (
                          <span className={styles.weeklyGolfOffNote} title="Golf-off round">
                            Golf-off {formatIsoDateForDisplay(row.golfOffPlayedDate)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={styles.weeklyTdFlight}>{p.flight}</td>
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
                      {gross == null ? '—' : gross}
                    </td>
                    <td className={`${styles.weeklyTdNum} ${styles.weeklyThSepLeft}`}>
                      {net == null ? '—' : net}
                    </td>
                    <td className={styles.weeklyTdNum}>{formatHandicapIndex(idx)}</td>
                    <td className={`${styles.weeklyTdNum} ${styles.weeklyThSepLeft}`}>
                      {flightPts == null ? '—' : formatStandingPoints(flightPts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {historyPlayer ? (
        <PlayerSeasonHistoryModal
          key={historyPlayer.id}
          data={data}
          player={historyPlayer}
          onClose={() => setHistoryPlayer(null)}
        />
      ) : null}
    </div>
  )
}
