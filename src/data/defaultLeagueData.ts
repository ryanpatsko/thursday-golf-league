import type { Course, CourseNine, LeagueData, Player, ScheduleRow, Team } from './leagueTypes'
import { addDaysIso } from '../lib/dates'
import { slugifyName } from '../lib/slug'

/** Lakevue North scorecard handicap row (1–18), stored as printed — not renumbered per nine. */
export const LAKEVUE_NORTH_FRONT_HCP = [8, 6, 1, 17, 7, 16, 15, 11, 2] as const
export const LAKEVUE_NORTH_BACK_HCP = [18, 10, 9, 12, 3, 13, 5, 4, 14] as const

function isLakevueNorthName(name: string): boolean {
  return name.trim().toLowerCase() === 'lakevue north'
}

/** Overwrites handicap indexes (1–18) and nine labels for Lakevue North — fixes stale S3 JSON. */
export function ensureLakevueNorthHandicapsAndLabels(course: Course): Course {
  if (!isLakevueNorthName(course.name)) return course
  const patchNine = (nine: CourseNine, hcp: readonly number[], label: string): CourseNine => ({
    ...nine,
    label,
    holes: nine.holes.map((h, i) => ({
      ...h,
      strokeIndex: hcp[i] ?? h.strokeIndex,
    })),
  })
  return {
    ...course,
    nonSenior: {
      front: patchNine(course.nonSenior.front, LAKEVUE_NORTH_FRONT_HCP, 'White - Front 9'),
      back: patchNine(course.nonSenior.back, LAKEVUE_NORTH_BACK_HCP, 'White - Back 9'),
    },
    senior: {
      front: patchNine(course.senior.front, LAKEVUE_NORTH_FRONT_HCP, 'Gold - Front 9'),
      back: patchNine(course.senior.back, LAKEVUE_NORTH_BACK_HCP, 'Gold - Back 9'),
    },
  }
}

function mkHoles(
  pars: readonly number[],
  yards: readonly number[],
  stroke: readonly number[],
) {
  return pars.map((par, i) => ({
    holeNumber: i + 1,
    par,
    yardage: yards[i] ?? 350,
    strokeIndex: stroke[i] ?? 1,
  }))
}

/** Gold tees: yardages from the Gold row; pars from the card line shared with White on this course. */
export function lakevueNorthSeniorHalves(): { front: CourseNine; back: CourseNine } {
  const frontPars = [4, 3, 5, 3, 4, 4, 5, 4, 4] as const
  const frontYardsGold = [263, 181, 412, 132, 319, 286, 358, 270, 335] as const

  const backPars = [4, 3, 4, 4, 3, 5, 4, 5, 4] as const
  const backYardsGold = [263, 125, 286, 348, 100, 335, 410, 300, 377] as const

  return {
    front: {
      label: 'Gold - Front 9',
      holes: mkHoles(frontPars, frontYardsGold, LAKEVUE_NORTH_FRONT_HCP),
    },
    back: {
      label: 'Gold - Back 9',
      holes: mkHoles(backPars, backYardsGold, LAKEVUE_NORTH_BACK_HCP),
    },
  }
}

/** Non-senior: White. Senior: Gold (pars and yardages per scorecard). */
function lakevueNorthCourse(): Course {
  const frontPars = [4, 3, 5, 3, 4, 4, 5, 4, 4] as const
  const frontYardsWhite = [325, 190, 600, 150, 320, 325, 480, 300, 415] as const

  const backParsWhite = [4, 3, 4, 4, 3, 5, 4, 5, 4] as const
  const backYardsWhite = [290, 155, 300, 355, 185, 445, 420, 435, 385] as const

  return {
    name: 'Lakevue North',
    nonSenior: {
      front: {
        label: 'White - Front 9',
        holes: mkHoles(frontPars, frontYardsWhite, LAKEVUE_NORTH_FRONT_HCP),
      },
      back: {
        label: 'White - Back 9',
        holes: mkHoles(backParsWhite, backYardsWhite, LAKEVUE_NORTH_BACK_HCP),
      },
    },
    senior: lakevueNorthSeniorHalves(),
  }
}

function buildSchedule(startDate: string, totalWeeks: number): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  for (let i = 0; i < totalWeeks; i++) {
    const date = addDaysIso(startDate, i * 7)
    rows.push({
      date,
      leagueWeekNumber: i + 1,
      nine: i % 2 === 0 ? 'back' : 'front',
    })
  }
  return rows
}

