export type FlightId = 'A' | 'B' | 'C' | 'D'
export type NineSide = 'front' | 'back'

export interface HoleDef {
  holeNumber: number
  par: number
  yardage: number
  /** Handicap hole rank from the scorecard (1–18 for this course), not renumbered per nine. */
  strokeIndex: number
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

export interface Player {
  id: string
  name: string
  flight: FlightId
  teamId: string
  /** Gold tee set; default false (White / non-senior). */
  isSenior: boolean
  /** Most recent rounds from the prior season (9-hole gross totals). Used for early-season handicap per league rules. */
  priorSeasonScores: number[]
}

export interface Team {
  id: string
  name: string
  /** Four slots in flight order A–D; each entry is a player id. */
  playerIds: string[]
}

export interface ScheduleRow {
  date: string
  leagueWeekNumber: number
  nine: NineSide
  label?: string
}

export interface WeeklyScoreRow {
  holes: (number | null)[]
}

export type WeeklyScores = Record<string, Record<string, WeeklyScoreRow>>

export interface LeagueData {
  version: number
  meta: LeagueMeta
  course: Course
  players: Player[]
  teams: Team[]
  schedule: ScheduleRow[]
  weeklyScores: WeeklyScores
}
