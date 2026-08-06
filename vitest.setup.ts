import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library only auto-registers cleanup when test globals exist;
// vitest runs without globals, so unmount between tests explicitly.
afterEach(cleanup);

// Node 25 ships its own globalThis.localStorage (method-less without
// --localstorage-file), which shadows jsdom's. Replace it with a working
// in-memory Storage so theme persistence is testable.
if (typeof window !== "undefined") {
  const store = new Map<string, string>();
  const storageStub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storageStub,
  });
}

// jsdom has no matchMedia; provide a light-preferring stub for the theme
// hook. (Guarded: worker/shared tests run in node with no window at all.)
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}
