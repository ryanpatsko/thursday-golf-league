import { useMemo } from 'react'
import type { LeagueData } from '../data/leagueTypes'
import { getPlayerContact, setPlayerContactField } from '../lib/playerContacts'
import { PlayerNameWithSenior } from '../PlayerNameWithSenior.tsx'
import styles from './editors.module.css'

export default function ContactInfoEditor({
  data,
  onChange,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
}) {
  const playersSorted = useMemo(
    () =>
      [...data.players].sort(
        (a, b) => a.flight.localeCompare(b.flight) || a.name.localeCompare(b.name),
      ),
    [data.players],
  )

  return (
    <div className={styles.stack}>
      <p className={styles.help}>
        One row per golfer on the Rosters tab. Use Save Values when you are done editing.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Flight</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {playersSorted.map((p) => {
              const { email, phone } = getPlayerContact(data.playerContacts, p.id)
              return (
                <tr key={p.id}>
                  <td>
                    <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                  </td>
                  <td>{p.flight}</td>
                  <td>
                    <input
                      className={styles.inputWide}
                      type="email"
                      autoComplete="off"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) =>
                        onChange(setPlayerContactField(data, p.id, 'email', e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className={styles.inputWide}
                      type="tel"
                      autoComplete="off"
                      placeholder="(555) 555-5555"
                      value={phone}
                      onChange={(e) =>
                        onChange(setPlayerContactField(data, p.id, 'phone', e.target.value))
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
