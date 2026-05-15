import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Radix UI uses ResizeObserver; jsdom doesn't provide it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Node 26+ defines a non-writable global localStorage getter that returns undefined
// unless --localstorage-file is provided. This shadows jsdom's window.localStorage
// getter on the prototype chain. Redefine it to forward to jsdom's internal Storage.
if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>
  const jsdomStorage = win._localStorage as Storage | undefined
  if (jsdomStorage !== undefined) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      enumerable: true,
      get: () => jsdomStorage,
    })
  }
}

afterEach(() => {
  cleanup()
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
})
