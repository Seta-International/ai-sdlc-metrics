import type { RecordingMode } from './types'

export function getRecordingMode(): RecordingMode {
  const v = process.env.RECORD
  if (v === 'force') return 'force'
  if (v === '1') return 'record'
  return 'replay'
}
