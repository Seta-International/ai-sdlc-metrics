import { useCallback, useState } from 'react'
import { localBool } from '../lib/storage'

const store = localBool('seta:agent-panel:open')

export function useAgentPanel() {
  const [open, setOpen] = useState<boolean>(() => store.get())
  const set = useCallback((v: boolean) => {
    store.set(v)
    setOpen(v)
  }, [])
  const toggle = useCallback(() => set(!store.get()), [set])
  return { open, set, toggle }
}
