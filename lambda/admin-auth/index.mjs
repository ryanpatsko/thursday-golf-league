/**
 * Lambda Function URL (auth NONE): JWT login/verify + PUT league-data → S3.
 *
 * Env: ADMIN_PASSWORD, ADMIN_SESSION_SECRET, CMS_S3_BUCKET (e.g. thursday-golf-league)
 * Optional: CMS_S3_LEAGUE_KEY (default league-data.json)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const SESSION_HOURS = 24
const JWT_SUB = 'golf-league-admin'

const FLIGHTS = new Set(['A', 'B', 'C', 'D'])
const NINES = new Set(['front', 'back'])
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const s3 = new S3Client({})

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}

function signJwt(payload, secret) {
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' })
  const payloadPart = base64urlJson(payload)
  const data = `${header}.${payloadPart}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

function verifyJwt(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  if (!h || !p || !s) return null
  const data = `${h}.${p}`
  const expected = createHmac('sha256', secret).update(data).digest('base64url')
  const sigBuf = Buffer.from(s, 'base64url')
  const expBuf = Buffer.from(expected, 'base64url')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
    if (payload.sub !== JWT_SUB) return null
    return payload
  } catch {
    return null
  }
}

function safeEqualStr(a, b) {
  try {
    const ba = Buffer.from(String(a), 'utf8')
    const bb = Buffer.from(String(b), 'utf8')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

function getPath(event) {
  const raw = event.rawPath ?? event.requestContext?.http?.path ?? '/'
  return raw.split('?')[0] ?? '/'
}

function getMethod(event) {
  return event.requestContext?.http?.method ?? event.httpMethod ?? 'GET'
}

function headerLookup(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && typeof v === 'string') return v
  }
  return undefined
}

function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(bodyObj),
  }
}

function parseBody(event) {
  if (!event.body) return ''
  let raw = event.body
  if (event.isBase64Encoded) {
    raw = Buffer.from(raw, 'base64').toString('utf8')
  }
  return raw
}

function bearerToken(event) {
  const auth = headerLookup(event.headers, 'Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

/** @param {unknown} h */
function validateHole(h) {
  if (!h || typeof h !== 'object') return false
  if (typeof h.holeNumber !== 'number' || h.holeNumber < 1 || h.holeNumber > 9) return false
  if (typeof h.par !== 'number' || h.par < 3 || h.par > 6) return false
  if (typeof h.yardage !== 'number' || h.yardage < 0 || h.yardage > 700) return false
  if (typeof h.strokeIndex !== 'number' || h.strokeIndex < 1 || h.strokeIndex > 18) return false
  return true
}

/** @param {unknown} side */
function validateCourseSide(side) {
  if (!side || typeof side !== 'object') return false
  if (typeof side.label !== 'string' || side.label.length > 80) return false
  if (!Array.isArray(side.holes) || side.holes.length !== 9) return false
  return side.holes.every(validateHole)
}

/** @param {unknown} c */
function validateCourse(c) {
  if (!c || typeof c !== 'object') return false
  if (typeof c.name !== 'string' || c.name.length < 1 || c.name.length > 200) return false
  if (!c.nonSenior || !c.senior) return false
  return (
    validateCourseSide(c.nonSenior.front) &&
    validateCourseSide(c.nonSenior.back) &&
    validateCourseSide(c.senior.front) &&
    validateCourseSide(c.senior.back)
  )
}

/** @param {unknown} p */
function validatePlayer(p) {
  if (!p || typeof p !== 'object') return false
  if (typeof p.id !== 'string' || p.id.length > 80 || !ID_RE.test(p.id)) return false
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (name.length < 1 || name.length > 120) return false
  if (!FLIGHTS.has(p.flight)) return false
  if (typeof p.teamId !== 'string' || p.teamId.length > 80 || !ID_RE.test(p.teamId)) return false
  if (typeof p.isSenior !== 'boolean') return false
  if (!Array.isArray(p.priorSeasonScores)) return false
  if (p.priorSeasonScores.length > 20) return false
  for (const s of p.priorSeasonScores) {
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 20 || s > 120) return false
  }
  if (p.handicapOverride != null) {
    const ho = p.handicapOverride
    if (typeof ho !== 'object' || ho === null) return false
    if (typeof ho.active !== 'boolean') return false
    if (typeof ho.value !== 'number' || !Number.isFinite(ho.value)) return false
    if (ho.active && (ho.value < -10 || ho.value > 60)) return false
  }
  return true
}

/** @param {unknown} t */
function validateTeam(t) {
  if (!t || typeof t !== 'object') return false
  if (typeof t.id !== 'string' || t.id.length > 80 || !ID_RE.test(t.id)) return false
  const name = typeof t.name === 'string' ? t.name.trim() : ''
  if (name.length < 1 || name.length > 120) return false
  if (!Array.isArray(t.playerIds) || t.playerIds.length !== 4) return false
  for (const pid of t.playerIds) {
    if (typeof pid !== 'string' || pid.length < 1 || pid.length > 80 || !ID_RE.test(pid)) return false
  }
  return true
}

