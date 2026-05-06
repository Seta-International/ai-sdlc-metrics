import '@testing-library/jest-dom/vitest'

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
