import { useMemo, type ReactNode } from 'react'
import { FaTrophy } from 'react-icons/fa6'
import type { FlightId, LeagueData, Player, Team } from './data/leagueTypes'
import {
  flightPointsHalfTotalsThroughWeek,
  formatStandingPoints,
  teamPointsHalfTotalsThroughWeek,
} from './lib/leagueScoring'
import { formatIsoDateForDisplay } from './lib/formatIsoDateDisplay'
import { dateForWeek } from './lib/scheduleWeek'
import { standingPlace } from './lib/standingsPlace'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

const FLIGHTS: FlightId[] = ['A', 'B', 'C', 'D']

type TeamQualifier = {
  team: Team
  place: number
  tied: boolean
  points: number
}

type FlightQualifier = {
  flight: FlightId
  players: Player[]
  tied: boolean
  points: number
}

function topTeamsForHalf(data: LeagueData, asOfWeek: number, maxPlace: number): TeamQualifier[] {
  const pts = teamPointsHalfTotalsThroughWeek(data, asOfWeek)
  const ids = data.teams.map((t) => t.id)
  return data.teams
    .map((team) => {
      const placeInfo = standingPlace(ids, pts, team.id)
      if (!placeInfo || placeInfo.place > maxPlace) return null
      return {
        team,
        place: placeInfo.place,
        tied: placeInfo.tied,
        points: pts.get(team.id) ?? 0,
      }
    })
    .filter((x): x is TeamQualifier => x != null)
    .sort((a, b) => a.place - b.place || b.points - a.points || a.team.name.localeCompare(b.team.name))
}

function flightChampionsForHalf(data: LeagueData, asOfWeek: number): FlightQualifier[] {
  return FLIGHTS.map((flight) => {
    const pts = flightPointsHalfTotalsThroughWeek(data, flight, asOfWeek)
    const ids = data.players.filter((p) => p.flight === flight).map((p) => p.id)
    const leaders = data.players.filter((p) => {
      if (p.flight !== flight) return false
      const placeInfo = standingPlace(ids, pts, p.id)
      return placeInfo?.place === 1
    })
    const leaderPts = leaders.length > 0 ? (pts.get(leaders[0]!.id) ?? 0) : 0
    return {
      flight,
      players: leaders,
      tied: leaders.length > 1,
      points: leaderPts,
    }
  })
}

function TeamSlot({ data, qualifier }: { data: LeagueData; qualifier: TeamQualifier }) {
  const byId = new Map(data.players.map((p) => [p.id, p]))
  return (
    <div className={`${styles.playoffsSlot} ${styles.playoffsSlotFilled}`}>
      <span className={styles.playoffsPlace}>1st Half Winner</span>
      <span className={styles.playoffsName}>{qualifier.team.name}</span>
      <span className={styles.playoffsRoster}>
        {qualifier.team.playerIds.map((id, i) => {
          const p = byId.get(id)
          const isLast = i === qualifier.team.playerIds.length - 1
          return (
            <span key={id}>
              {p ? <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} /> : id}
              {!isLast ? ', ' : null}
            </span>
          )
        })}
      </span>
      <span className={styles.playoffsPts}>{formatStandingPoints(qualifier.points)} pts</span>
    </div>
  )
}

function FlightSlot({ qualifier }: { qualifier: FlightQualifier }) {
  return (
    <div className={`${styles.playoffsSlot} ${styles.playoffsSlotFilled}`}>
      <span className={styles.playoffsFlightTag}>Flight {qualifier.flight} - 1st Half Winner</span>
      <span className={styles.playoffsName}>
        {qualifier.players.length === 0 ? (
          '—'
        ) : (
          qualifier.players.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? ', ' : null}
              <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
            </span>
          ))
        )}
      </span>
      <span className={styles.playoffsPts}>{formatStandingPoints(qualifier.points)} pts</span>
    </div>
  )
}

function TbdSlot({ label }: { label: string }) {
  return (
    <div className={`${styles.playoffsSlot} ${styles.playoffsSlotTbd}`}>
      <span className={styles.playoffsTbdLabel}>{label}</span>
      <span className={styles.playoffsTbdHint}>TBD</span>
    </div>
  )
}

function MatchupRow({
  left,
  rightLabel,
}: {
  left: ReactNode
  rightLabel: string
}) {
  return (
    <div className={styles.playoffsMatchRow}>
      <div className={styles.playoffsMatchSide}>{left}</div>
      <div className={styles.playoffsMatchCenter}>
        <span className={styles.playoffsConnectorLeft} aria-hidden />
        <span className={styles.playoffsWinnerBox} title="Playoff winner">
          <FaTrophy className={styles.playoffsWinnerIcon} aria-hidden />
        </span>
        <span className={styles.playoffsConnectorRight} aria-hidden />
      </div>
      <div className={styles.playoffsMatchSide}>
        <TbdSlot label={rightLabel} />
      </div>
    </div>
  )
}

export default function PlayoffsTab({ data }: { data: LeagueData }) {
  const half1End = data.meta.weeksPerHalf
  const half2End = data.meta.totalWeeks - 1

  const playoffsDate = dateForWeek(data.schedule, data.meta.totalWeeks)
  const playoffsDateLabel = playoffsDate ? formatIsoDateForDisplay(playoffsDate) : null

  const firstHalfTeams = useMemo(() => topTeamsForHalf(data, half1End, 1), [data, half1End])
  const firstHalfFlights = useMemo(() => flightChampionsForHalf(data, half1End), [data, half1End])

  return (
    <div className={styles.playoffsRoot}>
      <div className={styles.playoffsBracket}>
        <div className={styles.playoffsColHeader}>
          <h2 className={styles.playoffsHalfHeading}>1st half</h2>
          <p className={styles.playoffsHalfSub}>Weeks 1–{half1End}</p>
        </div>
        <div className={styles.playoffsColHeaderCenter}>
          <h2 className={styles.playoffsCenterHeading}>Playoffs</h2>
          {playoffsDateLabel ? (
            <p className={styles.playoffsCenterDate}>{playoffsDateLabel}</p>
          ) : null}
        </div>
        <div className={styles.playoffsColHeader}>
          <h2 className={styles.playoffsHalfHeading}>2nd half</h2>
          <p className={styles.playoffsHalfSub}>Weeks {half1End + 1}–{half2End}</p>
        </div>

        <div className={styles.playoffsSectionLabel} style={{ gridColumn: '1 / -1' }}>
          Team matchups
        </div>

        {firstHalfTeams.length === 0 ? (
          <MatchupRow
            left={<TbdSlot label="1st Half Winner" />}
            rightLabel="2nd Half Winner"
          />
        ) : (
          firstHalfTeams.map((q) => (
            <MatchupRow
              key={q.team.id}
              left={<TeamSlot data={data} qualifier={q} />}
              rightLabel="2nd Half Winner"
            />
          ))
        )}

        <div className={styles.playoffsSectionLabel} style={{ gridColumn: '1 / -1' }}>
          Flight matchups
        </div>

        {firstHalfFlights.map((q) => (
          <MatchupRow
            key={q.flight}
            left={<FlightSlot qualifier={q} />}
            rightLabel={`Flight ${q.flight} - 2nd Half Winner`}
          />
        ))}
      </div>
    </div>
  )
}
