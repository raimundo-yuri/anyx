// @vitest-environment node
import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createHandler, stateHash } from './handler';
import { TestAuth, TestStore, TEST_EMAIL, TEST_OWNER, TEST_OTHER, TEST_PASSWORD, testConfig } from './test-support';
import { sessionCookie, unsealSession } from './session';
import type { ApiRequest } from './http';
import { emptyState } from '../src/domain/model';
import { CLOUD_FORMAT } from '../src/application/cloud-contract';

function setup() {
  const config = testConfig(), auth = new TestAuth(), store = new TestStore(), handle = createHandler(() => ({ config, auth, store }));
  async function request(route: 'auth' | 'finance', method: 'GET' | 'POST', data?: unknown, options: { cookie?: string; csrf?: string; origin?: string; action?: string; since?: number } = {}) {
    const req = Object.assign(Readable.from([]), { method, url: `/api/${route}${options.action ? `?action=${options.action}` : options.since === undefined ? '' : `?since=${options.since}`}`, body: data,
      headers: { origin: options.origin ?? config.origin, 'content-type': 'application/json', 'x-dexfin-client': '1', ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.csrf ? { 'x-dexfin-csrf': options.csrf } : {}) } }) as unknown as ApiRequest;
    const headers = new Map<string, string>(); let text = '';
    const res = { statusCode: 200, setHeader: (key: string, value: string) => headers.set(key.toLowerCase(), value), end: (body: string) => { text = body; } } as unknown as ServerResponse;
    await handle(route, req, res); return { status: res.statusCode, headers, data: text ? JSON.parse(text) : null };
  }
  async function login() { const response = await request('auth', 'POST', { email: TEST_EMAIL, password: TEST_PASSWORD }, { action: 'login' }); return { cookie: response.headers.get('set-cookie')!, csrf: response.data.csrf, response }; }
  return { config, auth, store, request, login };
}
describe('API autenticada', () => {
  it('recusa leitura/gravação sem sessão e não expõe dados nem erros internos', async () => {
    const f = setup(); const response = await f.request('finance', 'GET'); expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store'); expect(JSON.stringify(response.data)).not.toContain('test-secret');
    expect((await f.request('finance', 'POST', { action: 'replace' })).status).toBe(401);
  });
  it('cookie é criptografado, HttpOnly, Secure e host-only; adulteração não autentica', async () => {
    const f = setup(), login = await f.login(); expect(login.response.status).toBe(200);
    expect(login.cookie).toContain('__Host-dexfin='); expect(login.cookie).toContain('HttpOnly'); expect(login.cookie).toContain('Secure'); expect(login.cookie).toContain('SameSite=Strict'); expect(login.cookie).not.toContain('Domain='); expect(login.cookie).not.toContain('test-access');
    expect((await f.request('finance', 'GET', undefined, login)).status).toBe(200);
    const value = login.cookie.split(';')[0]; const tampered = value.slice(0, -2) + (value.endsWith('aa') ? 'bb' : 'aa');
    expect((await f.request('finance', 'GET', undefined, { cookie: tampered })).status).toBe(401);
  });
  it('bloqueia origem externa, token CSRF errado e conta diferente do proprietário', async () => {
    const f = setup(), login = await f.login();
    expect((await f.request('finance', 'POST', {}, { ...login, origin: 'https://attacker.example' })).status).toBe(403);
    expect((await f.request('finance', 'POST', {}, { ...login, csrf: 'a'.repeat(64) })).status).toBe(403);
    f.auth.userId = TEST_OTHER; expect((await f.request('finance', 'GET', undefined, login)).status).toBe(401);
    const other = setup(); other.auth.confirmed = false; expect((await other.login()).response.status).toBe(401);
  });
  it('aplica comandos no servidor, preserva idempotência e não confia em IDs de usuário enviados', async () => {
    const f = setup(), login = await f.login(), key = crypto.randomUUID(), id = crypto.randomUUID();
    const data = { action: 'commands', format: CLOUD_FORMAT, commands: [{ key, type: 'createAccount', id, name: 'Conta remota', date: '2026-01-01', openingBalance: 10000 }] };
    const first = await f.request('finance', 'POST', data, login); expect(first.status).toBe(200); expect(first.data.state.accounts).toHaveLength(1);
    const retry = await f.request('finance', 'POST', data, login); expect(retry.status).toBe(200); expect(retry.data.revision).toBe(first.data.revision); expect(retry.data.results[0].replayed).toBe(true);
    expect((await f.request('finance', 'POST', { ...data, userId: TEST_OTHER }, login)).status).toBe(400); expect(f.store.snapshots.has(TEST_OTHER)).toBe(false);
    expect((await f.request('finance', 'GET', undefined, { ...login, since: first.data.revision })).status).toBe(304);
  });
  it('não ignora um segundo fator já cadastrado no provedor', async () => {
    const f = setup(), session = await f.login(); f.auth.mfaEnrolled = true;
    expect((await f.login()).response.status).toBe(401);
    expect((await f.request('finance', 'GET', undefined, session)).status).toBe(401);
    expect((await f.request('auth', 'POST', { email: TEST_EMAIL, code: '123456', password: 'nova-senha-segura-123' }, { action: 'reset' })).status).toBe(401);
    expect(f.auth.password).toBe(TEST_PASSWORD);
  });
  it('lote com segunda operação inválida não grava a primeira', async () => {
    const f = setup(), login = await f.login();
    const result = await f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: [
      { key: crypto.randomUUID(), type: 'createPerson', id: crypto.randomUUID(), name: 'Não deve persistir' },
      { key: crypto.randomUUID(), type: 'reverseMovement', operationId: crypto.randomUUID(), reason: 'Inexistente' },
    ] }, login);
    expect(result.status).toBe(422); expect((await f.request('finance', 'GET', undefined, login)).data.state.people).toEqual([]);
  });
  it('prévia e restauração recusam estado alterado por outro dispositivo', async () => {
    const f = setup(), login = await f.login(), expectedHash = stateHash(emptyState());
    await f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: [{ key: crypto.randomUUID(), type: 'createPerson', id: crypto.randomUUID(), name: 'Primeira' }] }, login);
    expect((await f.request('finance', 'POST', { action: 'replace', format: CLOUD_FORMAT, state: emptyState(), expectedHash }, login)).status).toBe(409);
    expect((await f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: [{ key: crypto.randomUUID(), type: 'createPerson', id: crypto.randomUUID(), name: 'Segunda' }], expectedHash }, login)).status).toBe(409);
  });
  it('conflito de revisão é reavaliado sem perder o comando nem duplicar registros', async () => {
    const f = setup(), login = await f.login(); f.store.forceConflict = true;
    const result = await f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: [{ key: crypto.randomUUID(), type: 'createPerson', id: crypto.randomUUID(), name: 'Única' }] }, login);
    expect(result.status).toBe(200); expect(result.data.state.people).toHaveLength(1); expect(result.data.revision).toBe(1);
  });
  it('duas gravações simultâneas preservam as duas ações sem sobrescrever a base', async () => {
    const f = setup(), first = await f.login(), second = await f.login();
    const responses = await Promise.all([first, second].map((session, index) => f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: [{ key: crypto.randomUUID(), type: 'createPerson', id: crypto.randomUUID(), name: `Pessoa ${index}` }] }, session)));
    expect(responses.map(item => item.status)).toEqual([200, 200]);
    const latest = await f.request('finance', 'GET', undefined, first); expect(latest.data.state.people).toHaveLength(2); expect(latest.data.revision).toBe(2);
  });
  it('limites de corpo/lote e data futura são recusados sem gravar parcialmente', async () => {
    const f = setup(), session = await f.login();
    expect((await f.request('finance', 'POST', { padding: 'a'.repeat(3 * 1024 * 1024) }, session)).status).toBe(413);
    const command = { key: crypto.randomUUID(), type: 'createPerson', id: crypto.randomUUID(), name: 'Não gravar' };
    expect((await f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: Array.from({ length: 101 }, () => command) }, session)).status).toBe(400);
    expect((await f.request('finance', 'POST', { action: 'commands', format: CLOUD_FORMAT, commands: [{ key: crypto.randomUUID(), type: 'createAccount', id: crypto.randomUUID(), name: 'Futura', date: '2999-01-01', openingBalance: 100 }] }, session)).status).toBe(422);
    const state = (await f.request('finance', 'GET', undefined, session)).data.state; expect(state.people).toHaveLength(0); expect(state.accounts).toHaveLength(0);
  });
  it('sair revoga imediatamente o cookie antigo mesmo sem sucesso no logout do provedor', async () => {
    const f = setup(), login = await f.login(); f.auth.logout = async () => { throw new Error('Sem rede externa'); };
    expect((await f.request('auth', 'POST', {}, { ...login, action: 'logout' })).status).toBe(200);
    expect((await f.request('finance', 'GET', undefined, login)).status).toBe(401);
  });
  it('expiração e renovação mantêm limite absoluto de oito horas', async () => {
    const f = setup(), login = await f.login(), session = unsealSession(login.cookie, f.config)!;
    const cookie = sessionCookie({ ...session, tokenExpires: Date.now() - 1 }, f.config);
    const refreshed = await f.request('auth', 'GET', undefined, { cookie }); expect(refreshed.status).toBe(200); expect(f.auth.refreshes).toBe(1);
    expect(unsealSession(refreshed.headers.get('set-cookie'), f.config)!.expires).toBe(session.expires);
    expect((await f.request('finance', 'GET', undefined, { cookie: sessionCookie({ ...session, expires: Date.now() - 1 }, f.config) })).status).toBe(401);
  });
  it('recuperação com código válido revoga todas as sessões antes de alterar a senha', async () => {
    const f = setup(), first = await f.login(), second = await f.login();
    expect((await f.request('auth', 'POST', { email: TEST_EMAIL, code: '999999', password: 'nova-senha-segura-123' }, { action: 'reset' })).status).toBe(401);
    expect((await f.request('finance', 'GET', undefined, first)).status).toBe(200);
    expect((await f.request('auth', 'POST', { email: TEST_EMAIL, code: '123456', password: 'nova-senha-segura-123' }, { action: 'reset' })).status).toBe(200);
    expect((await f.request('finance', 'GET', undefined, first)).status).toBe(401); expect((await f.request('finance', 'GET', undefined, second)).status).toBe(401);
    expect(f.auth.password).toBe('nova-senha-segura-123');
  });
  it('limita tentativas no banco sem armazenar e-mail ou senha nas chaves', async () => {
    const f = setup();
    for (let index = 0; index < 6; index++) expect((await f.request('auth', 'POST', { email: TEST_EMAIL, password: 'errada' }, { action: 'login' })).status).toBe(401);
    expect((await f.request('auth', 'POST', { email: TEST_EMAIL, password: 'errada' }, { action: 'login' })).status).toBe(429);
    expect([...f.store.limits.keys()].join('')).not.toContain(TEST_EMAIL); expect([...f.store.limits.keys()].join('')).not.toContain(TEST_PASSWORD);
    expect(f.store.sessions.size).toBe(0); expect(f.config.ownerId).toBe(TEST_OWNER);
  });
});
