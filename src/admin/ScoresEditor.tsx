import { useEffect, useMemo, useState } from 'react'
import type { LeagueData, Player, WeeklyScoreRow } from '../data/leagueTypes'
import {
  computeHandicapIndex,
  formatHandicapIndex,
  getNineForWeek,
  grossTotalFromHoles,
  handicapTotalFromHoles,
  hasCompletePostedHoles,
  netNineFromGrossAndIndex,
} from '../lib/handicap'
import { holeScoreBadgeClassName } from '../lib/holeScoreDisplay'
import { flightPointsForWeek, formatStandingPoints } from '../lib/leagueScoring'
import { formatIsoDateForDisplay } from '../lib/formatIsoDateDisplay'
import { displayHoleNumberOnNine } from '../lib/scheduleWeek'
import styles from './editors.module.css'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function localIsoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isValidCalendarIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

function totalsBeforeWeek(data: LeagueData, player: Player, beforeWeek: number): number[] {
  const out: number[] = []
  for (let w = 1; w < beforeWeek; w++) {
    const row = data.weeklyScores[player.id]?.[String(w)]
    const sched = data.schedule.find((s) => s.leagueWeekNumber === w)
    if (!sched || !row) continue
    const nine = getNineForWeek(data.course, sched.nine, player)
    const cap = handicapTotalFromHoles(row, nine.holes)
    if (cap != null) out.push(cap)
  }
  return out
}

function ensureNineHoles(h: (number | null)[] | undefined): (number | null)[] {
  const out = [...(h ?? [])]
  while (out.length < 9) out.push(null)
  return out.slice(0, 9)
}

const HOLE_STROKE_MIN = 1
const HOLE_STROKE_MAX = 20

function holesRowComplete(holes: (number | null)[]): boolean {
  const row = ensureNineHoles(holes)
  return row.every(
    (s) =>
      s != null && Number.isFinite(s) && Number.isInteger(s) && s >= HOLE_STROKE_MIN && s <= HOLE_STROKE_MAX,
  )
}

function commitWeekScores(
  data: LeagueData,
  playerId: string,
  week: number,
  holes: (number | null)[],
  golfOffPlayedDate: string | null,
): LeagueData {
  const nextScores = { ...data.weeklyScores }
  const byWeek = { ...(nextScores[playerId] ?? {}) }
  const allNull = holes.every((x) => x == null)
  if (allNull) {
    const { [String(week)]: _, ...rest } = byWeek
    nextScores[playerId] = rest
    if (Object.keys(rest).length === 0) {
      const { [playerId]: __, ...scoresRest } = nextScores
      return { ...data, weeklyScores: scoresRest }
    }
  } else {
    const row: WeeklyScoreRow = { holes: [...holes] }
    if (golfOffPlayedDate) row.golfOffPlayedDate = golfOffPlayedDate
    byWeek[String(week)] = row
    nextScores[playerId] = byWeek
  }
  return { ...data, weeklyScores: nextScores }
}

function commitPulledWeek(
  data: LeagueData,
  playerId: string,
  week: number,
  pulledGross: number,
  pulledFromPlayerName: string,
): LeagueData {
  const nextScores = { ...data.weeklyScores }
  const byWeek = { ...(nextScores[playerId] ?? {}) }
  const blankHoles: (number | null)[] = Array.from({ length: 9 }, () => null)
  const row: WeeklyScoreRow = {
    holes: blankHoles,
    pulledGross: Math.round(pulledGross),
    pulledFromPlayerName,
  }
  byWeek[String(week)] = row
  nextScores[playerId] = byWeek
  return { ...data, weeklyScores: nextScores }
}

