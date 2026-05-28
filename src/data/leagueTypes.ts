export type FlightId = 'A' | 'B' | 'C' | 'D'
export type NineSide = 'front' | 'back'

export interface HoleDef {
  holeNumber: number
  par: number
  yardage: number
  /** Course handicap hole rank from the scorecard (1–18 for this course), not renumbered per nine. */
  strokeIndex: number
  /** League handicap rank for this nine (1–9). May differ between White and Gold tees. */
  leagueHandicap?: number
}

export interface CourseNine {
  label: string
  holes: HoleDef[]
}

export interface Course {
  name: string
  /** White tees — non-senior (yardage + par from scorecard). */
  nonSenior: { front: CourseNine; back: CourseNine }
  /** Gold tees — senior. */
  senior: { front: CourseNine; back: CourseNine }
}

export interface LeagueMeta {
  seasonYear: number
  seasonStartDate: string
  weeksPerHalf: number
  totalWeeks: number
}

/** A single admin override value effective from a specific league week onward. */
export interface HandicapOverrideEntry {
  /** League week number (1-based) from which this value takes effect, inclusive. */
  startWeek: number
  /** 9-hole handicap index to use from `startWeek` onward (until a later entry applies). */
  value: number
}

export interface Player {
  id: string
  name: string
  flight: FlightId
  teamId: string
  /** Gold tee set; default false (White / non-senior). */
  isSenior: boolean
  /** Most recent rounds from the prior season (9-hole gross totals). Used for early-season handicap per league rules. */
  priorSeasonScores: number[]
  /**
   * When entries are present, net scoring and handicap display use them instead of the rolling calculation.
   * For a given league week N, the entry with the largest `startWeek ≤ N` is used.
   * If no entry qualifies, the earliest entry is used as a fallback.
   * Remove all entries (or the override object) to resume formula-based index (priors + current season).
   */
  handicapOverride?: {
    entries: HandicapOverrideEntry[]
  }
}

export interface Team {
  id: string
  name: string
  /** Four slots in flight order A–D; each entry is a player id. */
  playerIds: string[]
}

export interface FourManTeam {
  id: string
  name: string
  /** Four slots in flight order A–D; each entry is a player id. */
  playerIds: string[]
}

export interface FourManHalf {
  startWeek: number
  endWeek: number
  teams: FourManTeam[]
}

export interface FourManConfig {
  firstHalf: FourManHalf
  secondHalf: FourManHalf
}

export interface ScheduleRow {
  /** When true this date was rained out and does not count as a league week. `leagueWeekNumber` is 0. */
  rainOut?: boolean
  date: string
  leagueWeekNumber: number
  nine: NineSide
  label?: string
}

export interface WeeklyScoreRow {
  holes: (number | null)[]
  /**
   * Round was played before league night (golf-off). ISO date `YYYY-MM-DD` for the day played.
   * Omit for a normal Thursday round.
   */
  golfOffPlayedDate?: string
  /**
   * Absent week: 9-hole net score manually chosen from a flight peer's posted round.
   * Holes stay blank. Not eligible for flight points; still used for team net standings.
   */
  pulledNet?: number
  /**
   * Legacy field - absent week gross copied from a flight peer's posted round.
   * @deprecated New pulls use `pulledNet` instead. Retained for backward compatibility.
   */
  pulledGross?: number
  /** Snapshot of the peer's display name when the pull was recorded (for admin clarity). */
  pulledFromPlayerName?: string
  /** ID of the peer whose card was borrowed. Preferred over name for lookups. */
  pulledFromPlayerId?: string
}

export type WeeklyScores = Record<string, Record<string, WeeklyScoreRow>>

/** Persisted admin tee-time draw session (Thursday setup). Not shown on the public site. */
export type AdminTeeTimesReadyEntry = {
  playerId: string
  hasGuest: boolean
}

export type AdminTeeTimesGroup = {
  groupIndex: number
  members: AdminTeeTimesReadyEntry[]
}

/** Closest-to-the-pin winners for par 3s on a league night (keyed by ISO date in `greenies`). */
export interface GreeniesWeek {
  /** Par-3 hole number on the scheduled nine (1–9) → winning player id */
  winners: Record<string, string>
}

export type GreeniesByDate = Record<string, GreeniesWeek>

export interface LeagueData {
  version: number
  meta: LeagueMeta
  course: Course
  players: Player[]
  teams: Team[]
  schedule: ScheduleRow[]
  weeklyScores: WeeklyScores
  /** Four Man competition rosters — separate from the standard weekly team competition. */
  fourMan?: FourManConfig
  /** Ready list and pulled groups for the Tee Times admin tab. */
  adminTeeTimesSession?: {
    ready: AdminTeeTimesReadyEntry[]
    teeGroups: AdminTeeTimesGroup[]
  }
  /** Greenies (closest on par 3s) — winners per league night, keyed by schedule ISO date. */
  greenies?: GreeniesByDate
}
