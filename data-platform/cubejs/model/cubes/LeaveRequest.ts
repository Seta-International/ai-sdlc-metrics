cube('LeaveRequest', {
  dataSource: 'operational',
  sql: `SELECT * FROM time.leave_request`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id: { sql: 'id', type: 'string', primaryKey: true },
  },

  measures: {
    count: { type: 'count' },
  },
})
