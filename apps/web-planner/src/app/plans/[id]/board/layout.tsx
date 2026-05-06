'use client'

import { useSelectedLayoutSegment, useRouter } from 'next/navigation'

interface Props {
  children: React.ReactNode
  panel: React.ReactNode
}

export default function BoardLayout({ children, panel }: Props) {
  const panelSegment = useSelectedLayoutSegment('panel')
  const router = useRouter()

  return (
    <div className="relative flex h-full w-full">
      {children}
      {panelSegment !== null && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/85"
            data-testid="modal-overlay"
            onClick={() => router.back()}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            data-testid="modal-container"
          >
            <div
              className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-surface shadow-2xl"
              style={{ height: '90vh', minHeight: '560px' }}
              data-testid="modal-inner"
            >
              {panel}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
