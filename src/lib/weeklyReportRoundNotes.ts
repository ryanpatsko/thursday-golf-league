import type { LeagueData, Player } from '../data/leagueTypes'
import { getNineForWeek, hasCompletePostedHoles } from './handicap'
import { displayHoleNumberOnNine } from './scheduleWeek'

type HolePlay = { holeNum: number; score: number; par: number; rel: number }

const SNARKY_GOOD = [
  'Not much silver lining on this one — chalk it up to a tough day.',
  'The scorecard is shy on highlights, but the 19th hole is still open.',
  'Hard to spin this round. Shake it off and come back swinging.',
  'Your good news might be that it could always be worse. (It could also be better.)',
  'The rangefinder worked fine, at least. The wedges, not so much.',
] as const

const SNARKY_BAD = [
  'Nothing ugly to report — you kept most of the damage in check.',
  'No real disasters on the card. Annoyingly clean, actually.',
  'Hard to find fault with much out there. Suspicious, even.',
] as const

function formatHoleList(holes: number[]): string {
  if (holes.length === 1) return `hole ${holes[0]}`
  if (holes.length === 2) return `holes ${holes[0]} and ${holes[1]}`
  return `holes ${holes.slice(0, -1).join(', ')}, and ${holes[holes.length - 1]}`
}

function lowercaseFirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function joinNotes(notes: string[]): string {
  if (notes.length === 0) return ''
  if (notes.length === 1) return notes[0]!
  const [first, ...rest] = notes
  const tail = rest.map(lowercaseFirst)
  if (tail.length === 1) return `${first} and ${tail[0]}`
  return `${first}, ${tail.slice(0, -1).join(', ')}, and ${tail[tail.length - 1]}`
}

function noteSeed(playerId: string, week: number): number {
  let h = week
  for (let i = 0; i < playerId.length; i++) {
    h = (h * 31 + playerId.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function collectHolePlays(
  data: LeagueData,
  player: Player,
  week: number,
): HolePlay[] | null {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === week && !s.rainOut)
  if (!sched) return null
  const weekRow = data.weeklyScores[player.id]?.[sched.date]
  if (!hasCompletePostedHoles(weekRow)) return null

  const nine = getNineForWeek(data.course, sched.nine, player)
  const holes: HolePlay[] = []
  for (let i = 0; i < 9; i++) {
    const score = weekRow!.holes[i]
    const par = nine.holes[i]?.par
    if (score == null || par == null) return null
    holes.push({
      holeNum: displayHoleNumberOnNine(sched.nine, i),
      score,
      par,
      rel: score - par,
    })
  }
  return holes
}

export function buildRoundGoodBadNews(
  data: LeagueData,
  player: Player,
  week: number,
): { goodNews: string; badNews: string } | null {
  const holes = collectHolePlays(data, player, week)
  if (!holes) return null

  const good: string[] = []
  const bad: string[] = []

  const eagleHoles = holes.filter((h) => h.rel <= -2).map((h) => h.holeNum)
  const birdieHoles = holes.filter((h) => h.rel === -1).map((h) => h.holeNum)
  const parCount = holes.filter((h) => h.rel === 0).length
  const doubleCount = holes.filter((h) => h.rel === 2).length
  const tripleCount = holes.filter((h) => h.rel >= 3).length
  const worstRel = Math.max(...holes.map((h) => h.rel))
  const blowupHoles = holes.filter((h) => h.score >= 10)

  if (eagleHoles.length > 0) {
    good.push(`You eagled ${formatHoleList(eagleHoles)}`)
  }
  if (birdieHoles.length > 0) {
    good.push(`You birdied ${formatHoleList(birdieHoles)}`)
  }
  if (parCount > 0) {
    good.push(`You posted ${parCount} ${parCount === 1 ? 'par' : 'pars'}`)
  }
  if (worstRel <= 1) {
    good.push(`You didn't have any score worse than a bogey`)
  } else if (tripleCount === 0) {
    good.push(`You didn't have any triple bogeys`)
  }

  if (parCount === 0 && birdieHoles.length === 0 && eagleHoles.length === 0) {
    bad.push(`You didn't have any pars or birdies`)
  }
  for (const h of blowupHoles.slice(0, 2)) {
    bad.push(`You had a ${h.score} on hole ${h.holeNum}`)
  }
  if (tripleCount > 0) {
    bad.push(`You had ${tripleCount} triple ${tripleCount === 1 ? 'bogey' : 'bogeys'}`)
  }
  if (doubleCount > 0) {
    bad.push(`You had ${doubleCount} double ${doubleCount === 1 ? 'bogey' : 'bogeys'}`)
  }

  const seed = noteSeed(player.id, week)
  if (good.length === 0) {
    good.push(SNARKY_GOOD[seed % SNARKY_GOOD.length]!)
  }
  if (bad.length === 0) {
    bad.push(SNARKY_BAD[seed % SNARKY_BAD.length]!)
  }

  return {
    goodNews: `${joinNotes(good.slice(0, 4))}.`,
    badNews: `${joinNotes(bad.slice(0, 4))}.`,
  }
}
