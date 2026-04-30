import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useState,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FaGolfBallTee } from 'react-icons/fa6'
import CourseEditor from './admin/CourseEditor.tsx'
import RostersEditor from './admin/RostersEditor.tsx'
import ScheduleEditor from './admin/ScheduleEditor.tsx'
import ScoresEditor from './admin/ScoresEditor.tsx'
import TeeTimesEditor from './admin/TeeTimesEditor.tsx'
import FourManEditor from './admin/FourManEditor.tsx'
import type { LeagueData } from './data/leagueTypes.ts'
import { defaultLeagueWeekNumber } from './lib/scheduleWeek.ts'
import {
  adminLogin,
  adminVerifySession,
  clearStoredSessionToken,
  getStoredSessionToken,
  isAdminAuthConfigured,
} from './lib/adminAuth.ts'
import { describeLeagueSaveBlocker } from './lib/leagueSaveValidation.ts'
import { loadLeagueDataForAdmin, saveLeagueData } from './lib/leagueApi.ts'
import styles from './Admin.module.css'

type GateState = 'checking' | 'locked' | 'unlocked'

const ADMIN_TAB_IDS = ['course', 'rosters', 'fourMan', 'schedule', 'scores', 'teeTimes'] as const
type AdminTabId = (typeof ADMIN_TAB_IDS)[number]

function isAdminTabId(value: string | null): value is AdminTabId {
  return value !== null && (ADMIN_TAB_IDS as readonly string[]).includes(value)
}

const TAB_LABELS: Record<AdminTabId, string> = {
  course: 'Course',
  rosters: 'Rosters',
  fourMan: 'Four Man',
  schedule: 'Schedule',
  scores: 'Scores',
  teeTimes: 'Tee Times',
}

