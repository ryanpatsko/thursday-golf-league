import { useMemo, useState } from 'react'
import type { LeagueData, Player } from './data/leagueTypes'
import { weekNumbersInOrder, weekSelectLabel } from './lib/scheduleWeek'
import PlayerSeasonHistoryModal, { type PlayerModalTab } from './PlayerSeasonHistoryModal.tsx'
import WeeklyGolferReport from './WeeklyGolferReport.tsx'
import styles from './Home.module.css'

export default function RecapsTab({
  data,
  selectedWeek,
  onSelectWeek,
  viewPlayerId,
  onViewPlayerIdChange,
}: {
  data: LeagueData
  selectedWeek: number
  onSelectWeek: (week: number) => void
  viewPlayerId: string | null
  onViewPlayerIdChange: (playerId: string | null) => void
}) {
  const weeks = useMemo(() => weekNumbersInOrder(data), [data])
  const playersSorted = useMemo(
    () => [...data.players].sort((a, b) => a.name.localeCompare(b.name)),
    [data.players],
  )
  const viewPlayer = useMemo(
    () => (viewPlayerId ? data.players.find((p) => p.id === viewPlayerId) ?? null : null),
    [data.players, viewPlayerId],
  )

  const [historyModal, setHistoryModal] = useState<{
    player: Player
    tab: PlayerModalTab
  } | null>(null)

  function openPlayerModal(player: Player, tab: PlayerModalTab = 'scores') {
    setHistoryModal({ player, tab })
  }

  return (
    <div className={styles.standingsRoot}>
      <div className={styles.standingsToolbar}>
        <label className={styles.weekLabel}>
          Recap for
          <select
            className={styles.weekSelect}
            value={selectedWeek}
            onChange={(e) => onSelectWeek(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekSelectLabel(data, w)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.weekLabel}>
          Player
          <select
            className={styles.weekSelect}
            value={viewPlayerId ?? ''}
            onChange={(e) => onViewPlayerIdChange(e.target.value || null)}
          >
            <option value="">Select a player…</option>
            {playersSorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {viewPlayer ? (
        <WeeklyGolferReport
          data={data}
          player={viewPlayer}
          week={selectedWeek}
          onOpenPlayerModal={(tab) => openPlayerModal(viewPlayer, tab)}
        />
      ) : (
        <p className={styles.placeholder}>Select a player to view their weekly recap.</p>
      )}

      {historyModal ? (
        <PlayerSeasonHistoryModal
          key={`${historyModal.player.id}-${historyModal.tab}`}
          data={data}
          player={historyModal.player}
          initialTab={historyModal.tab}
          onClose={() => setHistoryModal(null)}
        />
      ) : null}
    </div>
  )
}
