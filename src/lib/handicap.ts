import type { Course, CourseNine, HoleDef, Player, WeeklyScoreRow } from '../data/leagueTypes'

const PAR_9_REFERENCE = 36

export function capStrokesForHandicap(strokes: number, par: number): number {
  return Math.min(strokes, par + 3)
}

export function sumPars(nine: CourseNine): number {
  return nine.holes.reduce((acc, h) => acc + h.par, 0)
}

export function handicapTotalFromHoles(
  row: WeeklyScoreRow | undefined,
  holesMeta: HoleDef[],
): number | null {
  if (!row?.holes?.length) return null
  let total = 0
  let filled = 0
  for (let i = 0; i < 9; i++) {
    const s = row.holes[i]
    const par = holesMeta[i]?.par
    if (s == null || par == null) continue
    filled++
    total += capStrokesForHandicap(s, par)
  }
  if (filled !== 9) return null
  return total
}

/** True when all nine holes are entered (not a pull / not incomplete). */
export function hasCompletePostedHoles(row: WeeklyScoreRow | undefined): boolean {
  if (!row?.holes || row.holes.length !== 9) return false
  if (row.pulledGross != null) return false
  return row.holes.every((s) => s != null && Number.isFinite(s))
}

export function grossTotalFromHoles(row: WeeklyScoreRow | undefined): number | null {
  if (!row) return null
  if (row.pulledGross != null && Number.isFinite(row.pulledGross)) {
    return Math.round(row.pulledGross)
  }
  if (!row.holes?.length) return null
  let total = 0
  let filled = 0
  for (const s of row.holes) {
    if (s == null) continue
    filled++
    total += s
  }
  if (filled !== 9) return null
  return total
}

export function relativeToParGross(
  row: WeeklyScoreRow | undefined,
  holesMeta: HoleDef[],
): number | null {
  const gross = grossTotalFromHoles(row)
  if (gross == null) return null
  const par = holesMeta.reduce((a, h) => a + h.par, 0)
  return gross - par
}

/**
 * Rolling 9-hole handicap index: (average of 5 middle scores − 36) × 0.8 after dropping high/low from the most recent 7,
 * then rounded to the nearest whole number — that integer is what net scoring subtracts from gross.
 * Weeks 1–7: pool can include priorSeasonScores (oldest→newest) plus current season in order.
 * Week 8+: league rules use the most recent 7 only (implemented as: drop older prior-season entries once 7 current exist).
 */
export function computeHandicapIndex(args: {
  priorSeasonScores: number[]
  currentSeasonTotals: number[]
  /** 1-based week number being rated “as of” (week 1 = only priors + week1). */
  asOfLeagueWeek: number
}): number | null {
  const { priorSeasonScores, currentSeasonTotals, asOfLeagueWeek } = args
  const priors = [...priorSeasonScores]
  const cur = [...currentSeasonTotals]

  let pool: number[]
  if (asOfLeagueWeek <= 7) {
    const needFromPrior = Math.max(0, 7 - cur.length)
    const priorTail = priors.slice(Math.max(0, priors.length - needFromPrior))
    pool = [...priorTail, ...cur]
  } else {
    pool = cur.slice(Math.max(0, cur.length - 7))
  }

  if (pool.length < 7) return null

  const last7 = pool.slice(Math.max(0, pool.length - 7))
  const sorted = [...last7].sort((a, b) => a - b)
  const trimmed = sorted.slice(1, -1)
  if (trimmed.length !== 5) return null
  const avg = trimmed.reduce((a, b) => a + b, 0) / 5
  return Math.round((avg - PAR_9_REFERENCE) * 0.8)
}

export function formatHandicapIndex(n: number | null): string {
  if (n == null) return '—'
  return String(Math.round(n))
}

/** 9-hole net total: gross minus whole-number handicap index from {@link computeHandicapIndex}. */
export function netNineFromGrossAndIndex(
  gross: number | null,
  handicapIndex: number | null,
): number | null {
  if (gross == null || handicapIndex == null) return null
  return gross - Math.round(handicapIndex)
}

function teesForPlayer(course: Course, player: Pick<Player, 'isSenior'>): {
  front: CourseNine
  back: CourseNine
} {
  return player.isSenior ? course.senior : course.nonSenior
}

export function getNineForWeek(
  course: Course,
  nine: 'front' | 'back',
  player: Pick<Player, 'isSenior'>,
): CourseNine {
  const t = teesForPlayer(course, player)
  return nine === 'front' ? t.front : t.back
}
