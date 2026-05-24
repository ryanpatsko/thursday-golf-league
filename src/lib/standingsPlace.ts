/** English ordinal without the number, e.g. 1 → "1st", 12 → "12th". */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export function placePhrase(place: number, tied: boolean): string {
  const label = ordinal(place)
  return tied ? `tied for ${label} place` : `${label} place`
}

/** After "is now" / "are now" — avoids "in tied for …". */
export function nowStandingPhrase(place: number, tied: boolean): string {
  return tied ? placePhrase(place, true) : `in ${placePhrase(place, false)}`
}

/** Four Man recap clause — avoids "sitting in tied for …". */
export function fourManStandingPhrase(place: number, tied: boolean): string {
  return tied ? `is ${placePhrase(place, true)}` : `sitting in ${placePhrase(place, false)}`
}

/**
 * 1-based standing place for `targetId` in a list sorted by points descending
 * (competition ranking: tied entries share the same place).
 */
export function standingPlace<T extends string>(
  ids: readonly T[],
  pointsById: Map<T, number>,
  targetId: T,
): { place: number; tied: boolean } | null {
  if (!ids.includes(targetId)) return null
  const sorted = [...ids].sort((a, b) => {
    const pa = pointsById.get(a) ?? 0
    const pb = pointsById.get(b) ?? 0
    if (pb !== pa) return pb - pa
    return String(a).localeCompare(String(b))
  })
  const targetPts = pointsById.get(targetId) ?? 0
  const place = sorted.findIndex((id) => (pointsById.get(id) ?? 0) === targetPts) + 1
  const tied = sorted.filter((id) => (pointsById.get(id) ?? 0) === targetPts).length > 1
  return { place, tied }
}

/** Points behind the leader when not tied for first; null if leading or tied for first. */
export function pointsBehindLeader<T extends string>(
  ids: readonly T[],
  pointsById: Map<T, number>,
  targetId: T,
): number | null {
  if (!ids.includes(targetId)) return null
  const targetPts = pointsById.get(targetId) ?? 0
  const leaderPts = Math.max(...ids.map((id) => pointsById.get(id) ?? 0))
  if (targetPts >= leaderPts) return null
  return leaderPts - targetPts
}

/** Strokes behind the leader when lower scores rank higher; null if leading or tied for first. */
export function strokesBehindLeader<T extends string>(
  ids: readonly T[],
  scoreById: Map<T, number>,
  targetId: T,
): number | null {
  if (!ids.includes(targetId)) return null
  const targetScore = scoreById.get(targetId) ?? 0
  const leaderScore = Math.min(...ids.map((id) => scoreById.get(id) ?? 0))
  if (targetScore <= leaderScore) return null
  return targetScore - leaderScore
}
