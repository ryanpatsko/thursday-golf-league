import type { Course, CourseNine, HoleDef, Player, WeeklyScoreRow } from '../data/leagueTypes'

const PAR_9_REFERENCE = 36

/** Max strokes counted per hole toward handicap totals: double bogey (par + 2). */
export function capStrokesForHandicap(strokes: number, par: number): number {
  return Math.min(strokes, par + 2)
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

/**
 * GRS column text: recorded 9-hole gross; when it differs from the capped handicap total, `recorded/capped`.
 */
export function formatGrossRecordedVsHandicap(
  recorded: number | null,
  handicapGross: number | null,
): string {
  if (recorded == null) return '—'
  if (handicapGross == null) return String(recorded)
  if (recorded === handicapGross) return String(recorded)
  return `${recorded}/${handicapGross}`
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
 * `(avg − 36) × 0.8` before rounding, where `avg` is the mean of the middle five scores after dropping
 * high/low from the most recent seven qualifying totals. Returns `null` if fewer than seven scores.
 */
export function computeHandicapIndexUnrounded(args: {
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
  return (avg - PAR_9_REFERENCE) * 0.8
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
  const raw = computeHandicapIndexUnrounded(args)
  if (raw == null) return null
  return Math.round(raw)
}

/**
 * Parsed admin override value when `active` is strictly on and `value` is a finite number
 * (coerces string/number from JSON).
 */
export function effectiveHandicapOverrideValue(
  player: Pick<Player, 'handicapOverride'>,
): number | null {
  const h = player.handicapOverride
  if (h == null || h.active !== true) return null
  const v = typeof h.value === 'number' ? h.value : Number(h.value)
  if (!Number.isFinite(v)) return null
  return v
}

/** True when an admin handicap override is on for this player. */
export function isHandicapOverrideActive(
  player: Pick<Player, 'handicapOverride'>,
): boolean {
  return effectiveHandicapOverrideValue(player) != null
}

/**
 * Whole-number 9-hole handicap index for net scoring: uses admin override when active,
 * otherwise {@link computeHandicapIndex}.
 */
export function playerHandicapIndexAtWeek(
  player: Player,
  currentSeasonTotals: number[],
  asOfLeagueWeek: number,
): number | null {
  const o = effectiveHandicapOverrideValue(player)
  if (o != null) {
    return Math.round(o)
  }
  return computeHandicapIndex({
    priorSeasonScores: player.priorSeasonScores,
    currentSeasonTotals,
    asOfLeagueWeek,
  })
}

/**
 * Unrounded index for Handicaps tab (formula one decimal). Override returns the stored numeric value.
 */
export function playerHandicapIndexUnroundedAtWeek(
  player: Player,
  currentSeasonTotals: number[],
  asOfLeagueWeek: number,
): number | null {
  const o = effectiveHandicapOverrideValue(player)
  if (o != null) {
    return o
  }
  return computeHandicapIndexUnrounded({
    priorSeasonScores: player.priorSeasonScores,
    currentSeasonTotals,
    asOfLeagueWeek,
  })
}

export function formatHandicapIndex(n: number | null): string {
  if (n == null) return '—'
  return String(Math.round(n))
}

/** One-decimal display for formula-based index (Handicaps tab when not using override). */
export function formatHandicapIndexOneDecimal(n: number | null): string {
  if (n == null) return '—'
  return (Math.round(n * 10) / 10).toFixed(1)
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