/** Seed rows from 2025 CSV: name, flight after sorting prior averages, seven prior gross totals. */
const SEED: { name: string; flight: 'A' | 'B' | 'C' | 'D'; prior: number[] }[] = [
  { name: 'JEFF BASTIN', flight: 'A', prior: [43, 38, 35, 40, 39, 39, 40] },
  { name: 'JIM SHANKEL', flight: 'A', prior: [39, 42, 38, 42, 41, 37, 38] },
  { name: 'JEFF AIKEN', flight: 'A', prior: [37, 41, 35, 43, 45, 39, 39] },
  { name: 'MICK PAPPAS', flight: 'A', prior: [39, 42, 42, 36, 38, 41, 41] },
  { name: 'BILL SEMLER', flight: 'A', prior: [38, 45, 38, 43, 40, 40, 40] },
  { name: 'CRAIG PELAT', flight: 'A', prior: [44, 45, 39, 46, 41, 37, 37] },
  { name: 'JOHN HOUGH', flight: 'A', prior: [41, 41, 41, 46, 43, 42, 40] },
  { name: 'BRIAN PAPPAS', flight: 'A', prior: [42, 46, 44, 44, 40, 43, 39] },
  { name: 'BILL SCHNEIDER', flight: 'B', prior: [43, 39, 44, 46, 40, 44, 42] },
  { name: 'JIM KELLY', flight: 'B', prior: [36, 41, 45, 49, 43, 43, 42] },
  { name: 'BILL ROSS', flight: 'B', prior: [41, 43, 47, 49, 40, 44, 39] },
  { name: 'TOM EHRENBERGER', flight: 'B', prior: [45, 45, 47, 45, 41, 42, 39] },
  { name: 'SCOTT SHANKEL', flight: 'B', prior: [45, 45, 47, 43, 40, 44, 41] },
  { name: 'BILL JACOBS', flight: 'B', prior: [42, 46, 45, 41, 46, 44, 41] },
  { name: 'BOB BARTLEY', flight: 'B', prior: [43, 41, 42, 46, 44, 43, 47] },
  { name: 'JOHN DEFILIPPO', flight: 'B', prior: [43, 49, 43, 42, 42, 43, 44] },
  { name: 'DENNY NOTARESCHI', flight: 'C', prior: [45, 41, 47, 44, 47, 47, 39] },
  { name: 'JUSTIN GRAY', flight: 'C', prior: [47, 44, 44, 40, 45, 46, 45] },
  { name: 'JOHN SLEIGHTER', flight: 'C', prior: [44, 45, 45, 45, 45, 44, 46] },
  { name: 'JIM BOYD', flight: 'C', prior: [42, 47, 41, 49, 40, 48, 49] },
  { name: 'ED STEFANOWICZ', flight: 'C', prior: [48, 50, 45, 43, 47, 45, 42] },
  { name: 'DAVE MORAN', flight: 'C', prior: [46, 45, 44, 45, 45, 48, 47] },
  { name: 'MIKE SULLIVAN', flight: 'C', prior: [44, 41, 45, 50, 50, 52, 51] },
  { name: 'TOM MCGAUGHEY', flight: 'C', prior: [48, 50, 48, 46, 50, 46, 46] },
  { name: 'RYAN PATSKO', flight: 'D', prior: [45, 51, 47, 48, 46, 45, 53] },
  { name: 'JIM DEFILIPPO', flight: 'D', prior: [46, 51, 48, 52, 51, 48, 43] },
  { name: 'GERRY BEGLINGER', flight: 'D', prior: [51, 50, 50, 50, 43, 50, 48] },
  { name: 'BILL MCWILLIAMS', flight: 'D', prior: [52, 48, 48, 47, 51, 49, 52] },
  { name: 'GEORGE TRUSIK', flight: 'D', prior: [52, 51, 48, 49, 50, 48, 49] },
  { name: 'HARRY WILSON', flight: 'D', prior: [53, 46, 53, 47, 54, 46, 49] },
  { name: 'STEVE PIOTROWSKI', flight: 'D', prior: [47, 54, 57, 55, 57, 51, 46] },
  { name: 'GEORGE SCHURER', flight: 'D', prior: [56, 56, 55, 50, 54, 54, 50] },
]

const iso = '2026-04-16'

/** Player ids on Gold (senior) tees — ed-stefanowicz = “Ed S.” on the card. */
const SENIOR_IDS = new Set([
  'jeff-aiken',
  'bill-ross',
  'george-schurer',
  'george-trusik',
  'denny-notareschi',
  'craig-pelat',
  'ed-stefanowicz',
  'bill-jacobs',
  'harry-wilson',
  'bill-schneider',
  'mick-pappas',
])

function buildPlayersAndTeams(): { players: Player[]; teams: Team[] } {
  const byFlight: Record<'A' | 'B' | 'C' | 'D', typeof SEED> = { A: [], B: [], C: [], D: [] }
  for (const row of SEED) {
    byFlight[row.flight].push(row)
  }
  const idFor = (row: (typeof SEED)[number]) => slugifyName(row.name)
  const players: Player[] = SEED.map((row) => {
    const id = idFor(row)
    return {
      id,
      name: row.name.replace(/\s+/g, ' ').trim(),
      flight: row.flight,
      teamId: '',
      isSenior: SENIOR_IDS.has(id),
      priorSeasonScores: [...row.prior],
    }
  })
  const byId = new Map(players.map((p) => [p.id, p]))
  const flightOrder: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
  const teams: Team[] = []
  for (let i = 0; i < 8; i++) {
    const tid = `team-${i + 1}`
    const picks: string[] = []
    for (const f of flightOrder) {
      const row = byFlight[f][i]!
      picks.push(idFor(row))
    }
    teams.push({
      id: tid,
      name: `Team ${i + 1}`,
      playerIds: picks,
    })
    for (const pid of picks) {
      const p = byId.get(pid)
      if (p) p.teamId = tid
    }
  }
  return { players, teams }
}

const { players: seedPlayers, teams: seedTeams } = buildPlayersAndTeams()

const seedSchedule = buildSchedule(iso, 19)
const lastIdx = seedSchedule.length - 1
seedSchedule[lastIdx] = { ...seedSchedule[lastIdx]!, label: 'Playoffs' }

export const defaultLeagueData: LeagueData = {
  version: 1,
  meta: {
    seasonYear: 2026,
    seasonStartDate: iso,
    weeksPerHalf: 9,
    totalWeeks: 19,
  },
  course: lakevueNorthCourse(),
  players: seedPlayers,
  teams: seedTeams,
  schedule: seedSchedule,
  weeklyScores: {},
}

export function cloneDefaultLeagueData(): LeagueData {
  return JSON.parse(JSON.stringify(defaultLeagueData)) as LeagueData
}
