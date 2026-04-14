---
module: contract
task: placeholder-resolver
created: 2026-04-14
priority: high
depends-on: [004]
---

# Task: Placeholder Resolver System

## Scope

Implement the schema-driven data resolver in the `documents` module that maps template variables to actual data from domain modules via QueryFacades:

1. Variable definition registry — what placeholders are available, their types, data sources
2. Data resolver — given a context (entityType + entityId), resolve all variables for a template
3. Formatters — date, currency, case, number-to-words transformations
4. Multi-module resolution — batch queries to People, Finance, Kernel facades

## Roles Covered

- No direct role interaction — infrastructure consumed by document generation engine

## Business Context

The legacy system hardcodes placeholder-to-field mappings in a Python dict (`PLACEHOLDER_MAPPING`). This is brittle — adding a new placeholder requires code changes. The modern approach is schema-driven: each template version declares which variables it uses, and the resolver fetches data from the appropriate modules.

This decouples the documents module from specific domain models. The resolver knows how to fetch data from facades but doesn't know about contracts, employment profiles, or any specific entity shape. Template creators define which data they need.

## Source Reference

- **Files:** `src/core/services/contract_data_mapper.py` (map_employee_data — 271 lines), `src/core/constant/contract_placeholder.py` (PLACEHOLDER_MAPPING dict)
- **Key logic:** Legacy maps dot-notation paths (e.g., `employee.full_name`, `document.identity_number`, `contract_version.start_date`) to employee/document/contract fields. Applies formatters (date, currency, case). Translates values for `_en`/`_vi` suffixed placeholders via Google Translate.

## Target Location

- **Where:** `apps/api/src/modules/documents/domain/ports/`, `apps/api/src/modules/documents/infrastructure/`
- **Conventions to follow:** Port/adapter pattern, QueryFacade integration

## Data Model

Variable definitions are stored per template version in `document_template_version.variable_schema` (JSONB from task 004).

Variable schema format:

```jsonc
[
  {
    "key": "employee.full_name",
    "label": "Employee Full Name",
    "type": "string",
    "required": true,
    "source": "people.profile", // which facade to query
    "sourcePath": "displayName", // field path on the facade result
    "format": null,
  },
  {
    "key": "contract.start_date",
    "label": "Contract Start Date",
    "type": "date",
    "required": true,
    "source": "people.contract",
    "sourcePath": "startedAt",
    "format": "DD/MM/YYYY",
  },
  {
    "key": "contract.salary_text",
    "label": "Salary in Words",
    "type": "currency_words",
    "required": true,
    "source": "people.contract",
    "sourcePath": "terms.salary",
    "format": "vi", // Vietnamese number-to-words
  },
  {
    "key": "company.name",
    "label": "Company Name",
    "type": "string",
    "required": true,
    "source": "tenant",
    "sourcePath": "companyName",
  },
]
```

## Interface Contract

### Domain Port

```typescript
// documents/domain/ports/data-resolver.port.ts
export interface DataResolverPort {
  resolve(
    tenantId: string,
    context: ResolverContext,
    variables: VariableDefinition[],
  ): Promise<ResolvedVariables>
}

interface ResolverContext {
  entityType: string // 'contract' | 'offer' | 'termination' | etc.
  entityId: string // UUID of the entity
  profileId?: string // employee profile ID (for people data)
  locale?: string // 'vi-VN' | 'en-US'
}

interface ResolvedVariables {
  data: Record<string, string | number> // key → formatted value
  missing: string[] // keys that couldn't be resolved
  warnings: string[] // non-critical issues
}
```

### Infrastructure Adapter

```typescript
// documents/infrastructure/data-resolver.adapter.ts
@Injectable()
export class DataResolverAdapter implements DataResolverPort {
  constructor(
    private readonly peopleQuery: PeopleQueryFacade,
    // private readonly financeQuery: FinanceQueryFacade,  // when available
    // private readonly kernelQuery: KernelQueryFacade,
  ) {}

  async resolve(tenantId, context, variables): Promise<ResolvedVariables> {
    // 1. Group variables by source
    const grouped = this.groupBySource(variables)

    // 2. Batch-fetch from each source facade
    const sourceData = new Map<string, any>()
    if (grouped.has('people.profile')) {
      sourceData.set(
        'people.profile',
        await this.peopleQuery.getProfile(context.profileId, tenantId),
      )
    }
    if (grouped.has('people.contract')) {
      sourceData.set(
        'people.contract',
        await this.peopleQuery.getActiveContract(context.profileId, tenantId),
      )
    }
    // ... more sources

    // 3. Extract and format each variable
    const data: Record<string, string> = {}
    const missing: string[] = []

    for (const variable of variables) {
      const source = sourceData.get(variable.source)
      const rawValue = this.extractPath(source, variable.sourcePath)
      if (rawValue === undefined || rawValue === null) {
        if (variable.required) missing.push(variable.key)
        continue
      }
      data[variable.key] = this.format(rawValue, variable.type, variable.format, context.locale)
    }

    return { data, missing, warnings: [] }
  }
}
```

### Formatters

```typescript
const formatters: Record<string, (value: any, format?: string, locale?: string) => string> = {
  string: (v) => String(v),
  date: (v, format) => dayjs(v).format(format ?? 'DD/MM/YYYY'),
  currency: (v, format, locale) =>
    new Intl.NumberFormat(locale ?? 'vi-VN', {
      style: 'currency',
      currency: format ?? 'VND',
      maximumFractionDigits: 0,
    }).format(v),
  currency_words: (v, format) => numberToWords(v, format ?? 'vi'),
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  title: (v) => String(v).replace(/\b\w/g, (c) => c.toUpperCase()),
  number: (v, format, locale) => new Intl.NumberFormat(locale ?? 'vi-VN').format(v),
  boolean: (v) => (v ? 'Có' : 'Không'), // locale-aware in future
}
```

### PeopleQueryFacade methods needed

```typescript
// Must be exposed by people module for resolver to work
getProfile(profileId: string, tenantId: string): Promise<EmployeeProfileDetail>
getActiveContract(profileId: string, tenantId: string): Promise<ContractVersion | null>
getProfileDetail(profileId: string, tenantId: string): Promise<EmployeeProfileDetail>
```

## Edge Cases

- **Missing facade:** If a required source facade is not available (e.g., finance module not built yet), return `missing` for those variables and log warning. Don't crash.
- **Nested path resolution:** `terms.salary` requires traversing JSONB. Use lodash `get()` or equivalent for safe path traversal.
- **Null values:** Distinguish between "field exists but is null" (format as empty string) and "field doesn't exist" (missing).
- **Number-to-words:** Vietnamese number-to-words conversion for salary amounts. Use `n2words` library or custom implementation for Vietnamese.
- **Date locale:** Vietnamese dates use DD/MM/YYYY. English uses Month DD, YYYY. Format is specified per variable, not globally.

## Acceptance Criteria

- [ ] DataResolverPort interface defined
- [ ] DataResolverAdapter implementation with PeopleQueryFacade integration
- [ ] Variable grouping by source for batch fetching
- [ ] Path-based field extraction from facade results
- [ ] All formatters implemented: string, date, currency, currency_words, upper, lower, title, number, boolean
- [ ] Vietnamese number-to-words conversion
- [ ] Missing variable detection with required/optional distinction
- [ ] Resolver returns structured result (data + missing + warnings)
- [ ] Unit tests for each formatter
- [ ] Unit tests for path extraction (nested, null, missing)
- [ ] Unit tests for resolver with mock facades (all resolved, partial, all missing)
- [ ] Integration test with real PeopleQueryFacade
