import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LeagueData } from '../data/leagueTypes'
import {
  canDrawValidTeeGroup,
  canFillFourTeeSlots,
  drawRandomTeeGroup,
  type TeeGroupResult,
  type TeeReadyEntry,
} from '../lib/teeTimeDraw'
import { PlayerNameWithSenior } from '../PlayerNameWithSenior.tsx'
import styles from './editors.module.css'

const PULL_DELAY_MS = 950
const MAX_TEE_GROUP_BUTTONS = 8
const PERSIST_DEBOUNCE_MS = 400

export default function TeeTimesEditor({
  data,
  onChange,
  persistLeague,
  setSaveMsg,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
  persistLeague: (doc: LeagueData) => Promise<{ ok: true } | { ok: false; message: string }>
  setSaveMsg: (msg: string | null) => void
}) {
  const dataRef = useRef(data)
  dataRef.current = data

  const ready = data.adminTeeTimesSession?.ready ?? []
  const teeGroups = data.adminTeeTimesSession?.teeGroups ?? []

  const [pullingIndex, setPullingIndex] = useState<number | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDocRef = useRef<LeagueData | null>(null)

  const schedulePersist = useCallback(
    (doc: LeagueData) => {
      pendingDocRef.current = doc
      if (persistTimer.current) clearTimeout(persistTimer.current)
      persistTimer.current = setTimeout(() => {
        persistTimer.current = null
        const toSave = pendingDocRef.current
        pendingDocRef.current = null
        if (!toSave) return
        void (async () => {
          setSaveMsg(null)
          const r = await persistLeague(toSave)
          if (r.ok) setSaveMsg('Tee times saved.')
          else setSaveMsg(r.message)
        })()
      }, PERSIST_DEBOUNCE_MS)
    },
    [persistLeague, setSaveMsg],
  )

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [])

  const commitSession = useCallback(
    (nextReady: TeeReadyEntry[], nextGroups: TeeGroupResult[]) => {
      const base = dataRef.current
      const next: LeagueData = {
        ...base,
        adminTeeTimesSession: { ready: nextReady, teeGroups: nextGroups },
      }
      onChange(next)
      schedulePersist(next)
    },
    [onChange, schedulePersist],
  )

  const byId = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])

  const getTeamId = useCallback((playerId: string) => byId.get(playerId)?.teamId, [byId])

  const assignedIds = useMemo(() => {
    const s = new Set<string>()
    for (const g of teeGroups) {
      for (const m of g.members) s.add(m.playerId)
    }
    return s
  }, [teeGroups])

  const readyIds = useMemo(() => new Set(ready.map((r) => r.playerId)), [ready])

  const availablePlayers = useMemo(() => {
    return [...data.players]
      .filter((p) => !readyIds.has(p.id) && !assignedIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data.players, readyIds, assignedIds])

  const addToReady = useCallback(
    (playerId: string) => {
      setPullError(null)
      if (ready.some((r) => r.playerId === playerId)) return
      commitSession([...ready, { playerId, hasGuest: false }], teeGroups)
    },
    [ready, teeGroups, commitSession],
  )

  const removeFromReady = useCallback(
    (playerId: string) => {
      setPullError(null)
      commitSession(
        ready.filter((r) => r.playerId !== playerId),
        teeGroups,
      )
    },
    [ready, teeGroups, commitSession],
  )

  const toggleGuest = useCallback(
    (playerId: string) => {
      setPullError(null)
      commitSession(
        ready.map((r) => (r.playerId === playerId ? { ...r, hasGuest: !r.hasGuest } : r)),
        teeGroups,
      )
    },
    [ready, teeGroups, commitSession],
  )

  const resetSession = useCallback(() => {
    commitSession([], [])
    setPullingIndex(null)
    setPullError(null)
  }, [commitSession])

  const runPull = useCallback(
    async (groupIndex: number) => {
      const live = dataRef.current.adminTeeTimesSession?.teeGroups ?? []
      const liveReady = dataRef.current.adminTeeTimesSession?.ready ?? []

      if (live.length !== groupIndex - 1) return
      if (pullingIndex != null) return
      if (!canFillFourTeeSlots(liveReady)) {
        setPullError(
          'Ready list cannot fill exactly four tee slots (each +1 uses two slots). Add or remove players or toggle +1.',
        )
        return
      }
      if (!canDrawValidTeeGroup(liveReady, getTeamId)) {
        setPullError(
          'Cannot form a foursome without putting four teammates in the same group. Move someone to or from ready.',
        )
        return
      }

      setPullError(null)
      setPullingIndex(groupIndex)

      await new Promise((r) => window.setTimeout(r, PULL_DELAY_MS))

      const afterWaitReady = dataRef.current.adminTeeTimesSession?.ready ?? []
      const afterWaitGroups = dataRef.current.adminTeeTimesSession?.teeGroups ?? []
      if (afterWaitGroups.length !== groupIndex - 1) {
        setPullingIndex(null)
        return
      }

      const drawn = drawRandomTeeGroup(afterWaitReady, getTeamId)
      if (!drawn) {
        setPullError('Could not draw a foursome — try again or adjust the ready list.')
        setPullingIndex(null)
        return
      }

      const picked = new Set(drawn.map((d) => d.playerId))
      commitSession(
        afterWaitReady.filter((r) => !picked.has(r.playerId)),
        [...afterWaitGroups, { groupIndex, members: drawn }],
      )
      setPullingIndex(null)
    },
    [pullingIndex, getTeamId, commitSession],
  )

  const nextGroupNum = teeGroups.length + 1
  const canPullNext =
    pullingIndex == null && canDrawValidTeeGroup(ready, getTeamId) && ready.length > 0

  return (
    <div className={styles.stack}>
      <div className={styles.teeTimesHeader}>
        <div>
          <h3 className={styles.nineTitle}>Tee Times</h3>
          <p className={styles.teeTimesBlurb}>
            Move golfers into Ready to golf when they arrive and then pull tee groups in order. Changes
            save automatically.
          </p>
        </div>
        <button type="button" className={styles.teeTimesReset} onClick={resetSession}>
          Reset session
        </button>
      </div>

      {pullError ? (
        <p className={styles.warnBox} role="alert">
          {pullError}
        </p>
      ) : null}

      <div className={styles.teeTimesGrid}>
        <section className={styles.teeTimesPanel} aria-label="Available golfers">
          <h4 className={styles.teeTimesPanelTitle}>Available golfers</h4>
          <ul className={styles.teeTimesList}>
            {availablePlayers.map((p) => (
              <li key={p.id} className={styles.teeTimesRow}>
                <span className={styles.teeTimesName}>
                  <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                </span>
                <button type="button" className={styles.teeTimesMoveBtn} onClick={() => addToReady(p.id)}>
                  Ready
                </button>
              </li>
            ))}
          </ul>
          {availablePlayers.length === 0 ? (
            <p className={styles.teeTimesEmpty}>Everyone is in ready or already assigned to a tee group.</p>
          ) : null}
        </section>

        <section className={styles.teeTimesPanel} aria-label="Ready to golf">
          <h4 className={styles.teeTimesPanelTitle}>Ready to golf</h4>
          <ul className={styles.teeTimesList}>
            {ready.map((r) => {
              const p = byId.get(r.playerId)
              if (!p) return null
              return (
                <li key={r.playerId} className={styles.teeTimesRow}>
                  <span className={styles.teeTimesName}>
                    <PlayerNameWithSenior name={p.name} isSenior={p.isSenior} />
                    {r.hasGuest ? (
                      <span className={styles.teeTimesGuestBadge} title="Counts as two tee slots when pulled">
                        +1
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.teeTimesReadyActions}>
                    <button
                      type="button"
                      className={`${styles.teeTimesGuestToggle} ${r.hasGuest ? styles.teeTimesGuestToggleOn : ''}`}
                      onClick={() => toggleGuest(r.playerId)}
                      title="Guest counts as an extra slot (two total for this golfer)"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      className={styles.teeTimesRemoveBtn}
                      onClick={() => removeFromReady(r.playerId)}
                      aria-label={`Remove ${p.name} from ready`}
                      title="Remove from ready"
                    >
                      X
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          {ready.length === 0 ? (
            <p className={styles.teeTimesEmpty}>Add available golfers as they arrive</p>
          ) : null}
        </section>

        <section className={styles.teeTimesPanel} aria-label="Pull tee groups">
          <h4 className={styles.teeTimesPanelTitle}>Pull tee groups</h4>
          <p className={styles.teeTimesSlotHint}>
            Next group: <strong>{nextGroupNum}</strong>
            {ready.length > 0 ? (
              <>
                {' '}
                · Ready:{' '}
                <strong>
                  {ready.reduce((n, r) => n + (r.hasGuest ? 2 : 1), 0)}
                </strong>{' '}
                golfers
              </>
            ) : null}
          </p>
          <div className={styles.teeTimesPullButtons}>
            {Array.from({ length: MAX_TEE_GROUP_BUTTONS }, (_, i) => i + 1).map((n) => {
              const isNext = teeGroups.length === n - 1
              const isDone = teeGroups.some((g) => g.groupIndex === n)
              const disabled = !isNext || pullingIndex != null || !canPullNext
              return (
                <div key={n} className={styles.teeTimesPullRow}>
                  <button
                    type="button"
                    className={styles.teeTimesPullBtn}
                    disabled={disabled}
                    onClick={() => void runPull(n)}
                  >
                    Pull tee group {n}
                  </button>
                  {pullingIndex === n ? (
                    <span className={styles.teeTimesPullDrawing} aria-live="polite">
                      <span className={styles.scoresPullSpinner} aria-hidden />
                      <span>Drawing…</span>
                    </span>
                  ) : null}
                  {isDone ? (
                    <span className={styles.teeTimesPulledBadge} aria-label={`Group ${n} filled`}>
                      Done
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        <section className={styles.teeTimesPanel} aria-label="Today's groups">
          <h4 className={styles.teeTimesPanelTitle}>Today&apos;s groups</h4>
          {teeGroups.length > 0 ? (
            <ol className={styles.teeTimesGroupList}>
              {teeGroups.map((g) => (
                <li key={g.groupIndex} className={styles.teeTimesGroupCard}>
                  <div className={styles.teeTimesGroupHeading}>Tee group {g.groupIndex}</div>
                  <ul>
                    {g.members.map((m) => {
                      const pl = byId.get(m.playerId)
                      return (
                        <li key={m.playerId}>
                          {pl ? (
                            <>
                              <PlayerNameWithSenior name={pl.name} isSenior={pl.isSenior} />
                              {m.hasGuest ? (
                                <span className={styles.teeTimesGuestNote}> (+ guest)</span>
                              ) : null}
                            </>
                          ) : (
                            m.playerId
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.teeTimesEmpty}>No groups pulled yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
