type Key = `seta:${string}`

export function localBool(key: Key) {
  return {
    get(): boolean {
      if (typeof localStorage === 'undefined') return false
      return localStorage.getItem(key) === '1'
    },
    set(value: boolean): void {
      if (typeof localStorage === 'undefined') return
      if (value) localStorage.setItem(key, '1')
      else localStorage.removeItem(key)
    },
  }
}
