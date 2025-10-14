import '@testing-library/jest-dom'

type ResizeObserverHandler = (entries: any[], observer: any) => void

class ResizeObserverMock {
	callback: ResizeObserverHandler
	constructor(callback: ResizeObserverHandler) {
		this.callback = callback
	}
	observe() {}
	unobserve() {}
	disconnect() {}
}

if (typeof window !== 'undefined') {
	// @ts-ignore allow override in tests
	window.ResizeObserver = window.ResizeObserver || ResizeObserverMock
}

// @ts-ignore allow override in tests
global.ResizeObserver = global.ResizeObserver || ResizeObserverMock
