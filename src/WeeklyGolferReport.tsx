import { useMemo } from 'react'
import type { LeagueData, Player } from './data/leagueTypes'
import {
  formatHandicapIndex,
  formatHandicapIndexOneDecimal,
  getNineForWeek,
  grossTotalFromHoles,
  handicapTotalFromHoles,
  isPullRow,
  playerHandicapIndexAtWeek,
} from './lib/handicap'
import { formatIsoDateForDisplay } from './lib/formatIsoDateDisplay'
import {
  flightPointsForWeek,
  flightPointsHalfTotalsThroughWeek,
  formatStandingPoints,
  handicapTotalsBeforeWeek,
  playerNetForWeek,
  teamPointsForWeek,
  teamPointsHalfTotalsThroughWeek,
} from './lib/leagueScoring'
import {
  fourManHalfForWeek,
  fourManOverallThroughWeek,
  fourManTeamForPlayer,
  fourManWeekTotal,
  formatFourManOverall,
} from './lib/fourManScoring'
import {
  handicapPoolDisplayForPlayer,
  type HandicapCellRole,
} from './lib/handicapReport'
import { placePhrase, pointsBehindLeader, standingPlace, strokesBehindLeader } from './lib/standingsPlace'
import { toIsoDateLocal, weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import { buildRoundGoodBadNews } from './lib/weeklyReportRoundNotes'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import type { PlayerModalTab } from './PlayerSeasonHistoryModal.tsx'
import styles from './Home.module.css'

function formatScore(n: number | null): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1)
}

function buildWeekScoreLine(
  data: LeagueData,
  player: Player,
  week: number,
): string | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
  if (!sched) return null

  const weekRow = data.weeklyScores[player.id]?.[sched.date]
  const hcpIdx = playerHandicapIndexAtWeek(
    player,
    handicapTotalsBeforeWeek(data, player, week),
    week,
  )
  const hcpLabel = formatHandicapIndex(hcpIdx)
  const net = playerNetForWeek(data, player, week)

  if (weekRow?.golfOffPlayedDate && net != null) {
    return `You posted a net ${formatScore(net)} from a golf-off (played ${formatIsoDateForDisplay(weekRow.golfOffPlayedDate)}) with your handicap at ${hcpLabel} for this week.`
  }

  if (isPullRow(weekRow)) {
    if (net != null) {
      const from = weekRow?.pulledFromPlayerName
        ? ` (scored from ${weekRow.pulledFromPlayerName}'s round)`
        : ''
      return `You were absent this week and received a pull net of ${formatScore(net)}${from}, with your handicap at ${hcpLabel}.`
    }
    return `You were marked absent (pull) this week with your handicap at ${hcpLabel}.`
  }

  const nine = getNineForWeek(data.course, sched.nine, player)
  const recordedGross = grossTotalFromHoles(weekRow)
  const handicapGross =
    weekRow && nine ? handicapTotalFromHoles(weekRow, nine.holes) : null
  const grossForCard =
    recordedGross ?? (handicapGross != null ? handicapGross : null)

  if (grossForCard == null || net == null) {
    return NO_POSTED_SCORE_LINE
  }

  const grossNote =
    recordedGross != null &&
    handicapGross != null &&
    recordedGross !== handicapGross
      ? ` (${handicapGross} for handicap)`
      : ''

  return `You carded a ${formatScore(grossForCard)} this week${grossNote}, which was good for a net ${formatScore(net)} with your current handicap at ${hcpLabel}.`
}

const NO_POSTED_SCORE_LINE = 'You do not have a posted score for this week yet.'

