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
	// @ts-ignore: permitimos sobrescribir la implementación en pruebas
	window.ResizeObserver = window.ResizeObserver || ResizeObserverMock
}

// @ts-ignore: permitimos sobrescribir la implementación en pruebas
global.ResizeObserver = global.ResizeObserver || ResizeObserverMock
