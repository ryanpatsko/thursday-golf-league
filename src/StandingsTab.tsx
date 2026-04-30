import { useMemo, useState } from 'react'
import type { FlightId, LeagueData, Player, Team } from './data/leagueTypes'
import {
  formatGrossRecordedVsHandicap,
  formatHandicapIndex,
  getNineForWeek,
  grossTotalFromHoles,
  handicapTotalFromHoles,
  isPullRow,
  playerHandicapIndexAtWeek,
} from './lib/handicap'
import {
  flightPointsForWeek,
  flightPointsHalfTotalsThroughWeek,
  formatStandingPoints,
  handicapTotalsBeforeWeek,
  playerNetForWeek,
  teamMatchNetDroppedPlayerId,
  teamMatchNetTotal,
  teamPointsForWeek,
  teamPointsHalfTotalsThroughWeek,
  teamWeekNetsPostedCount,
} from './lib/leagueScoring'
import { formatIsoDateForDisplay } from './lib/formatIsoDateDisplay'
import { weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import PlayerSeasonHistoryModal from './PlayerSeasonHistoryModal.tsx'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

const FLIGHTS: FlightId[] = ['A', 'B', 'C', 'D']

/** Team 1–8 order from ids `team-1` … `team-8` (not standings / points order). */
function compareTeamsByLeagueNumber(a: Team, b: Team): number {
  const ma = /^team-(\d+)$/i.exec(a.id)
  const mb = /^team-(\d+)$/i.exec(b.id)
  if (ma && mb) return Number(ma[1]) - Number(mb[1])
  if (ma) return -1
  if (mb) return 1
  return a.name.localeCompare(b.name)
}

function formatStandingScore(n: number | null): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1)
}

function TeamRosterSubtitle({
  data,
  team,
  week,
}: {
  data: LeagueData
  team: Team
  week: number
}) {
  const byId = new Map(data.players.map((p) => [p.id, p]))
  const wkDate = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)?.date ?? ''
  return (
    <span className={styles.standingsTeamRoster}>
      {team.playerIds.map((id, i) => {
        const p = byId.get(id)
        const isLast = i === team.playerIds.length - 1
        const isPull = p != null && isPullRow(data.weeklyScores[p.id]?.[wkDate])
        return (
          <span key={id}>
            {p ? (
              <span className={styles.standingsRosterNameInline}>
                <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                {isPull ? (
                  <span
                    className={styles.standingsPullBadge}
                    title="Absent — pulled gross from flight"
                  >
                    Pull
                  </span>
                ) : null}
              </span>
            ) : (
              id
            )}
            {!isLast ? '\u00A0\u00A0' : null}
          </span>
        )
      })}
    </span>
  )
}

