'use client'
import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Button,
} from '@future/ui'
import type { CustomFieldDefinition } from '../../lib/types-workflows'

interface CustomFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field?: CustomFieldDefinition | null
  onSave: (data: Partial<CustomFieldDefinition>) => void
}

export function CustomFieldDialog({ open, onOpenChange, field, onSave }: CustomFieldDialogProps) {
  const isEdit = field != null
  const [label, setLabel] = React.useState(field?.label ?? '')
  const [fieldKey, setFieldKey] = React.useState(field?.fieldKey ?? '')
  const [type, setType] = React.useState(field?.type ?? 'text')
  const [group, setGroup] = React.useState(field?.group ?? '')
  const [isRequired, setIsRequired] = React.useState(field?.isRequired ?? false)
  const [isSearchable, setIsSearchable] = React.useState(field?.isSearchable ?? false)
  const [isFilterable, setIsFilterable] = React.useState(field?.isFilterable ?? false)
  const [visibilityTier, setVisibilityTier] = React.useState(field?.visibilityTier ?? 'restricted')
  const [options, setOptions] = React.useState(field?.options?.join(', ') ?? '')

  React.useEffect(() => {
    if (!isEdit && label) {
      setFieldKey(
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, ''),
      )
    }
  }, [label, isEdit])

  function handleSubmit() {
    onSave({
      label,
      fieldKey,
      type: type as CustomFieldDefinition['type'],
      group,
      isRequired,
      isSearchable,
      isFilterable,
      visibilityTier: visibilityTier as CustomFieldDefinition['visibilityTier'],
      options:
        type === 'select' || type === 'multi_select'
          ? options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., T-Shirt Size"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Field Key</label>
            <Input
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              disabled={isEdit}
              className={isEdit ? 'opacity-50' : ''}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Type</label>
            <Select value={type} onValueChange={setType as (value: string) => void}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="select">Select</SelectItem>
                <SelectItem value="multi_select">Multi-Select</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type === 'select' || type === 'multi_select') && (
            <div className="space-y-1">
              <label className="text-xs font-[510] text-[#8a8f98]">Options (comma-separated)</label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Small, Medium, Large"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Group</label>
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g., Preferences"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Visibility Tier</label>
            <Select
              value={visibilityTier}
              onValueChange={setVisibilityTier as (value: string) => void}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#d0d6e0]">Required</span>
              <Switch checked={isRequired} onCheckedChange={setIsRequired} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#d0d6e0]">Searchable</span>
              <Switch checked={isSearchable} onCheckedChange={setIsSearchable} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#d0d6e0]">Filterable</span>
              <Switch checked={isFilterable} onCheckedChange={setIsFilterable} />
            </div>
          </div>
          <Button className="w-full" onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create Field'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
