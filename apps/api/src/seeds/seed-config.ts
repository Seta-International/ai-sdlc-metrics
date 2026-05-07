const DEFAULT_SEED_DATABASE_URL = 'postgresql://future:future@localhost:5432/future'

export function getSeedDatabaseUrl(databaseUrl: string | undefined): string {
  return databaseUrl ?? DEFAULT_SEED_DATABASE_URL
}
