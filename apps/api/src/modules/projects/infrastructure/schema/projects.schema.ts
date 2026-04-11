import { pgSchema, uuid, text, timestamp, integer, jsonb, numeric } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const projectsSchema = pgSchema('projects')

// --- Account ---

export const account = projectsSchema.table('account', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  clientCompany: text('client_company'),
  description: text('description'),
  domain: text('domain'),
  location: text('location'),
  timezone: text('timezone'),
  billingModel: text('billing_model', {
    enum: ['fixed_price', 't_and_m', 'dedicated', 'retainer'],
  }),
  status: text('status', {
    enum: ['active', 'on_hold', 'closed'],
  })
    .notNull()
    .default('active'),
  accountManagerId: uuid('account_manager_id'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// --- Project ---

export const project = projectsSchema.table('project', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  accountId: uuid('account_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  description: text('description'),
  deliveryModel: text('delivery_model', {
    enum: ['scrum', 'kanban', 'waterfall', 'other'],
  }),
  status: text('status', {
    enum: ['active', 'on_hold', 'closed', 'tentative'],
  })
    .notNull()
    .default('active'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  tags: jsonb('tags'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// --- Project Role (demand slot) ---

export const projectRole = projectsSchema.table('project_role', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull(),
  roleName: text('role_name').notNull(),
  skillsRequired: text('skills_required').array(),
  headcount: integer('headcount').notNull().default(1),
  status: text('status', {
    enum: ['open', 'filled', 'cancelled'],
  })
    .notNull()
    .default('open'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// --- Allocation (supply — hours-per-day, not percentage) ---

export const allocation = projectsSchema.table('allocation', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull(),
  projectRoleId: uuid('project_role_id').notNull(),
  actorId: uuid('actor_id'), // nullable = placeholder
  position: text('position'),
  hoursPerDay: numeric('hours_per_day', { precision: 4, scale: 2 }).notNull(),
  billingType: text('billing_type', {
    enum: ['billable', 'non_billable'],
  }).notNull(),
  memberType: text('member_type', {
    enum: ['core', 'shadow', 'backfill'],
  })
    .notNull()
    .default('core'),
  status: text('status', {
    enum: ['tentative', 'confirmed'],
  })
    .notNull()
    .default('tentative'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
