import { useMemo } from 'react'
import type { LeagueData } from './data/leagueTypes'
import { getPlayerContact } from './lib/playerContacts'
import { PlayerNameWithSenior } from './PlayerNameWithSenior.tsx'
import styles from './Home.module.css'

function ContactValue({ kind, value }: { kind: 'email' | 'phone'; value: string }) {
  if (!value) return <span className={styles.contactEmpty}>—</span>
  const href = kind === 'email' ? `mailto:${value}` : `tel:${value.replace(/\D/g, '')}`
  return (
    <a className={styles.contactLink} href={href}>
      {value}
    </a>
  )
}

export default function ContactInfoTab({ data }: { data: LeagueData }) {
  const playersSorted = useMemo(
    () =>
      [...data.players].sort(
        (a, b) => a.flight.localeCompare(b.flight) || a.name.localeCompare(b.name),
      ),
    [data.players],
  )

  return (
    <div className={styles.contactRoot}>
      <div className={styles.contactTableWrap}>
        <table className={styles.contactTable}>
          <thead>
            <tr>
              <th scope="col">Golfer</th>
              <th scope="col">Flight</th>
              <th scope="col">Email</th>
              <th scope="col">Phone</th>
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
                  <td className={styles.contactFlight}>{p.flight}</td>
                  <td>
                    <ContactValue kind="email" value={email} />
                  </td>
                  <td>
                    <ContactValue kind="phone" value={phone} />
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
