cube('HiringFunnel', {
  dataSource: 'operational',
  sql: `SELECT * FROM hiring.application`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id:       { sql: 'id', type: 'string', primaryKey: true },
  },

  measures: {
    count: { type: 'count' },
  },
})
