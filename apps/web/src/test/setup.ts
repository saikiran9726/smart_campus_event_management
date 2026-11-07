
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();

  try {
    globalThis.localStorage?.clear();
  } catch {
    // Ignore unavailable storage
  }
});

// Polyfill localStorage for Node 22+/26+ where
// globalThis.localStorage may be unavailable without --localstorage-file.
const createMockStorage = (): Storage => {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,

    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },

    removeItem: (key: string) => {
      store.delete(key);
    },

    clear: () => {
      store.clear();
    },

    key: (index: number) => Array.from(store.keys())[index] ?? null,

    get length() {
      return store.size;
    },
  };
};

// Safely obtain browser storage or fall back to mock storage.
let storageInstance: Storage;

try {
  const browserStorage =
    typeof window !== 'undefined'
      ? window.localStorage
      : undefined;

  storageInstance = browserStorage ?? createMockStorage();
} catch {
  storageInstance = createMockStorage();
}

// Install the same storage instance on globalThis and window.
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageInstance,
    writable: true,
    configurable: true,
  });

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storageInstance,
      writable: true,
      configurable: true,
    });
  }
} catch {
  // Ignore if the property is non-configurable.
}

// Polyfill window.matchMedia.
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
});

// Polyfill HTMLCanvasElement.getContext for axe-core in jsdom.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: new Array(4) }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// Polyfill ResizeObserver.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill IntersectionObserver.
global.IntersectionObserver = class IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  observe() {}
  unobserve() {}
  disconnect() {}

  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

// Polyfill Cloudflare Turnstile for jsdom
if (typeof window !== 'undefined') {
  (window as any).turnstile = {
    render: () => 'mock-turnstile-widget-id',
    remove: () => {},
    reset: () => {},
  };
}
