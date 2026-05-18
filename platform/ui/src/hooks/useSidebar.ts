import { useCallback, useState } from 'react'
import { localBool } from '../lib/storage'

const store = localBool('seta:sidebar:collapsed')

export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => store.get())
  const set = useCallback((v: boolean) => {
    store.set(v)
    setCollapsed(v)
  }, [])
  const toggle = useCallback(() => set(!store.get()), [set])
  return { collapsed, set, toggle }
}
