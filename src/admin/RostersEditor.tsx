import type { FlightId, LeagueData, Player, Team } from '../data/leagueTypes'
import { describeLeagueSaveBlocker } from '../lib/leagueSaveValidation'
import styles from './editors.module.css'

const FLIGHTS: FlightId[] = ['A', 'B', 'C', 'D']

function syncTeamAssignments(teams: Team[], players: Player[]): Player[] {
  const byId = new Map(players.map((p) => [p.id, { ...p, teamId: '' }]))
  for (const t of teams) {
    for (const pid of t.playerIds) {
      if (!pid) continue
      const p = byId.get(pid)
      if (p) p.teamId = t.id
    }
  }
  return players.map((p) => byId.get(p.id) ?? p)
}

export default function RostersEditor({
  data,
  onChange,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
}) {
  const playersSorted = [...data.players].sort(
    (a, b) => a.flight.localeCompare(b.flight) || a.name.localeCompare(b.name),
  )

  function setPlayers(nextPlayers: Player[]) {
    onChange({ ...data, players: syncTeamAssignments(data.teams, nextPlayers) })
  }

  function setTeams(nextTeams: Team[]) {
    const players = syncTeamAssignments(nextTeams, data.players)
    onChange({ ...data, teams: nextTeams, players })
  }

  function onTeamSlotChange(teamIndex: number, slot: number, newId: string) {
    const teams: Team[] = data.teams.map((t) => ({
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
    setTeams(teams)
  }

  const saveBlocker = describeLeagueSaveBlocker(data)

  return (
    <div className={styles.stack}>
      {saveBlocker ? <div className={styles.warnBox}>{saveBlocker}</div> : null}
      <h3 className={styles.nineTitle}>Golfers</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Flight</th>
              <th>Senior</th>
              <th title="9-hole handicap index used for net when “Use ovr.” is checked.">HCP ovr.</th>
              <th title="Use the override index instead of the rolling calculation.">Use ovr.</th>
              <th>Prior 7 (gross)</th>
            </tr>
          </thead>
          <tbody>
            {playersSorted.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    className={styles.inputWide}
                    value={p.name}
                    onChange={(e) => {
                      const name = e.target.value
                      setPlayers(data.players.map((x) => (x.id === p.id ? { ...x, name } : x)))
                    }}
                  />
                </td>
                <td>
                  <select
                    className={styles.inputMed}
                    value={p.flight}
                    onChange={(e) => {
                      const flight = e.target.value as FlightId
                      const teams = data.teams.map((t) => ({
                        ...t,
                        playerIds: t.playerIds.map((pid) => (pid === p.id ? '' : pid)),
                      }))
                      const nextPlayers = data.players.map((x) =>
                        x.id === p.id ? { ...x, flight, teamId: '' } : x,
                      )
                      onChange({
                        ...data,
                        teams,
                        players: syncTeamAssignments(teams, nextPlayers),
                      })
                    }}
                  >
                    {FLIGHTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${p.name} senior (Gold tees)`}
                    checked={p.isSenior}
                    onChange={(e) => {
                      const isSenior = e.target.checked
                      setPlayers(data.players.map((x) => (x.id === p.id ? { ...x, isSenior } : x)))
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    className={styles.inputNarrow}
                    placeholder="—"
                    aria-label={`${p.name} handicap override (9-hole index)`}
                    value={p.handicapOverride?.value ?? ''}
                    onChange={(e) => {
                      const t = e.target.value.trim()
                      setPlayers(
                        data.players.map((x) => {
                          if (x.id !== p.id) return x
                          if (t === '') {
                            return { ...x, handicapOverride: undefined }
                          }
                          const num = Number(t)
                          if (!Number.isFinite(num)) return x
                          return {
                            ...x,
                            handicapOverride: {
                              value: num,
                              active: x.handicapOverride?.active ?? false,
                            },
                          }
                        }),
                      )
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${p.name} use handicap override for net scoring`}
                    checked={p.handicapOverride?.active ?? false}
                    onChange={(e) => {
                      const active = e.target.checked
                      setPlayers(
                        data.players.map((x) => {
                          if (x.id !== p.id) return x
                          const v = x.handicapOverride?.value
                          if (!active) {
                            if (v == null && !x.handicapOverride) return x
                            if (v == null) return { ...x, handicapOverride: undefined }
                            return { ...x, handicapOverride: { value: v, active: false } }
                          }
                          if (v == null || !Number.isFinite(v)) {
                            return x
                          }
                          return { ...x, handicapOverride: { value: v, active: true } }
                        }),
                      )
                    }}
                  />
                </td>
                <td>
                  <input
                    className={styles.inputWide}
                    value={p.priorSeasonScores.join(',')}
                    onChange={(e) => {
                      const raw = e.target.value
                      const parts = raw
                        .split(/[, ]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                      const nums = parts.map((x) => Number(x)).filter((n) => Number.isFinite(n))
                      setPlayers(
                        data.players.map((x) =>
                          x.id === p.id ? { ...x, priorSeasonScores: nums.slice(0, 20) } : x,
                        ),
                      )
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className={styles.nineTitle}>Teams (one per flight column)</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              {FLIGHTS.map((f) => (
                <th key={f}>Flight {f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.teams.map((t, teamIndex) => (
              <tr key={t.id}>
                <td>
                  <input
                    className={styles.inputWide}
                    value={t.name}
                    onChange={(e) => {
                      const name = e.target.value
                      setTeams(data.teams.map((x) => (x.id === t.id ? { ...x, name } : x)))
                    }}
                  />
                </td>
                {FLIGHTS.map((f, slot) => {
                  const pid = t.playerIds[slot] ?? ''
                  const options = data.players.filter((p) => p.flight === f)
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
