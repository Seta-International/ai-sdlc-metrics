cube('Employment', {
  dataSource: 'operational',
  sql: `SELECT * FROM people.employment_contract`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id: { sql: 'id', type: 'string', primaryKey: true },
  },

  measures: {
    count: { type: 'count' },
  },
})
