import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FaGolfBallTee } from 'react-icons/fa6'
import type { LeagueData } from './data/leagueTypes'
import { loadLeagueDataForPublic } from './lib/leagueApi'
import { defaultLeagueWeekNumber, resolveLeagueWeekFromParam } from './lib/scheduleWeek'
import CourseStatsTab from './CourseStatsTab.tsx'
import GolfOffsTab from './GolfOffsTab.tsx'
import GreeniesTab from './GreeniesTab.tsx'
import HandicapsTab from './HandicapsTab.tsx'
import RecapsTab from './RecapsTab.tsx'
import StandingsTab from './StandingsTab.tsx'
import WeeklyScoresTab from './WeeklyScoresTab.tsx'
import FourManTab from './FourManTab.tsx'
import PlayoffsTab from './PlayoffsTab.tsx'
import styles from './Home.module.css'

const HOME_TABS = [
  'standings',
  'playoffs',
  'weekly',
  'four',
  'handicaps',
  'recaps',
  'golfOffs',
  'greenies',
  'courseStats',
] as const
type HomeTabId = (typeof HOME_TABS)[number]

const TAB_LABELS: Record<HomeTabId, string> = {
  standings: 'Standings',
  playoffs: 'Playoffs',
  weekly: 'Weekly scores',
  handicaps: 'Handicaps',
  recaps: 'Recaps',
  golfOffs: 'Golf-offs',
  greenies: 'Greenies',
  courseStats: 'Course Stats',
  four: 'Four Man',
}

function resolveViewPlayerId(data: LeagueData, view: string | null): string | null {
  if (!view) return null
  return data.players.some((p) => p.id === view) ? view : null
}

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<LeagueData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<HomeTabId>('standings')
  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [recapPlayerId, setRecapPlayerId] = useState<string | null>(null)

  function setSelectedWeekAndUrl(week: number) {
    setSelectedWeek(week)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('week', String(week))
        return next
      },
      { replace: true },
    )
  }

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
        const weekFromUrl = resolveLeagueWeekFromParam(d, searchParams.get('week'))
        setSelectedWeek(weekFromUrl ?? defaultLeagueWeekNumber(d))
        const viewFromUrl = resolveViewPlayerId(d, searchParams.get('view'))
        if (viewFromUrl) {
          setRecapPlayerId(viewFromUrl)
          setActiveTab('recaps')
        }
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
    if (!data) return
    const weekFromUrl = resolveLeagueWeekFromParam(data, searchParams.get('week'))
    if (weekFromUrl != null) {
      setSelectedWeek(weekFromUrl)
    }
  }, [data, searchParams])

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
            <h1 className={styles.title}>
              <a href="/" className={styles.titleLink}>
                Thursday Night Golf League
              </a>
            </h1>
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
                  {id === 'playoffs' ? (
                    <span className={styles.tabNewBadge}>New</span>
                  ) : null}
                </button>
              ))}
            </div>

            {activeTab === 'standings' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <StandingsTab
                  data={data}
                  selectedWeek={selectedWeek}
                  onSelectWeek={setSelectedWeekAndUrl}
                />
              </div>
            ) : null}
            {activeTab === 'playoffs' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <PlayoffsTab data={data} />
              </div>
            ) : null}
            {activeTab === 'weekly' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <WeeklyScoresTab data={data} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeekAndUrl} />
              </div>
            ) : null}
            {activeTab === 'handicaps' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <HandicapsTab data={data} asOfWeek={selectedWeek} onAsOfWeekChange={setSelectedWeekAndUrl} />
              </div>
            ) : null}
            {activeTab === 'recaps' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <RecapsTab
                  data={data}
                  selectedWeek={selectedWeek}
                  onSelectWeek={setSelectedWeekAndUrl}
                  viewPlayerId={recapPlayerId}
                  onViewPlayerIdChange={setRecapPlayerId}
                />
              </div>
            ) : null}
            {activeTab === 'golfOffs' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <GolfOffsTab data={data} />
              </div>
            ) : null}
            {activeTab === 'greenies' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <GreeniesTab data={data} />
              </div>
            ) : null}
            {activeTab === 'courseStats' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <CourseStatsTab data={data} />
              </div>
            ) : null}
            {activeTab === 'four' ? (
              <div role="tabpanel" className={styles.tabPanel}>
                <FourManTab data={data} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeekAndUrl} />
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
