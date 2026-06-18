import { beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve('app/index.html'), 'utf8');
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const bodyHtml = (bodyMatch ? bodyMatch[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '');

beforeEach(() => {
  document.body.innerHTML = bodyHtml;
  if (!window.localStorage) {
    const store = new Map();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key) => store.get(String(key)) ?? null,
        key: (index) => Array.from(store.keys())[index] ?? null,
        removeItem: (key) => store.delete(String(key)),
        setItem: (key, value) => store.set(String(key), String(value)),
        get length() {
          return store.size;
        },
      },
    });
  }
  window.localStorage.clear();
  window.history.replaceState({}, '', '/app/');
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue(undefined) },
  });
});
