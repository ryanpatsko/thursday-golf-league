export type HoleScoreDisplayKind =
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'doubleBogey'
  | 'tripleBogey'
  | 'quadruplePlus'

/** Classify gross strokes vs par for this hole (player-specific par from tee set). */
export function holeScoreDisplayKind(
  strokes: number | null | undefined,
  par: number | null | undefined,
): HoleScoreDisplayKind | null {
  if (strokes == null || par == null) return null
  if (!Number.isFinite(strokes) || !Number.isFinite(par)) return null
  const d = strokes - par
  if (d <= -2) return 'eagle'
  if (d === -1) return 'birdie'
  if (d === 0) return 'par'
  if (d === 1) return 'bogey'
  if (d === 2) return 'doubleBogey'
  if (d === 3) return 'tripleBogey'
  return 'quadruplePlus'
}

const BADGE_BASE = 'holeScoreBadge'

const VARIANT_CLASS: Record<Exclude<HoleScoreDisplayKind, 'par'>, string> = {
  eagle: 'holeScoreBadgeEagle',
  birdie: 'holeScoreBadgeBirdie',
  bogey: 'holeScoreBadgeBogey',
  doubleBogey: 'holeScoreBadgeDoubleBogey',
  tripleBogey: 'holeScoreBadgeTriple',
  quadruplePlus: 'holeScoreBadgeTriple',
}

/** Badge classes for `index.css`, or undefined for par / no score. */
export function holeScoreBadgeClassName(
  strokes: number | null | undefined,
  par: number | null | undefined,
): string | undefined {
  const k = holeScoreDisplayKind(strokes, par)
  if (k == null || k === 'par') return undefined
  return `${BADGE_BASE} ${VARIANT_CLASS[k]}`
}
