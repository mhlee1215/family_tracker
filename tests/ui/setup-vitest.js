import { beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve('app/index.html'), 'utf8');
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const bodyHtml = (bodyMatch ? bodyMatch[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '');

beforeEach(() => {
  document.body.innerHTML = bodyHtml;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/app/');
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue(undefined) },
  });
});
