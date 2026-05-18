import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

config({ path: resolve(repoRoot, '.env'), quiet: true })
