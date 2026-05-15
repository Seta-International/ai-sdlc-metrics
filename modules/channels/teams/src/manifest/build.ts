import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
  version: string
}

const env = z
  .object({
    MS_BOT_ID: z.string().min(1, 'MS_BOT_ID is required'),
    VALID_DOMAINS: z.string().default('localhost'),
  })
  .parse(process.env)

const botId = env.MS_BOT_ID
const domains = env.VALID_DOMAINS

const manifest = readFileSync(resolve(__dirname, 'manifest.json'), 'utf8')
  .replace(/\{\{MS_BOT_ID\}\}/g, botId)
  .replace(/\{\{APP_VERSION\}\}/g, pkg.version)
  .replace(/\{\{VALID_DOMAINS\}\}/g, domains)

mkdirSync(resolve(__dirname, '../../dist'), { recursive: true })

const zip = new AdmZip()
zip.addFile('manifest.json', Buffer.from(manifest))
zip.addLocalFile(resolve(__dirname, 'color.png'))
zip.addLocalFile(resolve(__dirname, 'outline.png'))
zip.writeZip(resolve(__dirname, '../../dist/seta-agent.zip'))

console.log('Built dist/seta-agent.zip')
