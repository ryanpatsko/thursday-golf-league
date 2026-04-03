/** Public JSON in S3 (read by the app and browsers). Override with VITE_LEAGUE_DATA_URL if your bucket/region/key differ. */
export function getLeagueDataUrl(): string {
  const fromEnv = import.meta.env.VITE_LEAGUE_DATA_URL?.trim()
  if (fromEnv) return fromEnv
  return 'https://thursday-golf-league.s3.us-east-1.amazonaws.com/league-data.json'
}
