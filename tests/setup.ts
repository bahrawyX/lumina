import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Auto-cleanup mounted React trees between tests
afterEach(() => {
  cleanup();
});

// jsdom doesn't ship matchMedia — stub it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Silence ResizeObserver errors from Radix components under jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// scrollTo isn't implemented in jsdom
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// Element.scrollIntoView isn't implemented in jsdom either — Tiptap's
// SlashMenuList scrolls the active item into view on keyboard navigation.
Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;

// The Pointer Capture API isn't implemented in jsdom, and Radix's Select calls
// `hasPointerCapture` on pointerdown. Without these the dropdown never opens —
// it throws `target.hasPointerCapture is not a function` and the trigger stays
// at `data-state="closed"`, so any test that tries to pick an option fails on a
// missing element rather than on the thing it meant to assert.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false) as unknown as typeof Element.prototype.hasPointerCapture;
  Element.prototype.setPointerCapture = vi.fn() as unknown as typeof Element.prototype.setPointerCapture;
  Element.prototype.releasePointerCapture = vi.fn() as unknown as typeof Element.prototype.releasePointerCapture;
}