/** @param {unknown} row */
function validateScheduleRow(row) {
  if (!row || typeof row !== 'object') return false
  if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return false
  if (!NINES.has(row.nine)) return false
  if (row.rainOut === true) {
    // Rain-out rows must have leagueWeekNumber === 0
    if (row.leagueWeekNumber !== 0) return false
  } else {
    if (row.rainOut !== undefined && row.rainOut !== false) return false
    if (typeof row.leagueWeekNumber !== 'number' || row.leagueWeekNumber < 1 || row.leagueWeekNumber > 99)
      return false
  }
  if (row.label !== undefined) {
    if (typeof row.label !== 'string' || row.label.length > 120) return false
  }
  return true
}

/** @param {unknown} scores */
function validateWeeklyScores(scores) {
  if (!scores || typeof scores !== 'object') return false
  const entries = Object.entries(scores)
  if (entries.length > 64) return false
  for (const [playerId, byWeek] of entries) {
    if (typeof playerId !== 'string' || playerId.length > 80 || !ID_RE.test(playerId)) return false
    if (!byWeek || typeof byWeek !== 'object') return false
    const wk = Object.entries(byWeek)
    if (wk.length > 30) return false
    for (const [weekKey, row] of wk) {
      // Accept ISO date keys (new format: "2026-04-23") or legacy week-number keys ("1"–"99")
      if (typeof weekKey !== 'string') return false
      const isDateKey = /^\d{4}-\d{2}-\d{2}$/.test(weekKey)
      const isWeekKey = /^\d{1,2}$/.test(weekKey)
      if (!isDateKey && !isWeekKey) return false
      if (isWeekKey) {
        const n = Number(weekKey)
        if (n < 1 || n > 99) return false
      }
      if (!row || typeof row !== 'object') return false
      const rowKeys = Object.keys(row)
      for (const rk of rowKeys) {
        if (
          rk !== 'holes' &&
          rk !== 'golfOffPlayedDate' &&
          rk !== 'pulledGross' &&
          rk !== 'pulledNet' &&
          rk !== 'pulledFromPlayerName'
        )
          return false
      }
      if (!Array.isArray(row.holes)) return false
      if (row.holes.length !== 9) return false
      for (const s of row.holes) {
        if (s === null) continue
        if (typeof s !== 'number' || !Number.isFinite(s) || s < 1 || s > 20) return false
      }
      if (row.golfOffPlayedDate != null) {
        if (typeof row.golfOffPlayedDate !== 'string') return false
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.golfOffPlayedDate)) return false
      }
      if (row.pulledNet != null) {
        if (typeof row.pulledNet !== 'number' || !Number.isFinite(row.pulledNet)) return false
        if (row.pulledNet < 10 || row.pulledNet > 90) return false
        if (row.golfOffPlayedDate != null) return false
        if (row.pulledGross != null) return false
        for (const s of row.holes) {
          if (s !== null) return false
        }
        if (row.pulledFromPlayerName != null) {
          if (typeof row.pulledFromPlayerName !== 'string') return false
          if (row.pulledFromPlayerName.length < 1 || row.pulledFromPlayerName.length > 80) return false
        }
      }
      if (row.pulledGross != null) {
        if (typeof row.pulledGross !== 'number' || !Number.isFinite(row.pulledGross)) return false
        if (row.pulledGross < 18 || row.pulledGross > 120) return false
        if (row.golfOffPlayedDate != null) return false
        for (const s of row.holes) {
          if (s !== null) return false
        }
        if (row.pulledFromPlayerName != null) {
          if (typeof row.pulledFromPlayerName !== 'string') return false
          if (row.pulledFromPlayerName.length < 1 || row.pulledFromPlayerName.length > 80) return false
        }
      }
    }
  }
  return true
}

/** @param {unknown} body */
function validateLeagueDoc(body) {
  if (!body || typeof body !== 'object') return false
  if (typeof body.version !== 'number' || body.version < 1 || body.version > 1_000_000) return false
  if (!body.meta || typeof body.meta !== 'object') return false
  const m = body.meta
  if (typeof m.seasonYear !== 'number' || m.seasonYear < 2020 || m.seasonYear > 2100) return false
  if (typeof m.seasonStartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.seasonStartDate)) return false
  if (typeof m.weeksPerHalf !== 'number' || m.weeksPerHalf < 1 || m.weeksPerHalf > 20) return false
  if (typeof m.totalWeeks !== 'number' || m.totalWeeks < 1 || m.totalWeeks > 40) return false
  if (!validateCourse(body.course)) return false
  if (!Array.isArray(body.players) || body.players.length < 1 || body.players.length > 64) return false
  if (!body.players.every(validatePlayer)) return false
  if (!Array.isArray(body.teams) || body.teams.length < 1 || body.teams.length > 32) return false
  if (!body.teams.every(validateTeam)) return false
  if (!Array.isArray(body.schedule) || body.schedule.length < 1 || body.schedule.length > 52) return false
  if (!body.schedule.every(validateScheduleRow)) return false
  if (!validateWeeklyScores(body.weeklyScores)) return false

  const playerIds = new Set(body.players.map((p) => p.id))
  if (playerIds.size !== body.players.length) return false
  for (const t of body.teams) {
    for (const pid of t.playerIds) {
      if (!playerIds.has(pid)) return false
    }
  }
  const flightByPlayer = new Map(body.players.map((p) => [p.id, p.flight]))
  for (const t of body.teams) {
    const fs = t.playerIds.map((pid) => flightByPlayer.get(pid))
    if (fs.some((f) => !f)) return false
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    for (const f of fs) counts[f]++
    if (counts.A !== 1 || counts.B !== 1 || counts.C !== 1 || counts.D !== 1) return false
  }
  return true
}

