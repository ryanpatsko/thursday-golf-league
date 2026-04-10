import type { LeagueData, Player, Team } from '../data/leagueTypes'
import {
  getNineForWeek,
  grossTotalFromHoles,
  handicapTotalFromHoles,
  netNineFromGrossAndIndex,
  playerHandicapIndexAtWeek,
  sumPars,
} from './handicap'
import { leagueWeeksInHalfThrough } from './scheduleWeek'

const ABSENT_NET_FALLBACK = 42

export function handicapTotalsBeforeWeek(data: LeagueData, player: Player, beforeWeek: number): number[] {
  const out: number[] = []
  for (let w = 1; w < beforeWeek; w++) {
    const row = data.weeklyScores[player.id]?.[String(w)]
    const sched = data.schedule.find((s) => s.leagueWeekNumber === w)
    if (!sched || !row) continue
    const nine = getNineForWeek(data.course, sched.nine, player)
    const cap = handicapTotalFromHoles(row, nine.holes)
    if (cap != null) out.push(cap)
  }
  return out
}

export function playerNetForWeek(data: LeagueData, player: Player, week: number): number | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
  if (!sched) return null
  const row = data.weeklyScores[player.id]?.[String(week)]
  const gross = grossTotalFromHoles(row)
  const hist = handicapTotalsBeforeWeek(data, player, week)
  const idx = playerHandicapIndexAtWeek(player, hist, week)
  return netNineFromGrossAndIndex(gross, idx)
}

function averagePriorPlayerNets(data: LeagueData, player: Player, beforeWeek: number): number | null {
  const nets: number[] = []
  for (let w = 1; w < beforeWeek; w++) {
    const n = playerNetForWeek(data, player, w)
    if (n != null) nets.push(n)
  }
  if (nets.length === 0) return null
  return nets.reduce((a, b) => a + b, 0) / nets.length
}

function absentImputedNet(data: LeagueData, player: Player, week: number): number {
  const fromSeason = averagePriorPlayerNets(data, player, week)
  if (fromSeason != null) return fromSeason
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
  if (!sched) return ABSENT_NET_FALLBACK
  const nine = getNineForWeek(data.course, sched.nine, player)
  return sumPars(nine) + 5
}

/** How many roster players have a countable net for this week (complete card + handicap when applicable). */
export function teamWeekNetsPostedCount(data: LeagueData, team: Team, week: number): number {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
  if (!sched) return 0
  const players = team.playerIds
    .map((id) => data.players.find((p) => p.id === id))
    .filter((p): p is Player => p != null)
  let n = 0
  for (const p of players) {
    if (playerNetForWeek(data, p, week) != null) n++
  }
  return n
}

/** Team match aggregate net (lower is better). Null = forfeit. */
export function teamMatchNetTotal(data: LeagueData, team: Team, week: number): number | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
  if (!sched) return null

  const players = team.playerIds
    .map((id) => data.players.find((p) => p.id === id))
    .filter((p): p is Player => p != null)

  const nets = players.map((p) => ({ p, net: playerNetForWeek(data, p, week) }))
  const showing = nets.filter((x) => x.net != null) as { p: Player; net: number }[]

  if (showing.length <= 1) return null

  if (showing.length === 2) {
    const absent = nets.filter((x) => x.net == null).map((x) => x.p)
    if (absent.length !== 2) return null
    const n0 = absentImputedNet(data, absent[0]!, week)
    const n1 = absentImputedNet(data, absent[1]!, week)
    const third = Math.max(n0, n1) + 3
    return showing[0]!.net + showing[1]!.net + third
  }

  if (showing.length === 3) {
    return showing[0]!.net + showing[1]!.net + showing[2]!.net
  }

  const values = showing.map((x) => x.net).sort((a, b) => a - b)
  return values[0]! + values[1]! + values[2]!
}

/**
 * When all four players posted a net, the team total is the sum of the three lowest nets.
 * Returns the player id whose net is omitted (same multiset as {@link teamMatchNetTotal}; ties by id).
 */
export function teamMatchNetDroppedPlayerId(data: LeagueData, team: Team, week: number): string | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week)
  if (!sched) return null

  const players = team.playerIds
    .map((id) => data.players.find((p) => p.id === id))
    .filter((p): p is Player => p != null)

  const nets = players.map((p) => ({ id: p.id, net: playerNetForWeek(data, p, week) }))
  const showing = nets.filter((x): x is { id: string; net: number } => x.net != null)
  if (showing.length !== 4) return null

  const sorted = [...showing].sort((a, b) => {
    if (a.net !== b.net) return a.net - b.net
    return a.id.localeCompare(b.id)
  })
  return sorted[3]!.id
}

