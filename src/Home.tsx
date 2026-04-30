import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaGolfBallTee } from 'react-icons/fa6'
import type { LeagueData } from './data/leagueTypes'
import { loadLeagueDataForPublic } from './lib/leagueApi'
import { defaultLeagueWeekNumber } from './lib/scheduleWeek'
import CourseStatsTab from './CourseStatsTab.tsx'
import GolfOffsTab from './GolfOffsTab.tsx'
import HandicapsTab from './HandicapsTab.tsx'
import StandingsTab from './StandingsTab.tsx'
import WeeklyScoresTab from './WeeklyScoresTab.tsx'
import FourManTab from './FourManTab.tsx'
import styles from './Home.module.css'

const HOME_TABS = ['standings', 'weekly', 'four', 'handicaps', 'golfOffs', 'courseStats'] as const
type HomeTabId = (typeof HOME_TABS)[number]

const TAB_LABELS: Record<HomeTabId, string> = {
  standings: 'Standings',
  weekly: 'Weekly scores',
  handicaps: 'Handicaps',
  golfOffs: 'Golf-offs',
  courseStats: 'Course Stats',
  four: 'Four Man',
}

export default function Home() {
  const [data, setData] = useState<LeagueData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<HomeTabId>('standings')
  const [selectedWeek, setSelectedWeek] = useState<number>(1)

  const refreshData = useCallback(() => {
    loadLeagueDataForPublic()
      .then((d) => {
        setData(d)
        setLoadError(null)
      })
      .catch(() => {
        /* keep last loaded data on background refresh failure */
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadLeagueDataForPublic()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setSelectedWeek(defaultLeagueWeekNumber(d))
        setLoadError(null)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError('Could not load league data.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshData()
    }
    document.addEventListener('visibilitychange', onVis)
    const id = window.setInterval(refreshData, 45_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(id)
    }
  }, [refreshData])

  return (
    <>
      <div className={styles.pageBackdrop} aria-hidden />
      <div className={styles.page}>
      <div className={styles.accentBar} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <FaGolfBallTee className={styles.headerIcon} aria-hidden />
          <div className={styles.headerText}>
            <p className={styles.kicker}>{`Thursday nights · ${data?.course.name ?? 'Lakevue North'}`}</p>
            <h1 className={styles.title}>Thursday Night Golf League</h1>
          </div>
        </div>
      </header>

      {loadError ? <p className={styles.loadError}>{loadError}</p> : null}

      {data ? (
        <>
          <div className={styles.tabShell}>
            <div className={styles.tabList} role="tablist" aria-label="Site sections">
              {HOME_TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  tabIndex={activeTab === id ? 0 : -1}
                  className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(id)}
                >
                  {TAB_LABELS[id]}
                </button>
              ))}
            </div>

            {activeTab === 'standings' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <StandingsTab data={data} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />
              </div>
            ) : null}
            {activeTab === 'weekly' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <WeeklyScoresTab data={data} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />
              </div>
            ) : null}
            {activeTab === 'handicaps' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <HandicapsTab data={data} asOfWeek={selectedWeek} onAsOfWeekChange={setSelectedWeek} />
              </div>
            ) : null}
            {activeTab === 'golfOffs' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <GolfOffsTab data={data} />
              </div>
            ) : null}
            {activeTab === 'courseStats' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <CourseStatsTab data={data} />
              </div>
            ) : null}
            {activeTab === 'four' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <FourManTab data={data} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />
              </div>
            ) : null}
          </div>
        </>
      ) : !loadError ? (
        <p className={styles.loading}>Loading league…</p>
      ) : null}

      <footer className={styles.footer}>
        <span className={styles.footerMark} aria-hidden />
        <Link className={styles.adminLink} to="/admin">
          Open admin dashboard
        </Link>
      </footer>
      </div>
    </>
  )
}
