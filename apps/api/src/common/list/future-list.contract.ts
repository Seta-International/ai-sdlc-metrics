import { z } from 'zod'

const scalarFilterValue = z.union([z.string(), z.number(), z.boolean()])

const scalarFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'contains', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte']),
  value: scalarFilterValue,
})

const arrayFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['in', 'not_in']),
  value: z.array(scalarFilterValue),
})

const rangeFilterSchema = z.object({
  field: z.string(),
  operator: z.literal('between'),
  value: z.object({
    from: z.union([z.string(), z.number()]),
    to: z.union([z.string(), z.number()]),
  }),
})

const emptyFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['is_empty', 'is_not_empty']),
  value: z.null(),
})

export const futureTableFilterSchema = z.union([
  scalarFilterSchema,
  arrayFilterSchema,
  rangeFilterSchema,
  emptyFilterSchema,
])

export const futureListQuerySchema = z.object({
  resourceKey: z.string(),
  search: z.string(),
  filters: z.array(futureTableFilterSchema),
  sorting: z.array(z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) })),
  pagination: z.object({
    pageIndex: z.number().int().min(0),
    pageSize: z.number().int().positive(),
  }),
})

export const futureExportQuerySchema = futureListQuerySchema.omit({ pagination: true }).extend({
  columns: z.array(z.string()).optional(),
})

export const futureListResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  totalCount: z.number().int().min(0),
  pageCount: z.number().int().min(0),
  pageIndex: z.number().int().min(0),
  pageSize: z.number().int().positive(),
  availableFilters: z.record(z.string(), z.array(z.unknown())).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export type FutureListQuery = z.infer<typeof futureListQuerySchema>
export type FutureExportQuery = z.infer<typeof futureExportQuerySchema>
export type FutureListResult = z.infer<typeof futureListResultSchema>
