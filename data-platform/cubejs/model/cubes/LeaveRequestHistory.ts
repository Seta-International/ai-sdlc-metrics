cube('LeaveRequestHistory', {
  dataSource: 'historical',
  sql: `SELECT * FROM future_gold.time_leave_request`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id: { sql: 'id', type: 'string', primaryKey: true },
  },

  measures: {
    count: { type: 'count' },
  },
})
