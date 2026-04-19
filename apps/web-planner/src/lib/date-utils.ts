export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