function playerHasPostedScoreForWeek(data: LeagueData, player: Player, week: number): boolean {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
  if (!sched) return false

  const weekRow = data.weeklyScores[player.id]?.[sched.date]
  if (isPullRow(weekRow)) return true

  const net = playerNetForWeek(data, player, week)
  if (weekRow?.golfOffPlayedDate && net != null) return true

  const nine = getNineForWeek(data.course, sched.nine, player)
  const recordedGross = grossTotalFromHoles(weekRow)
  const handicapGross =
    weekRow && nine ? handicapTotalFromHoles(weekRow, nine.holes) : null
  const grossForCard =
    recordedGross ?? (handicapGross != null ? handicapGross : null)

  return grossForCard != null && net != null
}

/** League week not yet played (today or later on the schedule) with no card posted. */
function isUpcomingWeekWithoutScore(data: LeagueData, player: Player, week: number): boolean {
  if (playerHasPostedScoreForWeek(data, player, week)) return false
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
  if (!sched) return false
  return sched.date >= toIsoDateLocal(new Date())
}

function behindLeaderSuffix(gap: number | null): string {
  return gap != null ? `, ${formatStandingPoints(gap)} points behind the leader` : ''
}

function behindLeaderShotsSuffix(gap: number | null): string {
  if (gap == null) return ''
  const label = gap === 1 ? '1 shot' : `${gap} shots`
  return `, ${label} behind the leader`
}

function buildFourManLine(
  weekTotal: number | null,
  overallRel: number | null,
  place: { place: number; tied: boolean } | null,
  shotsBehind: number | null,
): string | null {
  const parts: string[] = []
  if (weekTotal != null) parts.push(`posted a score of ${weekTotal}`)
  if (overallRel != null) parts.push(`is now ${formatFourManOverall(overallRel)} overall`)
  if (place != null) parts.push(`sitting in ${placePhrase(place.place, place.tied)}`)
  if (parts.length === 0) return null
  const tail =
    parts.length >= 3
      ? `${parts[0]}, ${parts[1]}, and ${parts[2]}`
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : parts[0]!
  return `Your Four Man team ${tail}${behindLeaderShotsSuffix(shotsBehind)}.`
}

function handicapScoreRoleClass(role: HandicapCellRole): string | undefined {
  switch (role) {
    case 'droppedLow':
    case 'droppedHigh':
      return styles.weeklyReportHcpDropped
    case 'countsForIndex':
      return styles.weeklyReportHcpCounts
    default:
      return undefined
  }
}

function handicapScoreRoleNote(role: HandicapCellRole, poolComplete: boolean): string | null {
  if (!poolComplete) return null
  if (role === 'droppedLow' || role === 'droppedHigh') return 'dropped'
  return null
}

function formatHandicapCalculationLine(middleFiveAverage: number, unrounded: number): string {
  const avgLabel = Number.isInteger(middleFiveAverage)
    ? String(middleFiveAverage)
    : (Math.round(middleFiveAverage * 10) / 10).toFixed(1)
  return `(Average ${avgLabel} − 36) × 80% = ${formatHandicapIndexOneDecimal(unrounded)}`
}

function buildNextWeekHandicapIntro(
  nextWeek: number,
  handicapIndex: number | null,
  handicapUsesOverride: boolean,
  poolComplete: boolean,
  poolCount: number,
): string {
  const weekLabel = `week ${nextWeek}`
  if (handicapUsesOverride && handicapIndex != null) {
    return `Your handicap index for ${weekLabel} will be ${formatHandicapIndex(handicapIndex)} (admin override).`
  }
  if (handicapIndex != null) {
    return `Your handicap index for ${weekLabel} will be ${formatHandicapIndex(handicapIndex)}.`
  }
  if (poolComplete) {
    return `Your handicap index for ${weekLabel} could not be calculated.`
  }
  const need = 7 - poolCount
  return `Your handicap index for ${weekLabel} is not set yet — you need ${need} more qualifying ${need === 1 ? 'score' : 'scores'} (you have ${poolCount}).`
}