/**
 * Points for places 1..n: n-1, n-2, …, 0. Ties share the average of the slots they occupy.
 */
export function pointsFromRankedScores<T extends string>(
  ids: readonly T[],
  scoreById: Map<T, number | null>,
): Map<T, number> {
  const n = ids.length
  if (n === 0) return new Map()

  const allNull = ids.every((id) => scoreById.get(id) == null)
  if (allNull) return new Map(ids.map((id) => [id, 0]))

  const PEN = 1e12
  type Row = { id: T; score: number }
  const rows: Row[] = ids.map((id) => ({
    id,
    score: scoreById.get(id) ?? PEN,
  }))
  rows.sort((a, b) => a.score - b.score)

  const out = new Map<T, number>()
  let i = 0
  while (i < n) {
    let j = i + 1
    while (j < n && rows[j]!.score === rows[i]!.score) j++
    const k = j - i
    const startPlace = i + 1
    let sumPts = 0
    for (let t = 0; t < k; t++) sumPts += n - (startPlace + t)
    const avg = sumPts / k
    for (let t = i; t < j; t++) out.set(rows[t]!.id, avg)
    i = j
  }
  return out
}

export function teamPointsForWeek(data: LeagueData, week: number): Map<string, number> {
  const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name))
  const scoreById = new Map<string, number | null>()
  for (const t of teams) {
    if (teamWeekNetsPostedCount(data, t, week) < 3) {
      scoreById.set(t.id, null)
    } else {
      scoreById.set(t.id, teamMatchNetTotal(data, t, week))
    }
  }
  return pointsFromRankedScores(
    teams.map((t) => t.id),
    scoreById,
  )
}

export function flightPointsForWeek(data: LeagueData, flight: Player['flight'], week: number): Map<string, number> {
  const inFlight = data.players.filter((p) => p.flight === flight).sort((a, b) => a.name.localeCompare(b.name))
  const wk = String(week)
  const scoreById = new Map<string, number | null>()
  for (const p of inFlight) {
    const row = data.weeklyScores[p.id]?.[wk]
    if (row?.pulledGross != null) {
      scoreById.set(p.id, null)
    } else {
      scoreById.set(p.id, playerNetForWeek(data, p, week))
    }
  }
  const out = pointsFromRankedScores(
    inFlight.map((p) => p.id),
    scoreById,
  )
  /** Pulled rounds still drive team net/gross but never earn flight points (even if tie logic would split “last place”). */
  for (const p of inFlight) {
    if (data.weeklyScores[p.id]?.[wk]?.pulledGross != null) {
      out.set(p.id, 0)
    }
  }
  return out
}

/** Sum team standing points for every scheduled week from the half’s start through `asOfWeek`. */
export function teamPointsHalfTotalsThroughWeek(data: LeagueData, asOfWeek: number): Map<string, number> {
  const weeks = leagueWeeksInHalfThrough(data, asOfWeek)
  const totals = new Map(data.teams.map((t) => [t.id, 0]))
  for (const w of weeks) {
    const pts = teamPointsForWeek(data, w)
    for (const t of data.teams) {
      totals.set(t.id, (totals.get(t.id) ?? 0) + (pts.get(t.id) ?? 0))
    }
  }
  return totals
}

/** Sum flight standing points for every scheduled week from the half’s start through `asOfWeek`. */
export function flightPointsHalfTotalsThroughWeek(
  data: LeagueData,
  flight: Player['flight'],
  asOfWeek: number,
): Map<string, number> {
  const weeks = leagueWeeksInHalfThrough(data, asOfWeek)
  const inFlight = data.players.filter((p) => p.flight === flight)
  const totals = new Map(inFlight.map((p) => [p.id, 0]))
  for (const w of weeks) {
    const pts = flightPointsForWeek(data, flight, w)
    for (const p of inFlight) {
      totals.set(p.id, (totals.get(p.id) ?? 0) + (pts.get(p.id) ?? 0))
    }
  }
  return totals
}

export function formatStandingPoints(p: number): string {
  if (Number.isInteger(p)) return String(p)
  return (Math.round(p * 100) / 100).toString()
}
