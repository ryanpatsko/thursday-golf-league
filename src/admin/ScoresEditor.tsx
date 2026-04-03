import { useEffect, useMemo, useState } from 'react'
import type { LeagueData, Player } from '../data/leagueTypes'
import {
  computeHandicapIndex,
  formatHandicapIndex,
  getNineForWeek,
  grossTotalFromHoles,
  handicapTotalFromHoles,
  netNineFromGrossAndIndex,
} from '../lib/handicap'
import { holeScoreBadgeClassName } from '../lib/holeScoreDisplay'
import { displayHoleNumberOnNine } from '../lib/scheduleWeek'
import styles from './editors.module.css'

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
    byWeek[String(week)] = { holes: [...holes] }
    nextScores[playerId] = byWeek
  }
  return { ...data, weeklyScores: nextScores }
}

function ScoreEntryModal({
  data,
  player,
  selectedWeek,
  scheduledNine,
  onSave,
  onClose,
}: {
  data: LeagueData
  player: Player
  selectedWeek: number
  scheduledNine: 'front' | 'back'
  onSave: (holes: (number | null)[]) => Promise<{ ok: true } | { ok: false; message: string }>
  onClose: () => void
}) {
  const existing = data.weeklyScores[player.id]?.[String(selectedWeek)]
  const [holes, setHoles] = useState<(number | null)[]>(() => ensureNineHoles(existing?.holes))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const playerNine = getNineForWeek(data.course, scheduledNine, player)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

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
        if (saving) return
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={styles.scoresModal}
        role="dialog"
        aria-labelledby="scores-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="scores-modal-title" className={styles.scoresModalTitle}>
          {player.name}
        </h2>
        <p className={styles.scoresModalMeta}>
          Week {selectedWeek} · {scheduledNine} nine · {player.isSenior ? 'Gold tees' : 'White tees'}
        </p>
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
          <button type="button" className={styles.btn} disabled={saving} onClick={prefillAllPars}>
            All pars
          </button>
          <button type="button" className={styles.btn} disabled={saving} onClick={prefillAllBogeys}>
            All bogeys
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
            disabled={!holesComplete || saving}
            title={!holesComplete ? 'Enter a stroke count for every hole (1–20).' : undefined}
            onClick={() => {
              void (async () => {
                if (!holesRowComplete(holes) || saving) return
                setSaveError(null)
                setSaving(true)
                try {
                  const r = await onSave(ensureNineHoles(holes))
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
                const idx = computeHandicapIndex({
                  priorSeasonScores: p.priorSeasonScores,
                  currentSeasonTotals: handicapHistory,
                  asOfLeagueWeek: selectedWeek,
                })
                const net = netNineFromGrossAndIndex(gross, idx)
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
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
          key={editingPlayer.id}
          data={data}
          player={editingPlayer}
          selectedWeek={selectedWeek}
          scheduledNine={scheduledNine}
          onSave={async (holes) => {
            setSaveMsg(null)
            const next = commitWeekScores(data, editingPlayer.id, selectedWeek, holes)
            const r = await persistLeague(next)
            if (r.ok) setSaveMsg('Saved.')
            else setSaveMsg(r.message)
            return r
          }}
          onClose={() => setEditingPlayer(null)}
        />
      ) : null}
    </div>
  )
}
