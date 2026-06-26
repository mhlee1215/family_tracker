import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, '.cloudflare-pages');
const clientModules = [
  ['src', 'domain', 'care-forecast.js'],
  ['src', 'domain', 'feeding-guidance.js'],
  ['src', 'domain', 'summary-builder.js'],
  ['src', 'utils', 'tracker-colors.js'],
];

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(join(root, 'app'), join(outputDir, 'app'), { recursive: true });
cpSync(join(root, 'app', 'index.html'), join(outputDir, 'index.html'));
cpSync(join(root, 'app', 'sw.js'), join(outputDir, 'sw.js'));
for (const modulePath of clientModules) {
  mkdirSync(join(outputDir, ...modulePath.slice(0, -1)), { recursive: true });
  cpSync(join(root, ...modulePath), join(outputDir, ...modulePath));
}
for (const route of ['baby', 'tasks', 'meals', 'fund']) {
  mkdirSync(join(outputDir, route), { recursive: true });
  cpSync(join(root, 'app', 'index.html'), join(outputDir, route, 'index.html'));
}

console.log(`Built Cloudflare Pages assets at ${outputDir}`);
