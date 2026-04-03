/**
 * Builds dist/lambda-admin-auth.zip for AWS Lambda upload.
 */
import { execSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const lambdaDir = path.join(root, 'lambda', 'admin-auth')
const outDir = path.join(root, 'dist')
const outZip = path.join(outDir, 'lambda-admin-auth.zip')

try {
  execSync('npm ci', { cwd: lambdaDir, stdio: 'inherit' })
} catch {
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

const output = createWriteStream(outZip)
const archive = archiver('zip', { zlib: { level: 9 } })

await new Promise((resolve, reject) => {
  output.on('close', resolve)
  output.on('error', reject)
  archive.on('error', reject)
  archive.pipe(output)
  archive.file(path.join(lambdaDir, 'index.mjs'), { name: 'index.mjs' })
  archive.directory(path.join(lambdaDir, 'node_modules'), 'node_modules')
  void archive.finalize()
})

console.log(`Wrote ${outZip} (${archive.pointer()} bytes)`)
