cube('TaskCompletion', {
  dataSource: 'operational',
  sql: `SELECT * FROM planner.task`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id: { sql: 'id', type: 'string', primaryKey: true },
  },

  measures: {
    count: { type: 'count' },
  },
})
