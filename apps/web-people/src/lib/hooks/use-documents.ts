import * as React from 'react'
import { trpc } from '../trpc'
import type { EmployeeDocument, DocumentRequirement } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type UseDocumentsReturn = {
  documents: EmployeeDocument[]
  requirements: DocumentRequirement[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useDocuments(employmentId: string): UseDocumentsReturn {
  const [documents, setDocuments] = React.useState<EmployeeDocument[]>([])
  const [requirements, setRequirements] = React.useState<DocumentRequirement[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refetchKey, setRefetchKey] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await (anyTrpc.people.profile.documents.query({
          employmentId,
        }) as Promise<{ documents: EmployeeDocument[]; requirements: DocumentRequirement[] }>)
        setDocuments(result.documents)
        setRequirements(result.requirements)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load documents')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId, refetchKey])

  return { documents, requirements, isLoading, error, refetch: () => setRefetchKey((k) => k + 1) }
}