function AdminDashboard({
  league,
  onChange,
  selectedWeek,
  onSelectWeek,
  persistLeague,
  setSaveMsg,
}: {
  league: LeagueData
  onChange: (next: LeagueData) => void
  selectedWeek: number
  onSelectWeek: (w: number) => void
  persistLeague: (doc: LeagueData) => Promise<{ ok: true } | { ok: false; message: string }>
  setSaveMsg: (msg: string | null) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: AdminTabId = isAdminTabId(tabParam) ? tabParam : 'scores'

  function selectTab(id: AdminTabId) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', id)
        return next
      },
      { replace: true },
    )
  }

  function onTabKeyDown(id: AdminTabId, e: KeyboardEvent<HTMLButtonElement>) {
    const i = ADMIN_TAB_IDS.indexOf(id)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = ADMIN_TAB_IDS[(i + 1) % ADMIN_TAB_IDS.length]!
      selectTab(next)
      queueMicrotask(() => document.getElementById(`admin-tab-${next}`)?.focus())
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = ADMIN_TAB_IDS[(i - 1 + ADMIN_TAB_IDS.length) % ADMIN_TAB_IDS.length]!
      selectTab(next)
      queueMicrotask(() => document.getElementById(`admin-tab-${next}`)?.focus())
    }
  }

  return (
    <section aria-label="Admin dashboard">
      <div className={styles.tabShell}>
        <div className={styles.tabList} role="tablist" aria-label="Admin sections">
          {ADMIN_TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`admin-tab-${id}`}
              aria-selected={activeTab === id}
              aria-controls={`admin-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
              onClick={() => selectTab(id)}
              onKeyDown={(e) => onTabKeyDown(id, e)}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>

        {ADMIN_TAB_IDS.map((id) => (
          <div
            key={id}
            id={`admin-panel-${id}`}
            role="tabpanel"
            aria-labelledby={`admin-tab-${id}`}
            hidden={activeTab !== id}
            className={styles.tabPanel}
          >
            {id === 'course' && activeTab === 'course' ? (
              <CourseEditor data={league} onChange={onChange} />
            ) : null}
            {id === 'rosters' && activeTab === 'rosters' ? (
              <RostersEditor data={league} onChange={onChange} />
            ) : null}
            {id === 'fourMan' && activeTab === 'fourMan' ? (
              <FourManEditor data={league} onChange={onChange} />
            ) : null}
            {id === 'schedule' && activeTab === 'schedule' ? (
              <ScheduleEditor data={league} onChange={onChange} persistLeague={persistLeague} setSaveMsg={setSaveMsg} />
            ) : null}
            {id === 'scores' && activeTab === 'scores' ? (
              <ScoresEditor
                data={league}
                selectedWeek={selectedWeek}
                onSelectWeek={onSelectWeek}
                persistLeague={persistLeague}
                setSaveMsg={setSaveMsg}
              />
            ) : null}
            {id === 'teeTimes' && activeTab === 'teeTimes' ? (
              <TeeTimesEditor
                data={league}
                onChange={onChange}
                persistLeague={persistLeague}
                setSaveMsg={setSaveMsg}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Admin() {
  const passwordFieldId = useId()
  const [gate, setGate] = useState<GateState>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadMsg, setLoadMsg] = useState<string | null>(null)
  const [league, setLeague] = useState<LeagueData | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState(1)

  const configured = isAdminAuthConfigured()

  const verifyStored = useCallback(async () => {
    if (!configured) {
      setGate('locked')
      return
    }
    const token = getStoredSessionToken()
    if (!token) {
      setGate('locked')
      return
    }
    const ok = await adminVerifySession(token)
    if (ok) setGate('unlocked')
    else {
      clearStoredSessionToken()
      setGate('locked')
    }
  }, [configured])

  useEffect(() => {
    void verifyStored()
  }, [verifyStored])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, fromRemote } = await loadLeagueDataForAdmin()
      if (cancelled) return
      setLeague(data)
      setLoadMsg(
        fromRemote
          ? null
          : 'Could not read league-data.json from S3 — showing built-in seed roster until the bucket is wired up.',
      )
      setSelectedWeek(defaultLeagueWeekNumber(data))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await adminLogin(password)
      if (result.ok) {
        setPassword('')
        setGate('unlocked')
      } else {
        setError(result.message)
      }
    } finally {
      setBusy(false)
    }
  }

  function onSignOut() {
    clearStoredSessionToken()
    setGate('locked')
    setPassword('')
    setError(null)
  }

  const persistLeague = useCallback(
    async (doc: LeagueData): Promise<{ ok: true } | { ok: false; message: string }> => {
      const token = getStoredSessionToken()
      if (!token) return { ok: false, message: 'Not signed in.' }
      const blocker = describeLeagueSaveBlocker(doc)
      if (blocker) return { ok: false, message: blocker }
      const next: LeagueData = { ...doc, version: doc.version + 1 }
      const result = await saveLeagueData(token, next)
      if (result.ok) {
        setLeague(next)
        return { ok: true }
      }
      return { ok: false, message: result.message }
    },
    [],
  )

  async function onSave() {
    setSaveMsg(null)
    if (!league) return
    setBusy(true)
    try {
      const r = await persistLeague(league)
      setSaveMsg(r.ok ? 'Saved.' : r.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerBrand}>
              <FaGolfBallTee className={styles.headerIcon} aria-hidden />
              <div className={styles.headerTitles}>
                <p className={styles.kicker}>Thursday Night Golf League</p>
                <h1 className={styles.title}>Admin Dashboard</h1>
              </div>
            </div>
            <nav className={styles.headerNav} aria-label="Admin actions">
              {gate === 'unlocked' ? (
                <button type="button" className={styles.headerLink} onClick={onSignOut}>
                  Sign out
                </button>
              ) : null}
              <Link className={styles.headerLink} to="/">
                Public site
              </Link>
            </nav>
          </div>
          {gate === 'unlocked' && league ? (
            <div className={styles.toolbar}>
              <button type="button" className={styles.saveBtn} disabled={busy} onClick={() => void onSave()}>
                Save Values
              </button>
              {saveMsg ? (
                <span className={saveMsg.startsWith('Saved') ? styles.statusOk : styles.statusErr}>
                  {saveMsg}
                </span>
              ) : null}
            </div>
          ) : null}
          {loadMsg ? <p className={styles.statusErr}>{loadMsg}</p> : null}
        </header>

        {gate === 'checking' ? (
          <p className={`${styles.muted} ${styles.panel}`} role="status">
            Checking session…
          </p>
        ) : gate === 'locked' ? (
          <section className={styles.panel} aria-labelledby="admin-sign-in-heading">
            <h2 id="admin-sign-in-heading" className={styles.panelTitle}>
              Sign in
            </h2>
            {!configured ? (
              <p className={styles.warn}>
                Set <code className={styles.code}>VITE_ADMIN_AUTH_URL</code> to your Lambda Function URL
                origin in Amplify and in <code className={styles.code}>.env.local</code> for local dev.
              </p>
            ) : (
              <p className={styles.muted}>
                Session lasts 24 hours on this device. Password is verified only on the server.
              </p>
            )}
            <form className={styles.form} onSubmit={onSubmit}>
              <label className={styles.label} htmlFor={passwordFieldId}>
                Password
              </label>
              <input
                id={passwordFieldId}
                className={styles.input}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={!configured || busy}
                required
              />
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              <button className={styles.submit} type="submit" disabled={!configured || busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : league ? (
          <div className={styles.panel}>
            <AdminDashboard
              league={league}
              onChange={setLeague}
              selectedWeek={selectedWeek}
              onSelectWeek={setSelectedWeek}
              persistLeague={persistLeague}
              setSaveMsg={setSaveMsg}
            />
          </div>
        ) : (
          <p className={styles.panel}>Loading league data…</p>
        )}
      </div>
    </div>
  )
}