function TeamWeekCard({
  data,
  team,
  week,
  onPlayerClick,
}: {
  data: LeagueData
  team: Team
  week: number
  onPlayerClick: (p: Player) => void
}) {
  const byId = new Map(data.players.map((p) => [p.id, p]))
  const officialNet = teamMatchNetTotal(data, team, week)
  const netsPosted = teamWeekNetsPostedCount(data, team, week)
  const showTeamNetTotal = netsPosted >= 3
  const displayedTeamNet = showTeamNetTotal ? officialNet : null
  const droppedNetPlayerId = showTeamNetTotal ? teamMatchNetDroppedPlayerId(data, team, week) : null

  return (
    <section className={styles.standingsTeamCard} aria-label={`${team.name} week ${week}`}>
      <h3 className={styles.standingsTeamCardTitle}>{team.name}</h3>
      <div className={styles.standingsTableWrap}>
        <table className={`${styles.standingsTable} ${styles.teamCardTable}`}>
          <thead>
            <tr>
              <th>Player</th>
              <th className={styles.standingsNum}>HCP</th>
              <th
                className={styles.standingsScore}
                title="Recorded 9-hole total; when shown as two numbers, second is handicap gross (each hole capped at double bogey)."
              >
                Grs
              </th>
              <th className={styles.standingsScore}>Net</th>
            </tr>
          </thead>
          <tbody>
            {team.playerIds.map((pid) => {
              const p = byId.get(pid)
              const label = p?.name ?? pid
              const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
              const weekRow = sched ? data.weeklyScores[pid]?.[sched.date] : undefined
              const isPulled = isPullRow(weekRow)
              const isGolfOff = Boolean(weekRow?.golfOffPlayedDate)
              const nine =
                p && sched ? getNineForWeek(data.course, sched.nine, p) : null
              const recordedGross = grossTotalFromHoles(weekRow)
              const handicapGross =
                weekRow && nine ? handicapTotalFromHoles(weekRow, nine.holes) : null
              const grsDisplay = formatGrossRecordedVsHandicap(recordedGross, handicapGross)
              const grsTitle =
                recordedGross != null && handicapGross != null && recordedGross !== handicapGross
                  ? `${recordedGross} recorded / ${handicapGross} handicap gross (max +2 strokes vs par per hole)`
                  : undefined
              const net = p ? playerNetForWeek(data, p, week) : null
              const hcpIdx =
                p != null
                  ? playerHandicapIndexAtWeek(
                      p,
                      handicapTotalsBeforeWeek(data, p, week),
                      week,
                    )
                  : null
              const dropped = droppedNetPlayerId != null && pid === droppedNetPlayerId
              const netCell =
                isGolfOff && net != null && weekRow?.golfOffPlayedDate ? (
                  <span
                    className={styles.teamCardScoreGolfOff}
                    title={`Golf-off — played ${formatIsoDateForDisplay(weekRow.golfOffPlayedDate)}`}
                  >
                    {formatStandingScore(net)}
                  </span>
                ) : (
                  formatStandingScore(net)
                )
              return (
                <tr
                  key={pid}
                  className={dropped ? styles.teamCardRowDropped : undefined}
                  title={
                    dropped
                      ? 'This net is not included in the team total (best three of four nets).'
                      : undefined
                  }
                >
                  <td>
                    <div className={styles.teamCardPlayerCell}>
                      {p ? (
                        <button
                          type="button"
                          className={styles.standingsPlayerNameBtn}
                          aria-label={`${p.name} season history`}
                          onClick={() => onPlayerClick(p)}
                        >
                          <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                        </button>
                      ) : (
                        <PlayerNameWithSenior name={label} isSenior={false} />
                      )}
                      {isPulled && weekRow ? (
                        <span
                          className={styles.teamCardPulledTag}
                          title={
                            weekRow.pulledNet != null
                              ? `Net ${weekRow.pulledNet} — absent, scored from flight peer`
                              : `Gross ${weekRow.pulledGross ?? ''} — absent, scored from flight draw`
                          }
                        >
                          {weekRow.pulledFromPlayerName
                            ? `Pull - ${weekRow.pulledFromPlayerName}`
                            : 'Pull'}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={styles.standingsNum}>{formatHandicapIndex(hcpIdx)}</td>
                  <td className={`${styles.standingsScore} ${styles.teamCardGrsCell}`} title={grsTitle}>
                    {grsDisplay}
                  </td>
                  <td className={styles.standingsScore}>{netCell}</td>
                </tr>
              )
            })}
            <tr
              className={styles.teamCardTotalRow}
              aria-label={showTeamNetTotal ? 'Team net total' : 'Team net total (shown when 3+ scores entered)'}
            >
              <td />
              <td />
              <td />
              <td className={styles.standingsScore}>{formatStandingScore(displayedTeamNet)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function StandingsTab({
  data,
  selectedWeek,
  onSelectWeek,
}: {
  data: LeagueData
  selectedWeek: number
  onSelectWeek: (week: number) => void
}) {
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null)
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])

  const [teamSortKey, setTeamSortKey] = useState<'week' | 'total' | null>(null)
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('asc')
  const [flightSortKey, setFlightSortKey] = useState<'week' | 'total' | null>(null)
  const [flightSortDir, setFlightSortDir] = useState<'asc' | 'desc'>('asc')

  function handleTeamSort(key: 'week' | 'total') {
    if (teamSortKey === key) {
      if (teamSortDir === 'desc') { setTeamSortKey(null) } else { setTeamSortDir('desc') }
    } else { setTeamSortKey(key); setTeamSortDir('asc') }
  }

  function handleFlightSort(key: 'week' | 'total') {
    if (flightSortKey === key) {
      if (flightSortDir === 'desc') { setFlightSortKey(null) } else { setFlightSortDir('desc') }
    } else { setFlightSortKey(key); setFlightSortDir('asc') }
  }

  function teamSortMark(key: 'week' | 'total') {
    if (teamSortKey !== key) return null
    return teamSortDir === 'asc' ? ' ▲' : ' ▼'
  }

  function flightSortMark(key: 'week' | 'total') {
    if (flightSortKey !== key) return null
    return flightSortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const { teamWeekPts, teamHalfPts } = useMemo(() => {
    const teamWeekPts = teamPointsForWeek(data, selectedWeek)
    const teamHalfPts = teamPointsHalfTotalsThroughWeek(data, selectedWeek)
    return { teamWeekPts, teamHalfPts }
  }, [data, selectedWeek])

  const sortedTeams = useMemo(() => {
    const teams = [...data.teams]
    if (!teamSortKey) {
      teams.sort((a, b) => {
        const ta = teamHalfPts.get(a.id) ?? 0
        const tb = teamHalfPts.get(b.id) ?? 0
        if (tb !== ta) return tb - ta
        return a.name.localeCompare(b.name)
      })
    } else {
      teams.sort((a, b) => {
        const aVal = teamSortKey === 'week' ? (teamWeekPts.get(a.id) ?? 0) : (teamHalfPts.get(a.id) ?? 0)
        const bVal = teamSortKey === 'week' ? (teamWeekPts.get(b.id) ?? 0) : (teamHalfPts.get(b.id) ?? 0)
        if (aVal !== bVal) return teamSortDir === 'asc' ? aVal - bVal : bVal - aVal
        return a.name.localeCompare(b.name)
      })
    }
    return teams
  }, [data.teams, teamHalfPts, teamWeekPts, teamSortKey, teamSortDir])

  const teamsInLeagueOrder = useMemo(
    () => [...data.teams].sort(compareTeamsByLeagueNumber),
    [data],
  )

  const flightPointMaps = useMemo(() => {
    const o = {} as Record<FlightId, Map<string, number>>
    for (const f of FLIGHTS) o[f] = flightPointsForWeek(data, f, selectedWeek)
    return o
  }, [data, selectedWeek])

  const flightHalfPointMaps = useMemo(() => {
    const o = {} as Record<FlightId, Map<string, number>>
    for (const f of FLIGHTS) o[f] = flightPointsHalfTotalsThroughWeek(data, f, selectedWeek)
    return o
  }, [data, selectedWeek])

  const playersByFlight = useMemo(() => {
    const m = { A: [] as typeof data.players, B: [], C: [], D: [] } as Record<
      FlightId,
      (typeof data.players)[number][]
    >
    for (const p of data.players) m[p.flight].push(p)
    for (const f of FLIGHTS) {
      const half = flightHalfPointMaps[f]
      m[f].sort((a, b) => {
        const ha = half.get(a.id) ?? 0
        const hb = half.get(b.id) ?? 0
        if (hb !== ha) return hb - ha
        return a.name.localeCompare(b.name)
      })
    }
    return m
  }, [data.players, flightHalfPointMaps])

  const sortedPlayersByFlight = useMemo(() => {
    if (!flightSortKey) return playersByFlight
    const result = {} as Record<FlightId, (typeof data.players)[number][]>
    for (const f of FLIGHTS) {
      const players = [...playersByFlight[f]]
      players.sort((a, b) => {
        const aVal = flightSortKey === 'week' ? (flightPointMaps[f].get(a.id) ?? 0) : (flightHalfPointMaps[f].get(a.id) ?? 0)
        const bVal = flightSortKey === 'week' ? (flightPointMaps[f].get(b.id) ?? 0) : (flightHalfPointMaps[f].get(b.id) ?? 0)
        if (aVal !== bVal) return flightSortDir === 'asc' ? aVal - bVal : bVal - aVal
        return a.name.localeCompare(b.name)
      })
      result[f] = players
    }
    return result
  }, [playersByFlight, flightPointMaps, flightHalfPointMaps, flightSortKey, flightSortDir])

  return (
    <div className={styles.standingsRoot}>
      <div className={styles.weekRow}>
        <label className={styles.weekLabel}>
          Standings for
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

      <div className={styles.standingsTeamRow}>
        <section
          className={`${styles.standingsSection} ${styles.standingsTeamSection}`}
          aria-label="Team standings"
        >
          <h2 className={styles.standingsHeading}>Team standings</h2>
          <div className={styles.standingsTableWrap}>
            <table className={`${styles.standingsTable} ${styles.standingsTeamTable}`}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th className={styles.standingsNum}>
                    <button
                      type="button"
                      className={`${styles.weeklySortBtn} ${teamSortKey === 'week' ? styles.weeklySortBtnActive : ''}`}
                      onClick={() => handleTeamSort('week')}
                    >
                      Week{teamSortMark('week')}
                    </button>
                  </th>
                  <th className={styles.standingsNum}>
                    <button
                      type="button"
                      className={`${styles.weeklySortBtn} ${teamSortKey === 'total' ? styles.weeklySortBtnActive : ''}`}
                      onClick={() => handleTeamSort('total')}
                    >
                      Total{teamSortMark('total')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((t) => {
                  const teamWeekNet = teamMatchNetTotal(data, t, selectedWeek)
                  return (
                  <tr key={t.id}>
                    <td>
                      <div className={styles.standingsTeamCell}>
                        <span className={styles.standingsTeamLabel}>{t.name}</span>
                        <TeamRosterSubtitle data={data} team={t} week={selectedWeek} />
                      </div>
                    </td>
                    <td className={styles.standingsNum}>
                      {teamWeekNet == null
                        ? '—'
                        : formatStandingPoints(teamWeekPts.get(t.id) ?? 0)}
                      {teamWeekNet != null ? (
                        <span className={styles.standingsWeekNet}>({teamWeekNet})</span>
                      ) : null}
                    </td>
                    <td className={styles.standingsNum}>{formatStandingPoints(teamHalfPts.get(t.id) ?? 0)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className={styles.standingsFlights4Grid} aria-label="Flight standings">
        {FLIGHTS.map((flight) => {
          const weekPts = flightPointMaps[flight]
          const halfPts = flightHalfPointMaps[flight]
          const players = sortedPlayersByFlight[flight]
          return (
            <section
              key={flight}
              className={`${styles.standingsSection} ${styles.standingsFlightSection}`}
              aria-label={`Flight ${flight} standings`}
            >
              <div className={styles.standingsFlightBody}>
                <span className={styles.standingsFlightWatermark} aria-hidden>
                  {flight}
                </span>
                <h2 className={styles.standingsHeading}>Flight {flight} Standings</h2>
                <div className={styles.standingsTableWrap}>
                  <table className={styles.standingsTable}>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th className={styles.standingsNum}>
                          <button
                            type="button"
                            className={`${styles.weeklySortBtn} ${flightSortKey === 'week' ? styles.weeklySortBtnActive : ''}`}
                            onClick={() => handleFlightSort('week')}
                          >
                            Week{flightSortMark('week')}
                          </button>
                        </th>
                        <th className={styles.standingsNum}>
                          <button
                            type="button"
                            className={`${styles.weeklySortBtn} ${flightSortKey === 'total' ? styles.weeklySortBtnActive : ''}`}
                            onClick={() => handleFlightSort('total')}
                          >
                            Total{flightSortMark('total')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p) => {
                        const selectedWkDate = data.schedule.find((s) => s.leagueWeekNumber === selectedWeek && !s.rainOut)?.date ?? ''
                        const isPull = isPullRow(data.weeklyScores[p.id]?.[selectedWkDate])
                        const playerWeekNet = playerNetForWeek(data, p, selectedWeek)
                        return (
                        <tr key={p.id}>
                          <td>
                            <span className={styles.standingsPlayerNameRow}>
                              <button
                                type="button"
                                className={styles.standingsPlayerNameBtn}
                                aria-label={`${p.name} season history`}
                                onClick={() => setHistoryPlayer(p)}
                              >
                                <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                              </button>
                              {isPull ? (
                                <span
                                  className={styles.standingsPullBadge}
                                  title="Absent — pulled gross from flight"
                                >
                                  Pull
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className={styles.standingsNum}>
                            {playerWeekNet == null && !isPull
                              ? '—'
                              : formatStandingPoints(weekPts.get(p.id) ?? 0)}
                            {playerWeekNet != null ? (
                              <span className={styles.standingsWeekNet}>({playerWeekNet})</span>
                            ) : null}
                          </td>
                          <td className={styles.standingsNum}>{formatStandingPoints(halfPts.get(p.id) ?? 0)}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <hr className={styles.standingsMainDivider} />

      <div className={styles.standingsTeamCardsGrid}>
        {teamsInLeagueOrder.map((t) => (
          <TeamWeekCard key={t.id} data={data} team={t} week={selectedWeek} onPlayerClick={setHistoryPlayer} />
        ))}
      </div>
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
