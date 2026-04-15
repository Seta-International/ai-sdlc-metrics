'use client'
import * as React from 'react'
import {
  Card,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@future/ui'
import { Plus, GripVertical, Trash2, Copy } from 'lucide-react'
import type { OnboardingTemplate } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TemplateEditorProps {
  type: 'onboarding' | 'offboarding'
}

export function TemplateEditor({ type }: TemplateEditorProps) {
  const [templates, setTemplates] = React.useState<OnboardingTemplate[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const selectedTemplate = templates.find((t) => t.id === selectedId)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings[`${type}Templates`].list.query() as Promise<{
          templates: OnboardingTemplate[]
        }>)
        setTemplates(result.templates)
        if (result.templates.length > 0 && result.templates[0])
          setSelectedId(result.templates[0].id)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [type])

  return (
    <div className="flex gap-6">
      <Card className="w-64 shrink-0 border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-[590] text-[#f7f8f8]">Templates</h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1">
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => setSelectedId(tmpl.id)}
              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-sm ${selectedId === tmpl.id ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]' : 'text-[#d0d6e0] hover:bg-[rgba(255,255,255,0.04)]'}`}
            >
              <div className="truncate">
                {tmpl.name}
                {tmpl.isDefault && (
                  <Badge variant="subtle" className="ml-1 h-4 px-1 text-[10px]">
                    Default
                  </Badge>
                )}
              </div>
              <span className="text-xs text-[#62666d]">{tmpl.taskCount}</span>
            </button>
          ))}
        </div>
      </Card>
      <div className="flex-1 min-w-0">
        {selectedTemplate ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-[590] text-[#f7f8f8]">{selectedTemplate.name}</h3>
                <div className="flex gap-2 mt-1">
                  {selectedTemplate.countryScope && (
                    <Badge variant="subtle" className="text-xs">
                      {selectedTemplate.countryScope}
                    </Badge>
                  )}
                  {selectedTemplate.employmentTypeScope && (
                    <Badge variant="subtle" className="text-xs">
                      {selectedTemplate.employmentTypeScope}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="default" size="sm" className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Add Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Task title" />
                      <Input placeholder="Description (optional)" />
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Assignee role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hr">HR</SelectItem>
                          <SelectItem value="it">IT</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="Due days after start" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#d0d6e0]">Required</span>
                        <Switch />
                      </div>
                      <Button className="w-full">Add Task</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="space-y-2">
              {selectedTemplate.tasks.map((task) => (
                <Card
                  key={task.id}
                  className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3"
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-[#62666d] cursor-grab shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#d0d6e0]">{task.title}</span>
                        {task.isRequired && (
                          <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                            Required
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#62666d] mt-0.5">
                        <span>{task.assigneeRole}</span>
                        <span>Due: +{task.dueDays} days</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-[#62666d] py-16 text-center">
            {isLoading ? 'Loading...' : 'Select a template to edit'}
          </div>
        )}
      </div>
    </div>
  )
}
