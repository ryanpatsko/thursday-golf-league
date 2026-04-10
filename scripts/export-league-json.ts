import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cloneDefaultLeagueData } from '../src/data/defaultLeagueData.ts'
import { describeLeagueSaveBlocker } from '../src/lib/leagueSaveValidation.ts'

const root = dirname(fileURLToPath(import.meta.url))
const outPath = join(root, '..', 'league-data.json')

const data = cloneDefaultLeagueData()
const blocker = describeLeagueSaveBlocker(data)
if (blocker) {
  console.error(blocker)
  process.exit(1)
}
writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outPath}`)
