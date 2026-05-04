import type { Course, CourseNine, LeagueData, Player, ScheduleRow, Team } from './leagueTypes'
import { addDaysIso } from '../lib/dates'
import { slugifyName } from '../lib/slug'

/** Lakevue North scorecard handicap row (1–18), stored as printed — not renumbered per nine. */
export const LAKEVUE_NORTH_FRONT_HCP = [8, 6, 1, 17, 7, 16, 15, 11, 2] as const
export const LAKEVUE_NORTH_BACK_HCP = [18, 10, 9, 12, 3, 13, 5, 4, 14] as const

/** League handicap ranks (1–9 per nine) for White tees (non-senior). */
export const LAKEVUE_NORTH_WHITE_FRONT_LEAGUE_HCP = [5, 3, 1, 9, 4, 8, 7, 6, 2] as const
export const LAKEVUE_NORTH_WHITE_BACK_LEAGUE_HCP = [9, 5, 4, 6, 1, 7, 3, 2, 8] as const

/** League handicap ranks (1–9 per nine) for Gold tees (senior). */
export const LAKEVUE_NORTH_GOLD_FRONT_LEAGUE_HCP = [4, 3, 8, 7, 1, 6, 9, 5, 2] as const
export const LAKEVUE_NORTH_GOLD_BACK_LEAGUE_HCP = [7, 5, 3, 6, 9, 4, 8, 1, 2] as const

function isLakevueNorthName(name: string): boolean {
  return name.trim().toLowerCase() === 'lakevue north'
}

/** Overwrites handicap indexes (1–18), league handicap (1–9), and nine labels for Lakevue North — fixes stale S3 JSON. */
export function ensureLakevueNorthHandicapsAndLabels(course: Course): Course {
  if (!isLakevueNorthName(course.name)) return course
  const patchNine = (
    nine: CourseNine,
    hcp: readonly number[],
    leagueHcp: readonly number[],
    label: string,
  ): CourseNine => ({
    ...nine,
    label,
    holes: nine.holes.map((h, i) => ({
      ...h,
      strokeIndex: hcp[i] ?? h.strokeIndex,
      leagueHandicap: leagueHcp[i] ?? h.leagueHandicap,
    })),
  })
  return {
    ...course,
    nonSenior: {
      front: patchNine(course.nonSenior.front, LAKEVUE_NORTH_FRONT_HCP, LAKEVUE_NORTH_WHITE_FRONT_LEAGUE_HCP, 'White - Front 9'),
      back: patchNine(course.nonSenior.back, LAKEVUE_NORTH_BACK_HCP, LAKEVUE_NORTH_WHITE_BACK_LEAGUE_HCP, 'White - Back 9'),
    },
    senior: {
      front: patchNine(course.senior.front, LAKEVUE_NORTH_FRONT_HCP, LAKEVUE_NORTH_GOLD_FRONT_LEAGUE_HCP, 'Gold - Front 9'),
      back: patchNine(course.senior.back, LAKEVUE_NORTH_BACK_HCP, LAKEVUE_NORTH_GOLD_BACK_LEAGUE_HCP, 'Gold - Back 9'),
    },
  }
}

