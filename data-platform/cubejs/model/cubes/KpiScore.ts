cube('KpiScore', {
  dataSource: 'operational',
  sql: `SELECT * FROM goals.kpi_score`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id: { sql: 'id', type: 'string', primaryKey: true },
  },

  measures: {
    count: { type: 'count' },
  },
})
