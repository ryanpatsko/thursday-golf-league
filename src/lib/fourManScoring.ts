import type { FourManHalf, FourManTeam, HoleDef, LeagueData, Player } from '../data/leagueTypes'
import {
  getNineForWeek,
  isPullRow,
  playerHandicapIndexAtWeek,
} from './handicap'
import { handicapTotalsBeforeWeek } from './leagueScoring'

export const FLIGHT_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }

export function isStrokeHole(hole: HoleDef, strokes: number): boolean {
  const hcp = hole.leagueHandicap ?? hole.strokeIndex
  return strokes > 0 && hcp <= strokes
}

export function formatFourManOverall(rel: number): string {
  if (rel === 0) return 'E'
  if (rel > 0) return `+${rel}`
  return `${rel}`
}

export function formatRelToPar(rel: number): string {
  if (rel === 0) return '(E)'
  if (rel > 0) return `(+${rel})`
  return `(${rel})`
}

function playerLookups(data: LeagueData) {
  const byId = new Map(data.players.map((p) => [p.id, p]))
  const byName = new Map(data.players.map((p) => [p.name, p]))
  return { byId, byName }
}

export function fourManHalfForWeek(data: LeagueData, week: number): FourManHalf | null {
  const config = data.fourMan
  if (!config) return null
  if (week >= config.firstHalf.startWeek && week <= config.firstHalf.endWeek) {
    return config.firstHalf
  }
  if (week >= config.secondHalf.startWeek && week <= config.secondHalf.endWeek) {
    return config.secondHalf
  }
  return null
}

export function fourManTeamForPlayer(half: FourManHalf, playerId: string): FourManTeam | null {
  return half.teams.find((t) => t.playerIds.includes(playerId)) ?? null
}

export function resolveEffectivePlayerForFourMan(
  data: LeagueData,
  player: Player,
  schedDate: string,
  byId: Map<string, Player>,
  byName: Map<string, Player>,
): Player {
  const row = data.weeklyScores[player.id]?.[schedDate]
  if (!row || !isPullRow(row)) return player
  if (row.pulledFromPlayerId) {
    const peer = byId.get(row.pulledFromPlayerId)
    if (peer) return peer
  }
  if (row.pulledFromPlayerName) {
    const peer = byName.get(row.pulledFromPlayerName)
    if (peer) return peer
  }
  return player
}

export function computePlayerStatsForWeek(
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

export function computeTeamWeekResult(
  data: LeagueData,
  players: Player[],
  schedDate: string,
  scheduledNine: 'front' | 'back',
  statsForWeek: Map<string, { hcp: number | null; strokes: number }>,
  byId: Map<string, Player>,
  byName: Map<string, Player>,
): { total: number; relToPar: number } | null {
  const whiteHoles = data.course.nonSenior[scheduledNine].holes
  let weekTotal = 0
  let weekPar = 0
  let weekHasScore = false

  for (let i = 0; i < whiteHoles.length; i++) {
    const whitePar = whiteHoles[i]?.par ?? 0
    const candidates: Array<{ pid: string; flight: string; score: number }> = []

    for (const p of players) {
      const ep = resolveEffectivePlayerForFourMan(data, p, schedDate, byId, byName)
      const stroke = data.weeklyScores[ep.id]?.[schedDate]?.holes[i] ?? null
      if (stroke == null) continue
      const stats = statsForWeek.get(ep.id) ?? { hcp: null, strokes: 0 }
      const nine = getNineForWeek(data.course, scheduledNine, ep)
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

  return weekHasScore ? { total: weekTotal, relToPar: weekTotal - weekPar } : null
}

export function computeTeamWeekRelToPar(
  data: LeagueData,
  players: Player[],
  schedDate: string,
  scheduledNine: 'front' | 'back',
  statsForWeek: Map<string, { hcp: number | null; strokes: number }>,
  byId: Map<string, Player>,
  byName: Map<string, Player>,
): number | null {
  return (
    computeTeamWeekResult(
      data,
      players,
      schedDate,
      scheduledNine,
      statsForWeek,
      byId,
      byName,
    )?.relToPar ?? null
  )
}

function fourManWeekResult(
  data: LeagueData,
  team: FourManTeam,
  week: number,
): { total: number; relToPar: number } | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
  if (!sched) return null
  const { byId, byName } = playerLookups(data)
  const players = team.playerIds
    .filter((pid) => byId.has(pid))
    .map((pid) => byId.get(pid)!)
  const statsForWeek = computePlayerStatsForWeek(data, week)
  return computeTeamWeekResult(
    data,
    players,
    sched.date,
    sched.nine,
    statsForWeek,
    byId,
    byName,
  )
}

export function fourManWeekTotal(
  data: LeagueData,
  team: FourManTeam,
  week: number,
): number | null {
  return fourManWeekResult(data, team, week)?.total ?? null
}

export function fourManWeekRelToPar(
  data: LeagueData,
  team: FourManTeam,
  week: number,
): number | null {
  return fourManWeekResult(data, team, week)?.relToPar ?? null
}

/** Cumulative relative-to-par through `week` for each team in the half (lower is better). */
export function fourManOverallThroughWeek(
  data: LeagueData,
  half: FourManHalf,
  week: number,
): Map<string, number | null> {
  const { byId, byName } = playerLookups(data)
  const map = new Map<string, number | null>()

  for (const team of half.teams) {
    const validPlayers = team.playerIds
      .filter((pid) => pid && byId.has(pid))
      .map((pid) => byId.get(pid)!)

    let cumRelToPar = 0
    let hasAnyWeek = false

    for (let w = half.startWeek; w <= Math.min(half.endWeek, week); w++) {
      const weekSched = data.schedule.find((s) => s.leagueWeekNumber === w && !s.rainOut)
      if (!weekSched) continue

      const hasScores = validPlayers.some((p) => {
        const ep = resolveEffectivePlayerForFourMan(data, p, weekSched.date, byId, byName)
        return data.weeklyScores[ep.id]?.[weekSched.date]?.holes.some((h) => h != null)
      })
      if (!hasScores) continue

      const statsForWeek = computePlayerStatsForWeek(data, w)
      const rel = computeTeamWeekRelToPar(
        data,
        validPlayers,
        weekSched.date,
        weekSched.nine,
        statsForWeek,
        byId,
        byName,
      )
      if (rel != null) {
        cumRelToPar += rel
        hasAnyWeek = true
      }
    }

    map.set(team.id, hasAnyWeek ? cumRelToPar : null)
  }
  return map
}
