// Cube.js TypeScript configuration
// Two data sources:
// - operational: RDS read replica (last 30 days, low-latency OLAP)
// - historical:  Amazon Athena (full history via S3 Gold Iceberg tables)

module.exports = {
  dbType: ({ dataSource }: { dataSource?: string }) => {
    if (dataSource === 'historical') return 'athena'
    return 'postgres'
  },

  driverFactory: ({ dataSource }: { dataSource?: string }) => {
    if (dataSource === 'historical') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AthenaDriver = require('@cubejs-backend/athena-driver')
      return new AthenaDriver({
        accessKeyId: process.env['CUBEJS_ATHENA_KEY_ID'],
        secretAccessKey: process.env['CUBEJS_ATHENA_SECRET'],
        region: process.env['CUBEJS_ATHENA_REGION'] ?? 'ap-southeast-1',
        S3OutputLocation: process.env['CUBEJS_ATHENA_S3_OUTPUT'],
        database: 'future_gold',
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PostgresDriver = require('@cubejs-backend/postgres-driver')
    return new PostgresDriver({
      host: process.env['CUBEJS_DB_HOST'],
      database: process.env['CUBEJS_DB_NAME'],
      user: process.env['CUBEJS_DB_USER'],
      password: process.env['CUBEJS_DB_PASS'],
      port: parseInt(process.env['CUBEJS_DB_PORT'] ?? '5432', 10),
    })
  },

  // Inject tenant_id filter on every query — multi-tenant isolation
  queryTransformer: (
    query: Record<string, unknown>,
    { securityContext }: { securityContext?: Record<string, unknown> },
  ) => {
    const tenantId = securityContext?.['tenantId'] as string | undefined
    if (!tenantId) throw new Error('tenantId required in Cube.js security context')
    const measures = query['measures'] as string[] | undefined
    return {
      ...query,
      filters: [
        ...((query['filters'] as unknown[]) ?? []),
        {
          member: `${measures?.[0]?.split('.')[0]}.tenantId`,
          operator: 'equals',
          values: [tenantId],
        },
      ],
    }
  },

  apiSecret: process.env['CUBEJS_API_SECRET'],
  schemaPath: 'model',
}
