import { formatInTimeZone } from 'date-fns-tz'

export function tenantLocalDate(ts: Date, timezone: string): string {
  return formatInTimeZone(ts, timezone, 'yyyy-MM-dd')
}
