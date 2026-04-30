import type {
  FlightId,
  FourManConfig,
  FourManHalf,
  FourManTeam,
  LeagueData,
} from '../data/leagueTypes'
import { describeFourManSaveBlocker } from '../lib/leagueSaveValidation'
import styles from './editors.module.css'

const FLIGHTS: FlightId[] = ['A', 'B', 'C', 'D']

function makeUniqueTeamId(existingIds: Set<string>, halfKey: string): string {
  let i = 1
  while (true) {
    const id = `fm-${halfKey}-${i}`
    if (!existingIds.has(id)) return id
    i++
  }
}

function defaultFourManConfig(weeksPerHalf: number, totalWeeks: number): FourManConfig {
  return {
    firstHalf: { startWeek: 1, endWeek: weeksPerHalf, teams: [] },
    secondHalf: { startWeek: weeksPerHalf + 1, endWeek: totalWeeks, teams: [] },
  }
}

interface HalfEditorProps {
  half: FourManHalf
  halfKey: 'h1' | 'h2'
  label: string
  allTeamIds: Set<string>
  players: LeagueData['players']
  onChange: (next: FourManHalf) => void
}

function HalfEditor({ half, halfKey, label, allTeamIds, players, onChange }: HalfEditorProps) {
  function onTeamSlotChange(teamIndex: number, slot: number, newId: string) {
    const teams: FourManTeam[] = half.teams.map((t) => ({
      ...t,
      playerIds: [...t.playerIds],
    }))
    const pick = newId.trim()
    if (pick) {
      for (const t of teams) {
        t.playerIds = t.playerIds.map((pid) => (pid === pick ? '' : pid))
      }
    }
    const row = teams[teamIndex]
    if (!row || slot < 0 || slot > 3) return
    const ids = [...row.playerIds]
    ids[slot] = pick
    row.playerIds = ids
    onChange({ ...half, teams })
  }

  function onAddTeam() {
    const id = makeUniqueTeamId(allTeamIds, halfKey)
    const newTeam: FourManTeam = {
      id,
      name: `Team ${half.teams.length + 1}`,
      playerIds: ['', '', '', ''],
    }
    onChange({ ...half, teams: [...half.teams, newTeam] })
  }

  function onRemoveTeam(teamIndex: number) {
    onChange({ ...half, teams: half.teams.filter((_, i) => i !== teamIndex) })
  }

  function onTeamNameChange(teamIndex: number, name: string) {
    onChange({
      ...half,
      teams: half.teams.map((t, i) => (i === teamIndex ? { ...t, name } : t)),
    })
  }

  return (
    <div className={styles.nineBlock}>
      <div className={styles.nineHeader}>
        <h3 className={styles.nineTitle}>{label}</h3>
        <div className={styles.scheduleMetaRow}>
          <label className={styles.field}>
            Start Week
            <input
              type="number"
              className={`${styles.input} ${styles.inputScheduleMetaShort}`}
              min={1}
              max={99}
              value={half.startWeek}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (Number.isFinite(v) && v >= 1) onChange({ ...half, startWeek: v })
              }}
            />
          </label>
          <label className={styles.field}>
            End Week
            <input
              type="number"
              className={`${styles.input} ${styles.inputScheduleMetaShort}`}
              min={1}
              max={99}
              value={half.endWeek}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (Number.isFinite(v) && v >= 1) onChange({ ...half, endWeek: v })
              }}
            />
          </label>
        </div>
      </div>

      {half.teams.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Team Name</th>
                {FLIGHTS.map((f) => (
                  <th key={f}>Flight {f}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {half.teams.map((t, teamIndex) => (
                <tr key={t.id}>
                  <td>
                    <input
                      className={styles.inputWide}
                      value={t.name}
                      onChange={(e) => onTeamNameChange(teamIndex, e.target.value)}
                    />
                  </td>
                  {FLIGHTS.map((f, slot) => {
                    const pid = t.playerIds[slot] ?? ''
                    const options = players.filter((p) => p.flight === f)
                    return (
                      <td key={f}>
                        <select
                          className={styles.inputWide}
                          value={pid}
                          onChange={(e) => onTeamSlotChange(teamIndex, slot, e.target.value)}
                        >
                          <option value="">—</option>
                          {options.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )
                  })}
                  <td>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => onRemoveTeam(teamIndex)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.help}>No teams yet. Add a team below.</p>
      )}

      <div className={styles.toolbar}>
        <button type="button" className={styles.btn} onClick={onAddTeam}>
          + Add Team
        </button>
      </div>
    </div>
  )
}

export default function FourManEditor({
  data,
  onChange,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
}) {
  const config: FourManConfig =
    data.fourMan ?? defaultFourManConfig(data.meta.weeksPerHalf, data.meta.totalWeeks)

  const blocker = describeFourManSaveBlocker(config, data)

  const allTeamIds = new Set([
    ...config.firstHalf.teams.map((t) => t.id),
    ...config.secondHalf.teams.map((t) => t.id),
  ])

  function setConfig(next: FourManConfig) {
    onChange({ ...data, fourMan: next })
  }

  return (
    <div className={styles.stack}>
      <p className={styles.help}>
        Four Man teams are a separate contest using the same weekly scores. Each team has one player
        from each flight (A–D). Set separate rosters and week ranges for each half of the season.
        Players can be on different teams in each half.
      </p>
      {blocker ? <div className={styles.warnBox}>{blocker}</div> : null}
      <HalfEditor
        half={config.firstHalf}
        halfKey="h1"
        label="First Half"
        allTeamIds={allTeamIds}
        players={data.players}
        onChange={(next) => setConfig({ ...config, firstHalf: next })}
      />
      <HalfEditor
        half={config.secondHalf}
        halfKey="h2"
        label="Second Half"
        allTeamIds={allTeamIds}
        players={data.players}
        onChange={(next) => setConfig({ ...config, secondHalf: next })}
      />
    </div>
  )
}
