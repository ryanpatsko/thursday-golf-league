/**
 * One-shot script: log in to the admin Lambda and PUT league-data.json to S3.
 *
 * Usage:
 *   node scripts/upload-league-json.mjs --url <Lambda base URL> --password <admin password>
 *
 * The Lambda base URL is the value of VITE_ADMIN_AUTH_URL in your .env.local
 * (e.g. https://xxxx.lambda-url.us-east-1.on.aws)
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const dataPath = join(root, '..', 'league-data.json')

// --- parse args ---
const args = process.argv.slice(2)
function arg(flag) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : null
}

const baseUrl = (arg('--url') ?? '').replace(/\/$/, '')
const password = arg('--password') ?? ''

if (!baseUrl || !password) {
  console.error('Usage: node scripts/upload-league-json.mjs --url <Lambda URL> --password <password>')
  process.exit(1)
}

// --- load data ---
const raw = readFileSync(dataPath, 'utf8')
const data = JSON.parse(raw)
console.log(`Loaded league-data.json  (version ${data.version})`)

// --- login ---
console.log('Logging in…')
const loginRes = await fetch(`${baseUrl}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
})
if (!loginRes.ok) {
  const text = await loginRes.text()
  console.error(`Login failed (HTTP ${loginRes.status}): ${text}`)
  process.exit(1)
}
const { token } = await loginRes.json()
if (!token) {
  console.error('Login response did not include a token.')
  process.exit(1)
}
console.log('Authenticated.')

// --- upload ---
console.log('Uploading league-data.json…')
const putRes = await fetch(`${baseUrl}/league-data`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: raw,
})
if (!putRes.ok) {
  const text = await putRes.text()
  console.error(`Upload failed (HTTP ${putRes.status}): ${text}`)
  process.exit(1)
}
console.log(`Done — version ${data.version} is now live on S3.`)
