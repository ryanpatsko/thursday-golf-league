import { useMemo, useState } from 'react'
import type { FlightId, LeagueData, Player, Team } from './data/leagueTypes'
import {
  computeHandicapIndex,
  formatHandicapIndex,
  getNineForWeek,
  grossTotalFromHoles,
  handicapTotalFromHoles,
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

/** Recorded 9-hole gross vs handicap gross (triple-bogey cap per hole); single value when equal or no cap diff. */
function formatTeamCardGrs(recorded: number | null, hcpGross: number | null): string {
  if (recorded == null) return '—'
  if (hcpGross == null) return String(recorded)
  if (recorded === hcpGross) return String(recorded)
  return `${recorded}/${hcpGross}`
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
  const wk = String(week)
  return (
    <span className={styles.standingsTeamRoster}>
      {team.playerIds.map((id, i) => {
        const p = byId.get(id)
        const isLast = i === team.playerIds.length - 1
        const isPull = p != null && data.weeklyScores[p.id]?.[wk]?.pulledGross != null
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

function playerGrossForWeek(data: LeagueData, playerId: string, week: number): number | null {
  const row = data.weeklyScores[playerId]?.[String(week)]
  return grossTotalFromHoles(row)
}

function TeamWeekCard({
  data,
  team,
  week,
}: {
  data: LeagueData
  team: Team
  week: number
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
                title="Recorded 9-hole total; when shown as two numbers, second is handicap gross (each hole capped at triple bogey)."
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
              const weekRow = data.weeklyScores[pid]?.[String(week)]
              const isPulled = weekRow?.pulledGross != null
              const isGolfOff = Boolean(weekRow?.golfOffPlayedDate)
              const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
              const nine =
                p && sched ? getNineForWeek(data.course, sched.nine, p) : null
              const recordedGross = grossTotalFromHoles(weekRow)
              const handicapGross =
                weekRow && nine ? handicapTotalFromHoles(weekRow, nine.holes) : null
              const grsDisplay = formatTeamCardGrs(recordedGross, handicapGross)
              const grsTitle =
                recordedGross != null && handicapGross != null && recordedGross !== handicapGross
                  ? `${recordedGross} recorded / ${handicapGross} handicap gross (max +3 strokes vs par per hole)`
                  : undefined
              const gross = playerGrossForWeek(data, pid, week)
              const net = p ? playerNetForWeek(data, p, week) : null
              const hcpIdx =
                p != null && gross != null
                  ? computeHandicapIndex({
                      priorSeasonScores: p.priorSeasonScores,
                      currentSeasonTotals: handicapTotalsBeforeWeek(data, p, week),
                      asOfLeagueWeek: week,
                    })
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
                      <PlayerNameWithSenior name={label} isSenior={p?.isSenior ?? false} />
                      {isPulled && weekRow ? (
                        <span
                          className={styles.teamCardPulledTag}
                          title={`Gross ${weekRow.pulledGross} — absent, scored from flight draw`}
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

  const { teamWeekPts, teamHalfPts, teamsSorted } = useMemo(() => {
    const teamWeekPts = teamPointsForWeek(data, selectedWeek)
    const teamHalfPts = teamPointsHalfTotalsThroughWeek(data, selectedWeek)
    const teamsSorted = [...data.teams].sort((a, b) => {
      const ta = teamHalfPts.get(a.id) ?? 0
      const tb = teamHalfPts.get(b.id) ?? 0
      if (tb !== ta) return tb - ta
      return a.name.localeCompare(b.name)
    })
    return { teamWeekPts, teamHalfPts, teamsSorted }
  }, [data, selectedWeek])

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

      <div className={styles.standingsTopSplit}>
        <section
          className={`${styles.standingsSection} ${styles.standingsTeamHalf}`}
          aria-label="Team standings"
        >
          <h2 className={styles.standingsHeading}>Team standings</h2>
          <div className={styles.standingsTableWrap}>
            <table className={styles.standingsTable}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th className={styles.standingsNum}>Week</th>
                  <th className={styles.standingsNum}>Total</th>
                </tr>
              </thead>
              <tbody>
                {teamsSorted.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className={styles.standingsTeamCell}>
                        <span className={styles.standingsTeamLabel}>{t.name}</span>
                        <TeamRosterSubtitle data={data} team={t} week={selectedWeek} />
                      </div>
                    </td>
                    <td className={styles.standingsNum}>{formatStandingPoints(teamWeekPts.get(t.id) ?? 0)}</td>
                    <td className={styles.standingsNum}>{formatStandingPoints(teamHalfPts.get(t.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.standingsFlightsHalf} aria-label="Flight standings">
          {FLIGHTS.map((flight) => {
            const weekPts = flightPointMaps[flight]
            const halfPts = flightHalfPointMaps[flight]
            const players = playersByFlight[flight]
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
                          <th className={styles.standingsNum}>Week</th>
                          <th className={styles.standingsNum}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p) => {
                          const isPull = data.weeklyScores[p.id]?.[String(selectedWeek)]?.pulledGross != null
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
                            <td className={styles.standingsNum}>{formatStandingPoints(weekPts.get(p.id) ?? 0)}</td>
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
      </div>

      <hr className={styles.standingsMainDivider} />

      <div className={styles.standingsTeamCardsGrid}>
        {teamsInLeagueOrder.map((t) => (
          <TeamWeekCard key={t.id} data={data} team={t} week={selectedWeek} />
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
