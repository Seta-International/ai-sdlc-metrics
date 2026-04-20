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

// jsdom doesn't define ResizeObserver — @assistant-ui/react requires it
if (typeof ResizeObserver === 'undefined') {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver
}

// jsdom doesn't implement scrollTo on elements — @assistant-ui/react viewport auto-scroll requires it
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function () {}
}
