import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'
import type { Variant } from '../../types'
import { Toast } from './Toast'

interface ToastInput {
  title: string
  description?: string
  variant?: Variant
}
interface QueuedToast extends ToastInput {
  id: string
}

interface Ctx {
  toast: (input: ToastInput) => void
}
const ToastContext = createContext<Ctx | null>(null)

export function useToast(): Ctx {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <Toaster>')
  return ctx
}

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueuedToast[]>([])
  const toast = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID()
    const queued: QueuedToast = { id, title: input.title }
    if (input.description !== undefined) queued.description = input.description
    if (input.variant !== undefined) queued.variant = input.variant
    setItems((prev) => [...prev, queued])
  }, [])
  return (
    <ToastContext value={{ toast }}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {items.map((item) => (
          <Toast
            key={item.id}
            title={item.title}
            {...(item.description !== undefined && { description: item.description })}
            {...(item.variant !== undefined && { variant: item.variant })}
            onDismiss={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
          />
        ))}
      </section>
    </ToastContext>
  )
}