function ScoreEntryModal({
  data,
  player,
  selectedWeek,
  scheduledNine,
  onSave,
  onSavePull,
  onClose,
}: {
  data: LeagueData
  player: Player
  selectedWeek: number
  scheduledNine: 'front' | 'back'
  onSave: (
    holes: (number | null)[],
    golfOffPlayedDate: string | null,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  onSavePull: (args: { pulledGross: number; pulledFromPlayerName: string }) => Promise<
    { ok: true } | { ok: false; message: string }
  >
  onClose: () => void
}) {
  const existing = data.weeklyScores[player.id]?.[String(selectedWeek)]
  const [holes, setHoles] = useState<(number | null)[]>(() => ensureNineHoles(existing?.holes))
  const [isGolfOff, setIsGolfOff] = useState(() => Boolean(existing?.golfOffPlayedDate))
  const [golfOffDate, setGolfOffDate] = useState(() => existing?.golfOffPlayedDate ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [screen, setScreen] = useState<'entry' | 'pull'>('entry')
  const [pullPhase, setPullPhase] = useState<'pick' | 'drawing' | 'result'>('pick')
  const [drawnPull, setDrawnPull] = useState<{ gross: number; fromName: string } | null>(null)
  const [pullSaving, setPullSaving] = useState(false)
  const [pullSaveError, setPullSaveError] = useState<string | null>(null)
  const playerNine = getNineForWeek(data.course, scheduledNine, player)

  const flightPeers = useMemo(() => {
    return data.players
      .filter((p) => p.flight === player.flight && p.id !== player.id)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data.players, player.flight, player.id])

  const postedPeersForPull = useMemo(() => {
    const wk = String(selectedWeek)
    const out: { peer: Player; gross: number }[] = []
    for (const p of flightPeers) {
      const r = data.weeklyScores[p.id]?.[wk]
      if (hasCompletePostedHoles(r)) {
        const g = grossTotalFromHoles(r)
        if (g != null) out.push({ peer: p, gross: g })
      }
    }
    return out
  }, [data.weeklyScores, flightPeers, selectedWeek])

  const canPullFromPool = postedPeersForPull.length > 0
  const pullBusy = pullSaving || pullPhase === 'drawing'

  function leavePullScreen() {
    setScreen('entry')
    setPullPhase('pick')
    setDrawnPull(null)
    setPullSaveError(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (saving || pullSaving) return
      if (pullPhase === 'drawing') return
      if (screen === 'pull') {
        setScreen('entry')
        setPullPhase('pick')
        setDrawnPull(null)
        setPullSaveError(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving, pullSaving, pullPhase, screen])

  function setHole(i: number, raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      setHoles((prev) => {
        const next = ensureNineHoles(prev)
        next[i] = null
        return next
      })
      return
    }
    const v = Number(trimmed)
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < HOLE_STROKE_MIN || v > HOLE_STROKE_MAX) return
    setHoles((prev) => {
      const next = ensureNineHoles(prev)
      next[i] = v
      return next
    })
  }

  const holesComplete = useMemo(() => holesRowComplete(holes), [holes])
  const golfOffDateOk =
    !isGolfOff ||
    (ISO_DATE_RE.test(golfOffDate.trim()) && isValidCalendarIsoDate(golfOffDate.trim()))
  const canSave = holesComplete && golfOffDateOk

  function prefillAllPars() {
    setHoles(playerNine.holes.map((h) => h.par))
  }

  function prefillAllBogeys() {
    setHoles(playerNine.holes.map((h) => h.par + 1))
  }

  return (
    <div
      className={styles.scoresModalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (saving || pullSaving) return
        if (pullPhase === 'drawing') return
        if (screen === 'pull') {
          leavePullScreen()
          return
        }
        onClose()
      }}
    >
      <div
        className={styles.scoresModal}
        role="dialog"
        aria-labelledby="scores-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {screen === 'pull' ? (
          <>
            <h2 id="scores-modal-title" className={styles.scoresModalTitle}>
              Pull score for {player.name}
            </h2>
            <p className={styles.scoresModalMeta}>
              Week {selectedWeek} · {scheduledNine} nine · Flight {player.flight}
            </p>
            <h3 className={styles.scoresModalPullFlightHeading}>Scores from Flight {player.flight}</h3>
            <ul className={styles.scoresModalPullPeerList}>
              {flightPeers.map((p) => {
                const r = data.weeklyScores[p.id]?.[String(selectedWeek)]
                const posted = hasCompletePostedHoles(r)
                const g = posted ? grossTotalFromHoles(r) : null
                return (
                  <li key={p.id} className={styles.scoresModalPullPeerRow}>
                    <span>{p.name}</span>
                    <span className={styles.scoresModalPullGross}>{g == null ? '—' : g}</span>
                  </li>
                )
              })}
            </ul>
            {!canPullFromPool ? (
              <p className={styles.scoresModalPullHint}>
                No fully posted rounds in this flight for this week yet. Enter peers&apos; hole scores first, then pull.
              </p>
            ) : null}
            {pullPhase === 'drawing' ? (
              <div className={styles.scoresModalPullDrawing} aria-live="polite">
                <span className={styles.scoresPullSpinner} aria-hidden />
                <span>Drawing…</span>
              </div>
            ) : null}
            {pullPhase === 'result' && drawnPull != null ? (
              <p className={styles.scoresModalPullResult}>
                <span className={styles.scoresModalPullResultLabel}>
                  Pulled gross ({drawnPull.fromName})
                </span>
                <span className={styles.scoresModalPullResultNum}>{drawnPull.gross}</span>
              </p>
            ) : null}
            {pullSaveError ? (
              <p className={styles.scoresModalSaveErr} role="alert">
                {pullSaveError}
              </p>
            ) : null}
            <div className={styles.scoresModalPullActions}>
              {pullPhase !== 'drawing' ? (
                <button
                  type="button"
                  className={styles.btn}
                  disabled={pullSaving}
                  onClick={() => {
                    leavePullScreen()
                  }}
                >
                  Back to scores
                </button>
              ) : (
                <span />
              )}
              {pullPhase === 'pick' ? (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!canPullFromPool || pullBusy}
                  onClick={() => {
                    if (!canPullFromPool || pullBusy) return
                    void (async () => {
                      setPullSaveError(null)
                      setPullPhase('drawing')
                      const ms = 900 + Math.random() * 900
                      await new Promise((r) => setTimeout(r, ms))
                      const pool = [...postedPeersForPull]
                      const pick = pool[Math.floor(Math.random() * pool.length)]!
                      setDrawnPull({ gross: pick.gross, fromName: pick.peer.name })
                      setPullPhase('result')
                    })()
                  }}
                >
                  Pull from posted scores
                </button>
              ) : null}
              {pullPhase === 'result' && drawnPull != null ? (
                <>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={pullSaving || !canPullFromPool}
                    onClick={() => {
                      setPullSaveError(null)
                      setPullPhase('pick')
                      setDrawnPull(null)
                    }}
                  >
                    Draw again
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={pullSaving}
                    onClick={() => {
                      void (async () => {
                        if (drawnPull == null || pullSaving) return
                        setPullSaveError(null)
                        setPullSaving(true)
                        try {
                          const r = await onSavePull({
                            pulledGross: drawnPull.gross,
                            pulledFromPlayerName: drawnPull.fromName,
                          })
                          if (r.ok) onClose()
                          else setPullSaveError(r.message)
                        } finally {
                          setPullSaving(false)
                        }
                      })()
                    }}
                  >
                    {pullSaving ? 'Saving…' : 'Save pull'}
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <h2 id="scores-modal-title" className={styles.scoresModalTitle}>
              {player.name}
            </h2>
            <p className={styles.scoresModalMeta}>
              Week {selectedWeek} · {scheduledNine} nine · {player.isSenior ? 'Gold tees' : 'White tees'}
            </p>
            {existing?.pulledGross != null ? (
              <p className={styles.scoresModalPullNote}>
                This week uses a pulled score
                {existing.pulledFromPlayerName
                  ? ` from ${existing.pulledFromPlayerName}`
                  : ''}{' '}
                (gross {existing.pulledGross}). Enter a full scorecard to replace it.
              </p>
            ) : null}
            <div className={styles.scoresModalHoles}>
              {playerNine.holes.map((h, i) => {
                const holeNo = displayHoleNumberOnNine(scheduledNine, i)
                return (
                  <label key={h.holeNumber} className={styles.scoresModalHoleField}>
                    <span className={styles.scoresModalHoleLabelStack}>
                      <span className={styles.scoresModalHoleNum}>{holeNo}</span>
                      <span className={styles.scoresModalHolePar}>{h.par}</span>
                    </span>
                    <input
                      type="number"
                      className={styles.inputNarrow}
                      min={HOLE_STROKE_MIN}
                      max={HOLE_STROKE_MAX}
                      step={1}
                      disabled={saving}
                      autoFocus={i === 0}
                      value={holes[i] == null ? '' : holes[i]!}
                      aria-label={`Hole ${holeNo}, par ${h.par}, strokes`}
                      onChange={(e) => setHole(i, e.target.value)}
                    />
                  </label>
                )
              })}
            </div>
            <div className={styles.scoresModalPrefillRow}>
              <div className={styles.scoresModalPrefillBtns}>
                <button type="button" className={styles.btn} disabled={saving} onClick={prefillAllPars}>
                  All pars
                </button>
                <button type="button" className={styles.btn} disabled={saving} onClick={prefillAllBogeys}>
                  All bogeys
                </button>
              </div>
              <div className={styles.scoresModalGolfOffRow}>
                <label className={styles.scoresModalGolfOffLabel}>
                  <input
                    type="checkbox"
                    checked={isGolfOff}
                    disabled={saving}
                    onChange={(e) => {
                      const on = e.target.checked
                      setIsGolfOff(on)
                      if (on && !golfOffDate.trim()) setGolfOffDate(localIsoDate())
                      if (!on) setGolfOffDate('')
                    }}
                  />
                  <span>Golf-off</span>
                </label>
                {isGolfOff ? (
                  <label className={styles.scoresModalGolfOffDate}>
                    <span className={styles.scoresModalGolfOffDateLabel}>Day played</span>
                    <input
                      type="date"
                      className={styles.scoresModalDateInput}
                      disabled={saving}
                      value={golfOffDate}
                      onChange={(e) => setGolfOffDate(e.target.value)}
                      required
                    />
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                className={`${styles.btn} ${styles.scoresModalPullOpenBtn}`}
                disabled={saving}
                onClick={() => {
                  setScreen('pull')
                  setPullPhase('pick')
                  setDrawnPull(null)
                  setPullSaveError(null)
                }}
              >
                Pull
              </button>
            </div>
            {saveError ? (
              <p className={styles.scoresModalSaveErr} role="alert">
                {saveError}
              </p>
            ) : null}
            <div className={styles.scoresModalActions}>
              <button type="button" className={styles.btn} disabled={saving} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!canSave || saving}
                title={
                  !holesComplete
                    ? 'Enter a stroke count for every hole (1–20).'
                    : !golfOffDateOk
                      ? 'Choose the calendar day this golf-off round was played.'
                      : undefined
                }
                onClick={() => {
                  void (async () => {
                    if (!holesRowComplete(holes) || !golfOffDateOk || saving) return
                    setSaveError(null)
                    setSaving(true)
                    try {
                      const played =
                        isGolfOff && golfOffDate.trim() && isValidCalendarIsoDate(golfOffDate.trim())
                          ? golfOffDate.trim()
                          : null
                      const r = await onSave(ensureNineHoles(holes), played)
                      if (r.ok) onClose()
                      else setSaveError(r.message)
                    } finally {
                      setSaving(false)
                    }
                  })()
                }}
              >
                {saving ? 'Saving…' : 'Save scores'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ScoresEditor({
  data,
  selectedWeek,
  onSelectWeek,
  persistLeague,
  setSaveMsg,
}: {
  data: LeagueData
  selectedWeek: number
  onSelectWeek: (week: number) => void
  persistLeague: (doc: LeagueData) => Promise<{ ok: true } | { ok: false; message: string }>
  setSaveMsg: (msg: string | null) => void
}) {
  const sched = data.schedule.find((s) => s.leagueWeekNumber === selectedWeek)
  const weekKeys = [...new Set(data.schedule.map((s) => s.leagueWeekNumber))].sort((a, b) => a - b)

  const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name))

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  const scheduledNine = sched?.nine
  const whiteHoles =
    scheduledNine != null ? data.course.nonSenior[scheduledNine].holes : []
  const goldHoles = scheduledNine != null ? data.course.senior[scheduledNine].holes : []

  const flightPtsByFlight = useMemo(
    () =>
      ({
        A: flightPointsForWeek(data, 'A', selectedWeek),
        B: flightPointsForWeek(data, 'B', selectedWeek),
        C: flightPointsForWeek(data, 'C', selectedWeek),
        D: flightPointsForWeek(data, 'D', selectedWeek),
      }) as const,
    [data, selectedWeek],
  )

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <label className={styles.inline}>
          Week
          <select
            className={styles.weekSelect}
            value={selectedWeek}
            onChange={(e) => onSelectWeek(Number(e.target.value))}
          >
            {weekKeys.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {data.schedule.find((s) => s.leagueWeekNumber === w)
                  ? ` · ${data.schedule.find((s) => s.leagueWeekNumber === w)?.date}`
                  : ''}
              </option>
            ))}
          </select>
        </label>
        {sched ? (
          <span className={styles.help}>
            League night: <strong>{sched.nine}</strong> nine
          </span>
        ) : null}
      </div>
      {!sched || !scheduledNine ? (
        <p className={styles.warnBox}>No schedule row matches this week number.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th rowSpan={2}>Player</th>
                <th rowSpan={2}>Fl</th>
                {whiteHoles.map((_, i) => (
                  <th key={i} className={styles.scoresHoleHead}>
                    {displayHoleNumberOnNine(scheduledNine, i)}
                  </th>
                ))}
                <th rowSpan={2}>Gross</th>
                <th rowSpan={2}>Net</th>
                <th rowSpan={2}>Hcp idx</th>
                <th rowSpan={2}>FLPTS</th>
                <th rowSpan={2} aria-label="Actions" />
              </tr>
              <tr>
                {whiteHoles.map((_, i) => {
                  const wp = whiteHoles[i]?.par
                  const gp = goldHoles[i]?.par
                  return (
                    <th key={i} className={styles.scoresParHead}>
                      {wp}/<span className={styles.scoresParHeadGold}>{gp}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const row = data.weeklyScores[p.id]?.[String(selectedWeek)]
                const nine = getNineForWeek(data.course, scheduledNine, p)
                const gross = grossTotalFromHoles(row)
                const handicapHistory = totalsBeforeWeek(data, p, selectedWeek)
                const idx =
                  gross != null
                    ? computeHandicapIndex({
                        priorSeasonScores: p.priorSeasonScores,
                        currentSeasonTotals: handicapHistory,
                        asOfLeagueWeek: selectedWeek,
                      })
                    : null
                const net = netNineFromGrossAndIndex(gross, idx)
                const flpts =
                  gross != null && !row?.pulledGross
                    ? (flightPtsByFlight[p.flight].get(p.id) ?? 0)
                    : null
                return (
                  <tr key={p.id}>
                    <td>
                      <div className={styles.scoresPlayerCell}>
                        <span>{p.name}</span>
                        {row?.pulledGross != null ? (
                          <span className={styles.scoresPulledTag} title="Absent — pulled gross from flight">
                            Pulled · gross {row.pulledGross}
                            {row.pulledFromPlayerName ? ` · ${row.pulledFromPlayerName}` : ''}
                          </span>
                        ) : null}
                        {row?.golfOffPlayedDate ? (
                          <span className={styles.scoresGolfOffTag} title="Golf-off round">
                            Golf-off · {formatIsoDateForDisplay(row.golfOffPlayedDate)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={styles.num}>{p.flight}</td>
                    {nine.holes.map((h, i) => {
                      const stroke = row?.holes[i] ?? null
                      const badge = holeScoreBadgeClassName(stroke, h.par)
                      return (
                        <td key={h.holeNumber} className={styles.num}>
                          {stroke == null ? (
                            '—'
                          ) : badge ? (
                            <span className={badge}>{stroke}</span>
                          ) : (
                            stroke
                          )}
                        </td>
                      )
                    })}
                    <td className={styles.num}>{gross == null ? '—' : gross}</td>
                    <td className={styles.num}>{net == null ? '—' : net}</td>
                    <td className={styles.num}>{formatHandicapIndex(idx)}</td>
                    <td className={styles.num}>{flpts == null ? '—' : formatStandingPoints(flpts)}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.scoresEditLink}
                        onClick={() => setEditingPlayer(p)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingPlayer && sched && scheduledNine ? (
        <ScoreEntryModal
          key={`${editingPlayer.id}-${selectedWeek}`}
          data={data}
          player={editingPlayer}
          selectedWeek={selectedWeek}
          scheduledNine={scheduledNine}
          onSave={async (holes, golfOffPlayedDate) => {
            setSaveMsg(null)
            const next = commitWeekScores(data, editingPlayer.id, selectedWeek, holes, golfOffPlayedDate)
            const r = await persistLeague(next)
            if (r.ok) setSaveMsg('Saved.')
            else setSaveMsg(r.message)
            return r
          }}
          onSavePull={async ({ pulledGross, pulledFromPlayerName }) => {
            setSaveMsg(null)
            const next = commitPulledWeek(
              data,
              editingPlayer.id,
              selectedWeek,
              pulledGross,
              pulledFromPlayerName,
            )
            const r = await persistLeague(next)
            if (r.ok) setSaveMsg('Saved pulled score.')
            else setSaveMsg(r.message)
            return r
          }}
          onClose={() => setEditingPlayer(null)}
        />
      ) : null}
    </div>
  )
}
