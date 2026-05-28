import type { LeagueData, PlayerContact, PlayerContactsById } from '../data/leagueTypes'

export function getPlayerContact(
  contacts: PlayerContactsById | undefined,
  playerId: string,
): { email: string; phone: string } {
  const c = contacts?.[playerId]
  return {
    email: c?.email?.trim() ?? '',
    phone: c?.phone?.trim() ?? '',
  }
}

function compactContact(raw: PlayerContact): PlayerContact | undefined {
  const email = raw.email?.trim()
  const phone = raw.phone?.trim()
  if (!email && !phone) return undefined
  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  }
}

export function setPlayerContactField(
  data: LeagueData,
  playerId: string,
  field: 'email' | 'phone',
  value: string,
): LeagueData {
  const trimmed = value.trim()
  const prev = data.playerContacts?.[playerId] ?? {}
  const merged: PlayerContact = { ...prev, [field]: trimmed || undefined }
  const compact = compactContact(merged)
  const next: PlayerContactsById = { ...(data.playerContacts ?? {}) }
  if (compact) next[playerId] = compact
  else delete next[playerId]
  const playerContacts = Object.keys(next).length > 0 ? next : undefined
  return { ...data, playerContacts }
}

/** Normalize stored contact map (trim strings, drop empty entries). */
export function normalizePlayerContacts(
  raw: PlayerContactsById | undefined,
): PlayerContactsById | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: PlayerContactsById = {}
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object') continue
    const compact = compactContact(entry as PlayerContact)
    if (compact) out[id] = compact
  }
  return Object.keys(out).length > 0 ? out : undefined
}
