import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { handleNodeApi } from './src/server/api/handler.js';
import { getMediaStorageConfig } from './src/server/media-config.js';
import { getStorageConfig } from './src/server/db/store-factory.js';

const port = Number(process.env.PORT || 4174);
const root = resolve('.');
loadEnv();
const storageConfig = getStorageConfig();
const mediaStorageConfig = getMediaStorageConfig();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  if (request.url?.startsWith('/api/')) {
    await handleNodeApi(request, response);
    return;
  }

  const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
  const requestedPath = requestUrl.pathname;
  const filePath = resolveRequestPath(request.url || '/');
  const isClientRoute = !extname(requestedPath);
  if ((!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) && isClientRoute) {
    const indexPath = resolveRequestPath('/');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    createReadStream(indexPath).pipe(response);
    return;
  }
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Family Tracker running at http://localhost:${port}`);
  console.log(`Storage provider: ${storageConfig.provider}`);
  console.log(`Media storage provider: ${mediaStorageConfig.provider}${mediaStorageConfig.configured ? '' : ' (not configured)'}`);
});

function resolveRequestPath(url) {
  const parsedUrl = new URL(url, `http://localhost:${port}`);
  const pathname = parsedUrl.pathname === '/' ? '/app/index.html' : parsedUrl.pathname;
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
