// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { providers } from './provider';
import { testConfig, TEST_EMAIL, TEST_OWNER, TEST_PASSWORD } from './test-support';
const user = { id: TEST_OWNER, email: TEST_EMAIL, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
const access = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: TEST_OWNER, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString('base64url'), 'testsignature'].join('.');
const tokens = { access_token: access, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
afterEach(() => vi.unstubAllGlobals());
it('SDK verifica a identidade no provedor e mantém a credencial de banco separada do login', async () => {
  const config = testConfig(), requests: { url: URL; headers: Headers; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers); requests.push({ url, headers, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname === '/auth/v1/token') return Response.json(tokens);
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname.endsWith('/dexfin_open')) return Response.json(null);
    if (url.pathname === '/rest/v1/dexfin_state') return Response.json({ revision: 0, format_version: 6, document: null });
    throw new Error(`Unexpected test URL ${url.pathname}`);
  }));
  const provider = providers(config); const session = await provider.auth.login(TEST_EMAIL, TEST_PASSWORD); expect(session.access).toBe(access);
  expect(await provider.auth.identity(access)).toMatchObject({ id: TEST_OWNER, confirmed: true });
  expect(await provider.store.read(TEST_OWNER)).toMatchObject({ revision: 0, format: 6, document: null });
  expect(requests.some(request => request.url.pathname === '/auth/v1/user' && request.headers.get('authorization') === `Bearer ${access}`)).toBe(true);
  const databaseCalls = requests.filter(request => request.url.pathname.startsWith('/rest/'));
  expect(databaseCalls.every(request => request.headers.get('apikey') === config.secretKey)).toBe(true);
  expect(databaseCalls.every(request => request.headers.get('authorization') !== `Bearer ${access}`)).toBe(true);
  expect(databaseCalls.find(request => request.url.pathname.endsWith('/dexfin_open'))!.body).toEqual({ p_user_id: TEST_OWNER });
  expect(databaseCalls.filter(request => request.url.pathname.endsWith('/dexfin_state')).every(request => request.url.searchParams.get('user_id') === `eq.${TEST_OWNER}`)).toBe(true);
});
it('erros do serviço e de senha não expõem respostas internas', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'backend SECRET internal details', error_code: 'invalid_credentials' }, { status: 400 })));
  await expect(providers(testConfig()).auth.login(TEST_EMAIL, 'errada')).rejects.toMatchObject({ status: 401, message: 'Não foi possível entrar. Confira os dados ou recupere sua senha.' });
});
it('consulta fatores verificados na identidade obtida do provedor', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...user, factors: [{ id: 'factor', status: 'verified', factor_type: 'totp' }] })));
  expect(await providers(testConfig()).auth.identity(access)).toMatchObject({ id: TEST_OWNER, mfaEnrolled: true });
});
it('recuperação verifica identidade e revoga as sessões antes de enviar a nova senha ao provedor', async () => {
  const events: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/verify') { events.push('otp'); return Response.json(tokens); }
    if (path === '/auth/v1/user' && init?.method === 'PUT') { events.push('password'); return Response.json(user); }
    if (path === '/auth/v1/user') { events.push('identity'); return Response.json(user); }
    if (path === '/auth/v1/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected test URL ${path}`);
  }));
  await providers(testConfig()).auth.reset(TEST_EMAIL, '123456', 'nova-senha-exclusiva-123', async identity => { expect(identity.id).toBe(TEST_OWNER); events.push('revoke'); });
  expect(events.indexOf('identity')).toBeGreaterThan(events.indexOf('otp'));
  expect(events.indexOf('password')).toBeGreaterThan(events.indexOf('revoke'));
  expect(events.indexOf('revoke')).toBeGreaterThan(events.indexOf('identity'));
});
