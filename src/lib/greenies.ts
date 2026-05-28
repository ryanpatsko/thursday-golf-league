import type {
  Course,
  GreeniesByDate,
  HoleDef,
  LeagueData,
  NineSide,
  Player,
  WeeklyScoreRow,
} from '../data/leagueTypes'
import { isPullRow } from './handicap'
import { dateForWeek, displayHoleNumberOnNine, weekSelectLabel } from './scheduleWeek'

export const GREENIES_ENTRY_FEE = 2

/** Par-3 holes on the scheduled nine (pars match across tee sets). */
export function par3HolesOnNine(course: Course, nine: NineSide): HoleDef[] {
  return course.nonSenior[nine].holes.filter((h) => h.par === 3)
}

export function isGreeniesPotEligible(row: WeeklyScoreRow | undefined): boolean {
  if (row?.golfOffPlayedDate) return false
  if (isPullRow(row)) return false
  return true
}

export function eligibleGreeniesPlayerCount(data: LeagueData, week: number): number {
  const wkDate = dateForWeek(data.schedule, week)
  if (!wkDate) return 0
  let count = 0
  for (const p of data.players) {
    const row = data.weeklyScores[p.id]?.[wkDate]
    if (isGreeniesPotEligible(row)) count++
  }
  return count
}

export function greeniesPotDollars(eligibleCount: number): number {
  return eligibleCount * GREENIES_ENTRY_FEE
}

/** Each par-3 winner receives half the weekly pot. */
export function greeniesWinnerPayoutDollars(eligibleCount: number): number {
  return greeniesPotDollars(eligibleCount) / 2
}

export function formatGreeniesDollars(amount: number): string {
  return `$${amount}`
}

export function greeniesWinnersForWeek(
  greenies: GreeniesByDate | undefined,
  week: number,
  schedule: LeagueData['schedule'],
): Record<string, string> {
  const wkDate = dateForWeek(schedule, week)
  if (!wkDate) return {}
  return greenies?.[wkDate]?.winners ?? {}
}

export type GreeniesHoleResult = {
  holeNumber: number
  displayHole: number
  yardage: number
  winnerId: string | null
  winner: Player | null
  payoutDollars: number | null
}

export type GreeniesWeekSummary = {
  week: number
  title: string
  nine: NineSide | null
  eligibleCount: number
  potDollars: number
  payoutPerWinner: number
  holes: GreeniesHoleResult[]
}

export function greeniesWeekSummary(data: LeagueData, week: number): GreeniesWeekSummary | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
  if (!sched) return null

  const eligibleCount = eligibleGreeniesPlayerCount(data, week)
  const potDollars = greeniesPotDollars(eligibleCount)
  const payoutPerWinner = greeniesWinnerPayoutDollars(eligibleCount)
  const winners = greeniesWinnersForWeek(data.greenies, week, data.schedule)
  const byId = new Map(data.players.map((p) => [p.id, p]))

  const holes: GreeniesHoleResult[] = par3HolesOnNine(data.course, sched.nine).map((h) => {
    const winnerId = winners[String(h.holeNumber)] ?? null
    const winner = winnerId ? (byId.get(winnerId) ?? null) : null
    return {
      holeNumber: h.holeNumber,
      displayHole: displayHoleNumberOnNine(sched.nine, h.holeNumber - 1),
      yardage: h.yardage,
      winnerId,
      winner,
      payoutDollars: winner ? payoutPerWinner : null,
    }
  })

  return {
    week,
    title: weekSelectLabel(data, week),
    nine: sched.nine,
    eligibleCount,
    potDollars,
    payoutPerWinner,
    holes,
  }
}

export type GreeniesLeaderboardRow = {
  player: Player
  wins: number
  earningsDollars: number
}

export type GreeniesSeniorSplit = {
  seniorWins: number
  nonSeniorWins: number
}

export function greeniesSeasonStats(data: LeagueData): {
  leaderboard: GreeniesLeaderboardRow[]
  seniorSplit: GreeniesSeniorSplit
} {
  const winsByPlayer = new Map<string, number>()
  const earningsByPlayer = new Map<string, number>()
  let seniorWins = 0
  let nonSeniorWins = 0
  const byId = new Map(data.players.map((p) => [p.id, p]))

  for (const week of [...new Set(data.schedule.filter((r) => !r.rainOut).map((r) => r.leagueWeekNumber))].sort(
    (a, b) => a - b,
  )) {
    const summary = greeniesWeekSummary(data, week)
    if (!summary) continue
    for (const hole of summary.holes) {
      if (!hole.winnerId) continue
      winsByPlayer.set(hole.winnerId, (winsByPlayer.get(hole.winnerId) ?? 0) + 1)
      earningsByPlayer.set(
        hole.winnerId,
        (earningsByPlayer.get(hole.winnerId) ?? 0) + summary.payoutPerWinner,
      )
      const pl = byId.get(hole.winnerId)
      if (pl?.isSenior) seniorWins++
      else nonSeniorWins++
    }
  }

  const leaderboard: GreeniesLeaderboardRow[] = data.players
    .map((player) => ({
      player,
      wins: winsByPlayer.get(player.id) ?? 0,
      earningsDollars: earningsByPlayer.get(player.id) ?? 0,
    }))
    .filter((row) => row.wins > 0)
    .sort((a, b) => {
      if (b.earningsDollars !== a.earningsDollars) return b.earningsDollars - a.earningsDollars
      if (b.wins !== a.wins) return b.wins - a.wins
      return a.player.name.localeCompare(b.player.name)
    })

  return { leaderboard, seniorSplit: { seniorWins, nonSeniorWins } }
}

export function commitGreeniesWinner(
  data: LeagueData,
  week: number,
  holeNumber: number,
  playerId: string | '',
): LeagueData {
  const wkDate = dateForWeek(data.schedule, week)
  if (!wkDate) return data

  const prevWinners = { ...(data.greenies?.[wkDate]?.winners ?? {}) }
  const key = String(holeNumber)
  if (playerId) prevWinners[key] = playerId
  else delete prevWinners[key]

  return {
    ...data,
    greenies: {
      ...data.greenies,
      [wkDate]: { winners: prevWinners },
    },
  }
}
