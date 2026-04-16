'use client'

import * as React from 'react'
import {
  Button,
  Badge,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Input,
} from '@future/ui'
import { Filter, X } from 'lucide-react'
import type { EmploymentStatus, EmploymentType, WorkArrangement } from '../lib/types'

export type FilterValues = {
  departmentIds: string[]
  jobFamilyIds: string[]
  jobProfileIds: string[]
  employmentStatus: EmploymentStatus[]
  employmentType: EmploymentType[]
  workerType: string[]
  workArrangement: WorkArrangement[]
  countryCode: string[]
  location: string[]
  hireDateFrom: string | null
  hireDateTo: string | null
  managerId: string | null
}

export const emptyFilters: FilterValues = {
  departmentIds: [],
  jobFamilyIds: [],
  jobProfileIds: [],
  employmentStatus: [],
  employmentType: [],
  workerType: [],
  workArrangement: [],
  countryCode: [],
  location: [],
  hireDateFrom: null,
  hireDateTo: null,
  managerId: null,
}

interface FilterOption {
  value: string
  label: string
  count?: number
}

interface FilterPanelProps {
  filters: FilterValues
  onFiltersChange: (filters: FilterValues) => void
  departments: FilterOption[]
  jobFamilies: FilterOption[]
  countries: FilterOption[]
  locations: FilterOption[]
}

export function FilterPanel({
  filters,
  onFiltersChange,
  departments,
  jobFamilies,
  countries,
  locations,
}: FilterPanelProps) {
  const activeCount = countActiveFilters(filters)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <Badge variant="subtle" className="ml-1 h-5 px-1.5 text-xs">
                {activeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            <FilterSection
              title="Department"
              options={departments}
              selected={filters.departmentIds}
              onChange={(val) => onFiltersChange({ ...filters, departmentIds: val })}
            />
            <Separator />
            <FilterSection
              title="Job Family"
              options={jobFamilies}
              selected={filters.jobFamilyIds}
              onChange={(val) => onFiltersChange({ ...filters, jobFamilyIds: val })}
            />
            <Separator />
            <FilterSection
              title="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'pre_hire', label: 'Pre-hire' },
                { value: 'on_leave', label: 'On Leave' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'notice_period', label: 'Notice Period' },
                { value: 'terminated', label: 'Terminated' },
              ]}
              selected={filters.employmentStatus}
              onChange={(val) =>
                onFiltersChange({ ...filters, employmentStatus: val as EmploymentStatus[] })
              }
            />
            <Separator />
            <FilterSection
              title="Country"
              options={countries}
              selected={filters.countryCode}
              onChange={(val) => onFiltersChange({ ...filters, countryCode: val })}
            />
            <Separator />
            <FilterSection
              title="Employment Type"
              options={[
                { value: 'permanent', label: 'Permanent' },
                { value: 'fixed_term', label: 'Fixed Term' },
                { value: 'intern', label: 'Intern' },
              ]}
              selected={filters.employmentType}
              onChange={(val) =>
                onFiltersChange({ ...filters, employmentType: val as EmploymentType[] })
              }
            />
            <Separator />
            <FilterSection
              title="Location"
              options={locations}
              selected={filters.location}
              onChange={(val) => onFiltersChange({ ...filters, location: val })}
            />
            <Separator />
            <div>
              <div className="text-xs font-510 text-muted-foreground mb-2">Hire Date</div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filters.hireDateFrom ?? ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, hireDateFrom: e.target.value || null })
                  }
                  placeholder="From"
                  className="text-xs"
                />
                <Input
                  type="date"
                  value={filters.hireDateTo ?? ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, hireDateTo: e.target.value || null })
                  }
                  placeholder="To"
                  className="text-xs"
                />
              </div>
            </div>
          </div>
          {activeCount > 0 && (
            <div className="border-t border-sidebar-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => onFiltersChange(emptyFilters)}
              >
                <X className="mr-1 h-3 w-3" />
                Clear all filters
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange(emptyFilters)}
          className="text-xs text-muted-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  )
}

function FilterSection({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const [search, setSearch] = React.useState('')
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-510 text-muted-foreground">{title}</span>
        {selected.length > 0 && (
          <Badge variant="subtle" className="h-4 px-1 text-xs">
            {selected.length}
          </Badge>
        )}
      </div>
      {options.length > 5 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="mb-2 h-7 text-xs"
        />
      )}
      <div className="max-h-32 space-y-1 overflow-y-auto">
        {filtered.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-secondary cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange([...selected, option.value])
                } else {
                  onChange(selected.filter((v) => v !== option.value))
                }
              }}
              className="h-3.5 w-3.5"
            />
            <span className="text-secondary-foreground flex-1">{option.label}</span>
            {option.count != null && (
              <span className="text-secondary-foreground/60">{option.count}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}

function countActiveFilters(filters: FilterValues): number {
  let count = 0
  if (filters.departmentIds.length > 0) count++
  if (filters.jobFamilyIds.length > 0) count++
  if (filters.jobProfileIds.length > 0) count++
  if (filters.employmentStatus.length > 0) count++
  if (filters.employmentType.length > 0) count++
  if (filters.workerType.length > 0) count++
  if (filters.workArrangement.length > 0) count++
  if (filters.countryCode.length > 0) count++
  if (filters.location.length > 0) count++
  if (filters.hireDateFrom) count++
  if (filters.hireDateTo) count++
  if (filters.managerId) count++
  return count
}
