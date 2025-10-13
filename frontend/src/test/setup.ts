import '@testing-library/jest-dom/vitest'

// Polyfill matchMedia for Mantine color scheme hooks in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target?: Element, options?: ResizeObserverOptions) {
    if (!target) return
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  ;(window as any).ResizeObserver = ResizeObserverMock
}

if (typeof globalThis !== 'undefined' && !(globalThis as any).ResizeObserver) {
  ;(globalThis as any).ResizeObserver = ResizeObserverMock
}