function s3PutErrorResponse(err) {
  console.error('PutObject failed', err)
  const name = err?.name ?? err?.Code ?? ''
  const msg = String(err?.message ?? '')
  if (name === 'AccessDenied' || msg.includes('Access Denied')) {
    return response(500, {
      error:
        'S3 PutObject denied. Allow s3:PutObject on league-data.json (or your CMS_S3_LEAGUE_KEY) for this role.',
    })
  }
  if (name === 'NoSuchBucket' || msg.includes('NoSuchBucket')) {
    return response(500, { error: 'S3 bucket not found. Check CMS_S3_BUCKET.' })
  }
  return response(500, { error: 'S3 upload failed. Check CloudWatch logs for this function.' })
}

export async function handler(event) {
  const method = getMethod(event)
  const path = getPath(event)

  const adminPassword = process.env.ADMIN_PASSWORD ?? ''
  const sessionSecret = process.env.ADMIN_SESSION_SECRET ?? ''

  if (!adminPassword || !sessionSecret) {
    return response(500, { error: 'Server misconfigured' })
  }

  const isLogin = method === 'POST' && (path === '/login' || path.endsWith('/login'))
  const isVerify = method === 'GET' && (path === '/verify' || path.endsWith('/verify'))
  const isSaveLeague =
    method === 'PUT' && (path === '/league-data' || path.endsWith('/league-data'))

  if (isLogin) {
    let password = ''
    try {
      const parsed = JSON.parse(parseBody(event))
      password = parsed.password ?? ''
    } catch {
      return response(400, { error: 'Invalid JSON' })
    }
    if (!safeEqualStr(password, adminPassword)) {
      return response(401, { error: 'Unauthorized' })
    }
    const now = Math.floor(Date.now() / 1000)
    const exp = now + SESSION_HOURS * 3600
    const token = signJwt({ sub: JWT_SUB, iat: now, exp }, sessionSecret)
    return response(200, { token })
  }

  if (isVerify) {
    const token = bearerToken(event)
    if (!token || !verifyJwt(token, sessionSecret)) {
      return response(401, { error: 'Unauthorized' })
    }
    return response(200, { ok: true })
  }

  if (isSaveLeague) {
    const token = bearerToken(event)
    if (!token || !verifyJwt(token, sessionSecret)) {
      return response(401, { error: 'Unauthorized' })
    }
    let body
    try {
      body = JSON.parse(parseBody(event))
    } catch {
      return response(400, { error: 'Invalid JSON' })
    }
    if (!validateLeagueDoc(body)) {
      return response(400, { error: 'Invalid league data document' })
    }
    const bucket = process.env.CMS_S3_BUCKET ?? ''
    const key = process.env.CMS_S3_LEAGUE_KEY || 'league-data.json'
    if (!bucket) {
      return response(500, { error: 'CMS_S3_BUCKET not set' })
    }
    const version = Math.max(1, Math.floor(body.version))
    const normalized = {
      ...body,
      version,
      meta: {
        seasonYear: Math.floor(body.meta.seasonYear),
        seasonStartDate: body.meta.seasonStartDate,
        weeksPerHalf: Math.floor(body.meta.weeksPerHalf),
        totalWeeks: Math.floor(body.meta.totalWeeks),
      },
      players: body.players.map((p) => {
        const row = {
          id: p.id,
          name: String(p.name).trim(),
          flight: p.flight,
          teamId: p.teamId,
          isSenior: Boolean(p.isSenior),
          priorSeasonScores: p.priorSeasonScores.map(Number),
        }
        if (p.handicapOverride != null && typeof p.handicapOverride === 'object') {
          row.handicapOverride = {
            active: Boolean(p.handicapOverride.active),
            value: Number(p.handicapOverride.value),
          }
        }
        return row
      }),
      teams: body.teams.map((t) => ({
        id: t.id,
        name: String(t.name).trim(),
        playerIds: [...t.playerIds],
      })),
      schedule: body.schedule.map((r) => {
        const row = {
          date: r.date,
          leagueWeekNumber: Math.floor(r.leagueWeekNumber),
          nine: r.nine,
        }
        if (r.rainOut === true) row.rainOut = true
        if (r.label != null && String(r.label).trim()) row.label = String(r.label).trim()
        return row
      }),
      weeklyScores: body.weeklyScores,
    }
    const payload = JSON.stringify(normalized, null, 2)
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: payload,
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'max-age=30',
        }),
      )
    } catch (err) {
      return s3PutErrorResponse(err)
    }
    return response(200, { ok: true })
  }

  return response(404, { error: 'Not found' })
}