export default function WeeklyGolferReport({
  data,
  player,
  week,
  onOpenPlayerModal,
}: {
  data: LeagueData
  player: Player
  week: number
  onOpenPlayerModal?: (tab: PlayerModalTab) => void
}) {
  const team = useMemo(
    () => data.teams.find((t) => t.playerIds.includes(player.id)) ?? null,
    [data.teams, player.id],
  )

  const { scoreLine, roundNotes, teamLine, flightLine, fourManLine, nextWeekHandicap, scoreOnly } =
    useMemo(() => {
    const scoreLine = buildWeekScoreLine(data, player, week)
    const scoreOnly = isUpcomingWeekWithoutScore(data, player, week)

    if (scoreOnly) {
      return {
        scoreLine: scoreLine ?? NO_POSTED_SCORE_LINE,
        roundNotes: null,
        teamLine: null,
        flightLine: null,
        fourManLine: null,
        nextWeekHandicap: null,
        scoreOnly: true,
      }
    }

    const roundNotes = buildRoundGoodBadNews(data, player, week)

    let teamLine: string | null = null
    if (team) {
      const weekPts = teamPointsForWeek(data, week).get(team.id) ?? 0
      const halfPts = teamPointsHalfTotalsThroughWeek(data, week)
      const teamIds = data.teams.map((t) => t.id)
      const place = standingPlace(teamIds, halfPts, team.id)
      const ptsLabel = formatStandingPoints(weekPts)
      teamLine =
        place != null
          ? `Your team (${team.name}) scored ${ptsLabel} points this week and is now in ${placePhrase(place.place, place.tied)}${behindLeaderSuffix(pointsBehindLeader(teamIds, halfPts, team.id))}.`
          : `Your team (${team.name}) scored ${ptsLabel} points this week.`
    }

    const flightWeekPts = flightPointsForWeek(data, player.flight, week)
    const flightHalfPts = flightPointsHalfTotalsThroughWeek(data, player.flight, week)
    const flightIds = data.players.filter((p) => p.flight === player.flight).map((p) => p.id)
    const flightPlace = standingPlace(flightIds, flightHalfPts, player.id)
    const flightWeek = flightWeekPts.get(player.id) ?? 0
    const flightLine =
      flightPlace != null
        ? `In Flight ${player.flight}, you scored ${formatStandingPoints(flightWeek)} points and are now in ${placePhrase(flightPlace.place, flightPlace.tied)}${behindLeaderSuffix(pointsBehindLeader(flightIds, flightHalfPts, player.id))}.`
        : `In Flight ${player.flight}, you scored ${formatStandingPoints(flightWeek)} points this week.`

    let fourManLine: string | null = null
    const fourManHalf = fourManHalfForWeek(data, week)
    const fourManTeam =
      fourManHalf != null ? fourManTeamForPlayer(fourManHalf, player.id) : null
    if (fourManTeam != null && fourManHalf != null) {
      const weekTotal = fourManWeekTotal(data, fourManTeam, week)
      const overallMap = fourManOverallThroughWeek(data, fourManHalf, week)
      const overallRel = overallMap.get(fourManTeam.id) ?? null
      const rankedIds = fourManHalf.teams
        .map((t) => t.id)
        .filter((id) => overallMap.get(id) != null)
      const rankPts = new Map(rankedIds.map((id) => [id, -(overallMap.get(id)!)]))
      const overallForRank = new Map(
        rankedIds.map((id) => [id, overallMap.get(id)!] as const),
      )
      const place = rankedIds.includes(fourManTeam.id)
        ? standingPlace(rankedIds, rankPts, fourManTeam.id)
        : null
      const shotsBehind = strokesBehindLeader(rankedIds, overallForRank, fourManTeam.id)
      fourManLine = buildFourManLine(weekTotal, overallRel, place, shotsBehind)
    }

    let nextWeekHandicap: ReturnType<typeof handicapPoolDisplayForPlayer> & {
      nextWeek: number
    } | null = null
    const nextWeek = week + 1
    if (weekNumbersInOrder(data).includes(nextWeek)) {
      const pool = handicapPoolDisplayForPlayer(data, player, nextWeek)
      if (pool.poolScores.length > 0 || pool.handicapIndex != null || pool.handicapUsesOverride) {
        nextWeekHandicap = {
          ...pool,
          nextWeek,
        }
      }
    }

    return {
      scoreLine,
      roundNotes,
      teamLine,
      flightLine,
      fourManLine,
      nextWeekHandicap,
      scoreOnly: false,
    }
  }, [data, player, week, team])

  const weekLabel = weekSelectLabel(data, week)

  return (
    <section className={styles.weeklyReport} aria-label={`Weekly report for ${player.name}`}>
      <header className={styles.weeklyReportHeader}>
        <h2 className={styles.weeklyReportTitle}>
          <PlayerNameWithSenior name={player.name} isSenior={player.isSenior} />
        </h2>
        <p className={styles.weeklyReportMeta}>
          {weekLabel}
          {team ? (
            <>
              <span className={styles.weeklyMetaSep}> · </span>
              {team.name}
              <span className={styles.weeklyMetaSep}> · </span>
              Flight {player.flight}
            </>
          ) : null}
        </p>
      </header>
      <ul className={styles.weeklyReportList}>
        {scoreLine ? (
          <li>
            {scoreLine}
            {roundNotes ? (
              <ul className={styles.weeklyReportSubList}>
                <li>
                  <span className={styles.weeklyReportSubLabel}>The good news: </span>
                  {roundNotes.goodNews}
                </li>
                <li>
                  <span className={styles.weeklyReportSubLabel}>The bad news: </span>
                  {roundNotes.badNews}
                </li>
              </ul>
            ) : null}
          </li>
        ) : null}
        {teamLine ? <li>{teamLine}</li> : null}
        {flightLine ? <li>{flightLine}</li> : null}
        {fourManLine ? <li>{fourManLine}</li> : null}
        {nextWeekHandicap ? (
          <li>
            {buildNextWeekHandicapIntro(
              nextWeekHandicap.nextWeek,
              nextWeekHandicap.handicapIndex,
              nextWeekHandicap.handicapUsesOverride,
              nextWeekHandicap.poolComplete,
              nextWeekHandicap.poolScores.length,
            )}
            {nextWeekHandicap.poolScores.length > 0 ? (
              <>
                {' '}
                Your last {nextWeekHandicap.poolScores.length} qualifying handicap{' '}
                {nextWeekHandicap.poolScores.length === 1 ? 'total' : 'totals'}:
                <ul className={styles.weeklyReportSubList}>
                  {nextWeekHandicap.poolScores.map((s) => {
                    const note = handicapScoreRoleNote(s.role, nextWeekHandicap.poolComplete)
                    return (
                      <li key={s.key} className={handicapScoreRoleClass(s.role)}>
                        {s.label}: {s.value}
                        {note ? ` (${note})` : ''}
                      </li>
                    )
                  })}
                </ul>
                {nextWeekHandicap.poolComplete &&
                !nextWeekHandicap.handicapUsesOverride &&
                nextWeekHandicap.middleFiveAverage != null &&
                nextWeekHandicap.handicapIndexUnrounded != null ? (
                  <span className={styles.weeklyReportHcpLegend}>
                    {formatHandicapCalculationLine(
                      nextWeekHandicap.middleFiveAverage,
                      nextWeekHandicap.handicapIndexUnrounded,
                    )}
                  </span>
                ) : null}
              </>
            ) : null}
          </li>
        ) : null}
        {onOpenPlayerModal && !scoreOnly ? (
          <li>
            View your scores{' '}
            <button
              type="button"
              className={styles.weeklyReportInlineLink}
              onClick={() => onOpenPlayerModal('scores')}
            >
              here
            </button>
            , and your updated course stats{' '}
            <button
              type="button"
              className={styles.weeklyReportInlineLink}
              onClick={() => onOpenPlayerModal('stats')}
            >
              here
            </button>
            .
          </li>
        ) : null}
      </ul>
    </section>
  )
}
