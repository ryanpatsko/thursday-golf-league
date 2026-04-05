/** Format `YYYY-MM-DD` as a local calendar date (avoids UTC midnight shift). */
export function formatIsoDateForDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(y, mo, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
