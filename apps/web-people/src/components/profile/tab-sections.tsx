'use client'

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger, Card, Badge, Button, Skeleton } from '@future/ui'
import { Plus, Edit, Trash2, Link } from 'lucide-react'
import type { ProfileSection } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const sectionLabels: Record<string, string> = {
  education: 'Education',
  work_experience: 'Work Experience',
  certification: 'Certifications',
  skill: 'Skills',
  language: 'Languages',
  social_link: 'Social Links',
  dependent: 'Dependents',
}

export function TabSections({ employmentId, canEdit }: { employmentId: string; canEdit: boolean }) {
  const [sections, setSections] = React.useState<ProfileSection[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.sections.query({ employmentId }) as Promise<{
          sections: ProfileSection[]
        }>)
        setSections(result.sections)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) return <Skeleton className="h-64 w-full" />

  const grouped = sections.reduce<Record<string, ProfileSection[]>>((acc, s) => {
    if (!acc[s.sectionType]) acc[s.sectionType] = []
    ;(acc[s.sectionType] as ProfileSection[]).push(s)
    return acc
  }, {})

  const sectionTypes = Object.keys(sectionLabels)

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-1">
            <Link className="h-3.5 w-3.5" />
            Import from LinkedIn
          </Button>
        </div>
      )}
      <Tabs defaultValue="education">
        <TabsList>
          {sectionTypes.map((type) => (
            <TabsTrigger key={type} value={type} className="text-xs gap-1">
              {sectionLabels[type]}
              {grouped[type] && (
                <Badge variant="subtle" className="h-4 px-1 text-xs ml-1">
                  {grouped[type].length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {sectionTypes.map((type) => (
          <TabsContent key={type} value={type} className="mt-4">
            {type === 'skill' ? (
              <SkillsView entries={grouped[type] ?? []} canEdit={canEdit} />
            ) : (
              <SectionList entries={grouped[type] ?? []} sectionType={type} canEdit={canEdit} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function SectionList({
  entries,
  sectionType,
  canEdit,
}: {
  entries: ProfileSection[]
  sectionType: string
  canEdit: boolean
}) {
  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-secondary-foreground/60">
          No {sectionLabels[sectionType]?.toLowerCase()} entries yet.
        </p>
        {canEdit && (
          <Button variant="outline" size="sm" className="mt-3 gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add {sectionLabels[sectionType]}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      )}
      {entries.map((entry) => (
        <Card key={entry.id} className="border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {Object.entries(entry.data).map(([key, val]) => (
                <div key={key} className="text-sm">
                  <span className="text-muted-foreground capitalize">
                    {key.replace(/_/g, ' ')}:{' '}
                  </span>
                  <span className="text-secondary-foreground">
                    {val == null ? '--' : String(val)}
                  </span>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

function SkillsView({ entries, canEdit }: { entries: ProfileSection[]; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <Badge key={entry.id} variant="subtle" className="gap-1">
            {String(entry.data.name ?? entry.data.skill ?? '')}
            {canEdit && (
              <button
                type="button"
                className="ml-1 text-secondary-foreground/60 hover:text-red-400"
              >
                x
              </button>
            )}
          </Badge>
        ))}
      </div>
      {canEdit && (
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Skill
        </Button>
      )}
    </div>
  )
}
