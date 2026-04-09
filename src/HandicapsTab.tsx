import { Fragment, useMemo } from 'react'
import type { LeagueData, Team } from './data/leagueTypes'
import type { HandicapCellRole } from './lib/handicapReport'
import {
  HANDICAPS_LEAGUE_WEEK_COLUMNS,
  HANDICAPS_PRIOR_WEEK_LABELS,
  handicapBreakdownForPlayer,
  priorSeasonHeaderInRollingBand,
} from './lib/handicapReport'
import { weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

const PRIOR_COL_COUNT = HANDICAPS_PRIOR_WEEK_LABELS.length
const DATA_COL_COUNT = 3 + PRIOR_COL_COUNT + HANDICAPS_LEAGUE_WEEK_COLUMNS

function compareTeamsByLeagueNumber(a: Team, b: Team): number {
  const ma = /^team-(\d+)$/i.exec(a.id)
  const mb = /^team-(\d+)$/i.exec(b.id)
  if (ma && mb) return Number(ma[1]) - Number(mb[1])
  if (ma) return -1
  if (mb) return 1
  return a.name.localeCompare(b.name)
}

function formatHandicapOneDecimal(n: number | null): string {
  if (n == null) return '—'
  return n.toFixed(1)
}

function roleClass(role: HandicapCellRole): string {
  switch (role) {
    case 'inPool':
      return styles.handicapsCellPool
    case 'droppedLow':
    case 'droppedHigh':
      return `${styles.handicapsCellPool} ${styles.handicapsCellDropped}`
    case 'countsForIndex':
      return `${styles.handicapsCellPool} ${styles.handicapsCellCounts}`
    default:
      return ''
  }
}

export default function HandicapsTab({
  data,
  asOfWeek,
  onAsOfWeekChange,
}: {
  data: LeagueData
  asOfWeek: number
  onAsOfWeekChange: (week: number) => void
}) {
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])
  const weekCols = useMemo(
    () => Array.from({ length: HANDICAPS_LEAGUE_WEEK_COLUMNS }, (_, i) => i + 1),
    [],
  )

  const priorYear = data.meta.seasonYear - 1
  const seasonYear = data.meta.seasonYear

  const leagueBandStart = Math.max(1, asOfWeek - 7)
  const leagueBandEnd = Math.max(0, asOfWeek - 1)

  const teamsSorted = useMemo(
    () => [...data.teams].sort(compareTeamsByLeagueNumber),
    [data.teams],
  )

  const byId = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])

  return (
    <div className={styles.handicapsRoot}>
      <div className={styles.handicapsToolbar}>
        <label className={styles.handicapsAsOfLabel}>
          Handicap index as of
          <select
            className={styles.weekSelect}
            value={asOfWeek}
            onChange={(e) => onAsOfWeekChange(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekSelectLabel(data, w)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.handicapsTableScroll}>
        <table className={styles.handicapsTable}>
          <thead>
            <tr>
              <th colSpan={3} className={styles.handicapsCornerTh} />
              <th colSpan={PRIOR_COL_COUNT} className={`${styles.handicapsGroupTh} ${styles.handicapsGroupThYearFirst}`}>
                {priorYear}
              </th>
              <th colSpan={HANDICAPS_LEAGUE_WEEK_COLUMNS} className={styles.handicapsGroupTh}>
                {seasonYear}
              </th>
            </tr>
            <tr>
              <th className={styles.handicapsPlayerCol}>Player</th>
              <th className={styles.handicapsFlightCol}>Fl</th>
              <th
                className={styles.handicapsHcpCol}
                title="Shown: (avg − 36) × 0.8 using the middle five of your last seven qualifying totals, one decimal (not pre-rounded). Net scoring uses the same formula rounded to a whole number."
              >
                HCP
              </th>
              {HANDICAPS_PRIOR_WEEK_LABELS.map((wk) => {
                const priorInBand = priorSeasonHeaderInRollingBand(asOfWeek, wk)
                return (
                  <th
                    key={`prior-${wk}`}
                    className={`${styles.handicapsNumTh} ${wk === 12 ? styles.handicapsNumThPriorStart : ''} ${
                      wk === 18 ? styles.handicapsNumThPriorEnd : ''
                    } ${priorInBand ? styles.handicapsHdrRollingBand : ''}`}
                  >
                    {wk}
                  </th>
                )
              })}
              {weekCols.map((w) => {
                const inBand = leagueBandEnd >= leagueBandStart && w >= leagueBandStart && w <= leagueBandEnd
                return (
                  <th
                    key={w}
                    className={`${styles.handicapsNumTh} ${inBand ? styles.handicapsHdrRollingBand : ''}`}
                  >
                    {w}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {teamsSorted.map((team) => (
              <Fragment key={team.id}>
                <tr className={styles.handicapsTeamGroupRow}>
                  <td className={styles.handicapsTeamGroupCell} colSpan={DATA_COL_COUNT}>
                    <span className={styles.handicapsTeamGroupLabel}>{team.name}</span>
                  </td>
                </tr>
                {team.playerIds.map((pid) => {
                  const p = byId.get(pid)
                  if (!p) return null
                  const b = handicapBreakdownForPlayer(data, p, asOfWeek)
                  return (
                    <tr key={p.id}>
                      <td className={styles.handicapsPlayerCol}>
                        <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                      </td>
                      <td className={`${styles.handicapsFlightCol} ${styles.handicapsTdFlight}`}>{p.flight}</td>
                      <td className={`${styles.handicapsHcpCol} ${styles.handicapsTdHcp}`}>
                        {formatHandicapOneDecimal(b.handicapIndexUnrounded)}
                      </td>
                      {b.priorColumns.map((val, i) => (
                        <td
                          key={`p-${i}`}
                          className={`${styles.handicapsTdNum} ${roleClass(b.priorRoles[i] ?? 'none')} ${
                            i === 0 ? styles.handicapsPriorDataEdgeLeft : ''
                          } ${i === 6 ? styles.handicapsPriorDataEdgeRight : ''}`}
                        >
                          {val == null ? '—' : val}
                        </td>
                      ))}
                      {weekCols.map((w) => {
                        const val = b.weekValues.get(w) ?? null
                        const role = b.weekRoles.get(w) ?? 'none'
                        return (
                          <td key={w} className={`${styles.handicapsTdNum} ${roleClass(role)}`}>
                            {val == null ? '—' : val}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
