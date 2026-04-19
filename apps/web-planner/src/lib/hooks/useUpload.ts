'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { toast } from 'sonner'
import { trpc } from '../trpc'

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

    setUploadState({ uploading: true, progress: 0, error: null })

    let uploadUrl: string
    let storageKey: string
    try {
      const result = await trpc.planner.attachments.requestUpload.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      })
      uploadUrl = result.uploadUrl
      storageKey = result.storageKey
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setUploadState({ uploading: false, progress: 0, error: message })
      toast.error(message)
      return
    }

    await new Promise<void>((resolve, reject) => {
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
          resolve()
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setUploadState({ uploading: false, progress: 0, error: message })
      toast.error(message)
      throw err
    })

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
    void queryClient.invalidateQueries({ queryKey: ['tasks.getDetail', taskId] })
  }

  return { uploadState, uploadFile, reset }
}
