import '@testing-library/jest-dom/vitest'

// Node 26 exposes experimental `localStorage` only when `--localstorage-file`
// is passed; otherwise it's `undefined` even under vitest's jsdom env. Provide
// an in-memory Storage polyfill so tests can freely call localStorage.clear()
// without flag plumbing.
if (typeof localStorage === 'undefined') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>()
    get length(): number {
      return this.store.size
    }
    clear(): void {
      this.store.clear()
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? (this.store.get(key) as string) : null
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null
    }
    removeItem(key: string): void {
      this.store.delete(key)
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value))
    }
  }
  const localStorageImpl = new MemoryStorage()
  const sessionStorageImpl = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageImpl,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorageImpl,
    writable: true,
    configurable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageImpl,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageImpl,
      writable: true,
      configurable: true,
    })
  }
}

// cmdk and some Radix UI components require ResizeObserver
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom doesn't define PointerEvent — Radix UI requires it
if (typeof PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    pointerType: string
    constructor(type: string, init?: PointerEventInit) {
      super(type, init)
      this.pointerType = init?.pointerType ?? 'mouse'
    }
  }
  // @ts-expect-error — polyfilling global
  global.PointerEvent = PointerEvent
}

// Polyfill HTMLElement.hasPointerCapture for Radix UI Select in tests
if (typeof HTMLElement.prototype.hasPointerCapture === 'undefined') {
  HTMLElement.prototype.hasPointerCapture = function () {
    return false
  }
}

// Polyfill Element.scrollIntoView for Radix UI Select in tests
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function () {
    // no-op
  }
}