function mkHoles(
  pars: readonly number[],
  yards: readonly number[],
  stroke: readonly number[],
  leagueHcp: readonly number[],
) {
  return pars.map((par, i) => ({
    holeNumber: i + 1,
    par,
    yardage: yards[i] ?? 350,
    strokeIndex: stroke[i] ?? 1,
    leagueHandicap: leagueHcp[i] ?? 1,
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
      holes: mkHoles(frontPars, frontYardsGold, LAKEVUE_NORTH_FRONT_HCP, LAKEVUE_NORTH_GOLD_FRONT_LEAGUE_HCP),
    },
    back: {
      label: 'Gold - Back 9',
      holes: mkHoles(backPars, backYardsGold, LAKEVUE_NORTH_BACK_HCP, LAKEVUE_NORTH_GOLD_BACK_LEAGUE_HCP),
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
        holes: mkHoles(frontPars, frontYardsWhite, LAKEVUE_NORTH_FRONT_HCP, LAKEVUE_NORTH_WHITE_FRONT_LEAGUE_HCP),
      },
      back: {
        label: 'White - Back 9',
        holes: mkHoles(backParsWhite, backYardsWhite, LAKEVUE_NORTH_BACK_HCP, LAKEVUE_NORTH_WHITE_BACK_LEAGUE_HCP),
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

/**
 * 2026 season roster from league sheet: team, flight, player (* = senior / gold tees),
 * 2025 last seven gross totals (weeks 12–18), or empty for new players.
 */
type RosterRow = {
  teamName: string
  flight: 'A' | 'B' | 'C' | 'D'
  nameRaw: string
  prior: number[]
}

const ROSTER_2026: RosterRow[] = [
  { teamName: 'Team 1', flight: 'A', nameRaw: 'JEFF AIKEN*', prior: [37, 41, 35, 43, 45, 39, 39] },
  { teamName: 'Team 1', flight: 'B', nameRaw: 'JIM KELLY', prior: [36, 41, 45, 49, 43, 43, 42] },
  { teamName: 'Team 1', flight: 'C', nameRaw: 'ADAM FISHER', prior: [] },
  { teamName: 'Team 1', flight: 'D', nameRaw: 'ERV SULLIVAN*', prior: [60, 56, 54, 54, 53, 55, 51] },
  { teamName: 'Team 2', flight: 'A', nameRaw: 'JIM SHANKEL*', prior: [39, 42, 38, 42, 41, 37, 38] },
  { teamName: 'Team 2', flight: 'B', nameRaw: 'TOM EHRENBERGER', prior: [45, 45, 47, 45, 41, 42, 39] },
  { teamName: 'Team 2', flight: 'C', nameRaw: 'JOHN WATTS', prior: [] },
  { teamName: 'Team 2', flight: 'D', nameRaw: 'GEORGE SCHURER*', prior: [56, 56, 55, 50, 54, 54, 50] },
  { teamName: 'Team 3', flight: 'A', nameRaw: 'CRAIG PELAT*', prior: [44, 45, 39, 46, 41, 37, 37] },
  { teamName: 'Team 3', flight: 'B', nameRaw: 'BILL JACOBS*', prior: [42, 46, 45, 41, 46, 44, 41] },
  { teamName: 'Team 3', flight: 'C', nameRaw: 'ED STEFANOWICZ', prior: [48, 50, 45, 43, 47, 45, 42] },
  { teamName: 'Team 3', flight: 'D', nameRaw: 'GEORGE TRUSIK*', prior: [52, 51, 48, 49, 50, 48, 49] },
  { teamName: 'Team 4', flight: 'A', nameRaw: 'JEFF BASTIN', prior: [43, 38, 35, 40, 39, 39, 40] },
  { teamName: 'Team 4', flight: 'B', nameRaw: 'SCOTT SHANKEL', prior: [45, 45, 47, 43, 40, 44, 41] },
  { teamName: 'Team 4', flight: 'C', nameRaw: 'DAVE MORAN', prior: [46, 45, 44, 45, 45, 48, 47] },
  { teamName: 'Team 4', flight: 'D', nameRaw: 'STEVE PIOTROWSKI*', prior: [47, 54, 57, 55, 57, 51, 46] },
  { teamName: 'Team 5', flight: 'A', nameRaw: 'MICK PAPPAS*', prior: [39, 42, 42, 36, 38, 41, 41] },
  { teamName: 'Team 5', flight: 'B', nameRaw: 'DENNY NOTARESCHI*', prior: [45, 41, 47, 44, 47, 47, 39] },
  { teamName: 'Team 5', flight: 'C', nameRaw: 'BILL LEJA*', prior: [43, 43, 47, 41, 39, 45, 41] },
  { teamName: 'Team 5', flight: 'D', nameRaw: 'GERRY BEGLINGER', prior: [51, 50, 50, 50, 43, 50, 48] },
  { teamName: 'Team 6', flight: 'A', nameRaw: 'BILL SCHNEIDER*', prior: [43, 39, 44, 46, 40, 44, 42] },
  { teamName: 'Team 6', flight: 'B', nameRaw: 'BILL ROSS*', prior: [41, 43, 47, 49, 40, 44, 39] },
  { teamName: 'Team 6', flight: 'C', nameRaw: 'MIKE SULLIVAN', prior: [44, 41, 45, 50, 50, 52, 51] },
  { teamName: 'Team 6', flight: 'D', nameRaw: 'HARRY WILSON*', prior: [53, 46, 53, 47, 54, 46, 49] },
  { teamName: 'Team 7', flight: 'A', nameRaw: 'BILL SEMLER*', prior: [38, 45, 38, 43, 40, 40, 40] },
  { teamName: 'Team 7', flight: 'B', nameRaw: 'JOHN DEFILIPPO*', prior: [43, 49, 43, 42, 42, 43, 44] },
  { teamName: 'Team 7', flight: 'C', nameRaw: 'JOHN SLEIGHTER*', prior: [44, 45, 45, 45, 45, 44, 46] },
  { teamName: 'Team 7', flight: 'D', nameRaw: 'TOM MCGAUGHEY*', prior: [48, 50, 48, 46, 50, 46, 46] },
  { teamName: 'Team 8', flight: 'A', nameRaw: 'BOB BARTLEY*', prior: [41, 39, 40, 44, 42, 41, 45] },
  { teamName: 'Team 8', flight: 'B', nameRaw: 'JIM BOYD', prior: [42, 47, 41, 49, 40, 48, 49] },
  { teamName: 'Team 8', flight: 'C', nameRaw: 'JUSTIN GRAY', prior: [47, 44, 44, 40, 45, 46, 45] },
  { teamName: 'Team 8', flight: 'D', nameRaw: 'RYAN PATSKO', prior: [45, 51, 47, 48, 46, 45, 53] },
]

const iso = '2026-04-16'

function parseRosterName(raw: string): { name: string; isSenior: boolean } {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  const isSenior = trimmed.endsWith('*')
  const name = isSenior ? trimmed.slice(0, -1).trim() : trimmed
  return { name, isSenior }
}

function rosterPlayerId(row: RosterRow): string {
  return slugifyName(parseRosterName(row.nameRaw).name)
}

function buildPlayersAndTeams(): { players: Player[]; teams: Team[] } {
  const flightOrder: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 1, C: 2, D: 3 }
  const players: Player[] = ROSTER_2026.map((row) => {
    const { name, isSenior } = parseRosterName(row.nameRaw)
    const id = slugifyName(name)
    const teamNum = /^Team\s+(\d+)$/i.exec(row.teamName)?.[1] ?? '1'
    const player: Player = {
      id,
      name,
      flight: row.flight,
      teamId: `team-${teamNum}`,
      isSenior,
      priorSeasonScores: [...row.prior],
    }
    if (id === 'bill-leja') {
      player.handicapOverride = { value: 9, active: true }
    }
    return player
  })

  const teams: Team[] = []
  for (let n = 1; n <= 8; n++) {
    const teamName = `Team ${n}`
    const rows = ROSTER_2026.filter((r) => r.teamName === teamName).sort(
      (a, b) => flightOrder[a.flight] - flightOrder[b.flight],
    )
    if (rows.length !== 4) {
      throw new Error(`${teamName}: expected 4 roster rows, got ${rows.length}`)
    }
    teams.push({
      id: `team-${n}`,
      name: teamName,
      playerIds: rows.map((r) => rosterPlayerId(r)),
    })
  }

  return { players, teams }
}

const { players: seedPlayers, teams: seedTeams } = buildPlayersAndTeams()

const seedSchedule = buildSchedule(iso, 19)
const lastIdx = seedSchedule.length - 1
seedSchedule[lastIdx] = { ...seedSchedule[lastIdx]!, label: 'Playoffs' }

const seedFourManTeams = [
  { id: 'fm-h1-1', name: 'Team 1', playerIds: ['craig-pelat', 'john-defilippo', 'harry-wilson', 'jim-kelly'] },
  { id: 'fm-h1-2', name: 'Team 2', playerIds: ['bob-bartley', 'tom-ehrenberger', 'ryan-patsko', 'george-schurer'] },
  { id: 'fm-h1-3', name: 'Team 3', playerIds: ['bill-semler', 'bill-schneider', 'tom-mcgaughey', 'gerry-beglinger'] },
  { id: 'fm-h1-4', name: 'Team 4', playerIds: ['mick-pappas', 'dave-moran', 'mike-sullivan', 'john-watts'] },
  { id: 'fm-h1-5', name: 'Team 5', playerIds: ['bill-ross', 'ed-stefanowicz', 'denny-notareschi', 'erv-sullivan'] },
  { id: 'fm-h1-6', name: 'Team 6', playerIds: ['jeff-bastin', 'bill-jacobs', 'john-sleighter', 'george-trusik'] },
  { id: 'fm-h1-7', name: 'Team 7', playerIds: ['jeff-aiken', 'justin-gray', 'jim-boyd', 'steve-piotrowski'] },
  { id: 'fm-h1-8', name: 'Team 8', playerIds: ['jim-shankel', 'scott-shankel', 'adam-fisher', 'bill-leja'] },
]

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
  fourMan: {
    firstHalf: {
      startWeek: 1,
      endWeek: 9,
      teams: seedFourManTeams,
    },
    secondHalf: {
      startWeek: 10,
      endWeek: 19,
      teams: seedFourManTeams.map((t) => ({ ...t, id: t.id.replace('h1', 'h2') })),
    },
  },
}

/** For migrating older JSON that omits `isSenior`. */
export const defaultLeagueSeniorIds = new Set(
  defaultLeagueData.players.filter((p) => p.isSenior).map((p) => p.id),
)

export function cloneDefaultLeagueData(): LeagueData {
  return JSON.parse(JSON.stringify(defaultLeagueData)) as LeagueData
}
