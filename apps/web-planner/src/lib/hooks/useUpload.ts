'use client'

import { useState } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { toast } from '@future/ui'
import { trpc } from '../trpc'
import { taskKeys } from '../query-keys'

interface UseUploadOptions {
  taskId: string
  planId: string
}

export interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
}

export function useUpload({ taskId, planId }: UseUploadOptions): {
  uploadState: UploadState
  uploadFile: (file: File, setAsCover?: boolean) => Promise<void>
  reset: () => void
} {
  const session = useSession()
  const queryClient = useQueryClient()
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  })

  function reset() {
    setUploadState({ uploading: false, progress: 0, error: null })
  }

  async function uploadFile(file: File, setAsCover?: boolean): Promise<void> {
    const actorId = session?.actorId ?? ''
    const tenantId = session?.tenantId ?? ''

    if (!actorId || !tenantId) {
      setUploadState({ uploading: false, progress: 0, error: 'Not authenticated' })
      toast.error('Not authenticated')
      return
    }

    setUploadState({ uploading: true, progress: 0, error: null })

    let uploadUrl: string
    let storageKey: string
    try {
      const result = (await trpc.planner.attachments.requestUpload.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      })) as { uploadUrl: string; storageKey: string; expiresAt: Date }
      uploadUrl = result.uploadUrl
      storageKey = result.storageKey
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setUploadState({ uploading: false, progress: 0, error: message })
      toast.error(message)
      return
    }

    const xhrOk = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadState((prev) => ({
            ...prev,
            progress: Math.round((e.loaded / e.total) * 100),
          }))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true)
        } else {
          const message = `Upload failed with status ${xhr.status}`
          setUploadState({ uploading: false, progress: 0, error: message })
          toast.error(message)
          resolve(false)
        }
      }
      xhr.onerror = () => {
        const message = 'Upload failed'
        setUploadState({ uploading: false, progress: 0, error: message })
        toast.error(message)
        resolve(false)
      }
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
    if (!xhrOk) return

    const attachmentId = crypto.randomUUID()
    try {
      await trpc.planner.attachments.finalizeUpload.mutate({
        tenantId,
        planId,
        taskId,
        attachmentId,
        actorId,
        storageKey,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        setAsCover,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Finalize failed'
      setUploadState({ uploading: false, progress: 0, error: message })
      toast.error(message)
      return
    }

    setUploadState({ uploading: false, progress: 100, error: null })
    void queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
  }

  return { uploadState, uploadFile, reset }
}
