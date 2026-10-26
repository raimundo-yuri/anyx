import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Load emitted production entrypoints with native Node ESM, without Vite/tsx.
const script = `
  import assert from 'node:assert/strict';
  import { Readable } from 'node:stream';
  for (const route of ['auth', 'finance']) {
    const { default: handler } = await import('./.server-build/api/' + route + '.js');
    const request = Object.assign(Readable.from([]), { method: 'GET', url: '/api/' + route, headers: {} });
    const headers = new Map(); let text = '';
    const response = { statusCode: 200, setHeader: (key, value) => headers.set(key.toLowerCase(), value), end: body => { text = body; } };
    await handler(request, response);
    assert.equal(response.statusCode, process.env.APP_ORIGIN ? (route === 'auth' ? 200 : 401) : 503);
    const body = JSON.parse(text);
    if (process.env.APP_ORIGIN && route === 'auth') assert.equal(body.authenticated, false);
    else assert.equal(typeof body.error, 'string');
    assert.match(headers.get('cache-control'), /no-store/);
  }
`;
for (const configured of [false, true]) {
  test(`native production API entrypoints: ${configured ? 'anonymous session' : 'missing configuration fails closed'}`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 20000,
      env: { NODE_ENV: 'production', ...(configured ? {
        APP_ORIGIN: 'https://dexfin.example.test', SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'test-public-key-not-real', SUPABASE_SECRET_KEY: 'test-secret-key-not-real',
        DEXFIN_OWNER_ID: '10000000-0000-4000-8000-000000000001', SESSION_SECRET: Buffer.alloc(32, 7).toString('base64url'),
      } : {}) },
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}
