// Test-only loopback server. Not imported by api/ or included in the site output.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createHandler } from './handler';
import { TestAuth, TestStore, testConfig, TEST_PASSWORD } from './test-support';
import type { ApiRequest } from './http';
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Test server is forbidden in production');
const port = 4186, config = testConfig(`http://127.0.0.1:${port}`), store = new TestStore(), auth = new TestAuth();
const handler = createHandler(() => ({ config, store, auth }));
const root = resolve('dist-cloud');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', config.origin);
  if (url.pathname === '/__test/reset' && request.method === 'POST') { store.snapshots.clear(); store.sessions.clear(); store.limits.clear(); auth.password = TEST_PASSWORD; response.end('ok'); return; }
  if (url.pathname === '/api/auth' || url.pathname === '/api/finance') { await handler(url.pathname.endsWith('/auth') ? 'auth' : 'finance', request as ApiRequest, response); return; }
  try {
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) { response.statusCode = 404; response.end(); return; }
    const data = await readFile(path); response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream'); response.setHeader('Cache-Control', 'no-cache'); response.end(data);
  } catch { response.statusCode = 404; response.end(); }
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
