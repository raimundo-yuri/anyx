import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { commandSchema, emptyState, stateSchema, type State } from '../src/domain/model';
import { execute } from '../src/domain/engine';
import { assertState } from '../src/domain/integrity';
import { FinanceError } from '../src/domain/errors';
import { localToday } from '../src/application/finance-view';
import { CLOUD_FORMAT, MAX_CLOUD_BATCH, MAX_CLOUD_STATE_BYTES } from '../src/application/cloud-contract';
import { serverConfig, HttpError, type ServerConfig } from './config';
import { providers, type AuthProvider, type CloudStore, type Identity, type Snapshot } from './provider';
import { equalToken, randomToken, sessionCookie, SESSION_MS, unsealSession, type Session } from './session';
import { body, headers, json, mutationOrigin, type ApiRequest } from './http';

const email = z.email().max(254), password = z.string().min(1).max(256);
const login = z.strictObject({ email, password });
const recover = z.strictObject({ email });
const reset = z.strictObject({ email, code: z.string().regex(/^\d{6,10}$/), password: z.string().min(12).max(256) });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const financeRequest = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('commands'), format: z.literal(CLOUD_FORMAT), commands: z.array(commandSchema).min(1).max(MAX_CLOUD_BATCH), expectedHash: hash.optional() }),
  z.strictObject({ action: z.literal('replace'), format: z.literal(CLOUD_FORMAT), state: stateSchema, expectedHash: hash }),
]);
export const stateHash = (state: State) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
type Runtime = { config: ServerConfig; auth: AuthProvider; store: CloudStore };
export function createHandler(runtime?: () => Runtime) {
  return async (route: 'auth' | 'finance', request: ApiRequest, response: ServerResponse) => {
    headers(response);
    try {
      const context = runtime ? runtime() : (() => { const config = serverConfig(); return { config, ...providers(config) }; })();
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Solicitação de outra origem recusada.');
      if (request.method === 'POST') mutationOrigin(request, context.config);
      else if (request.method !== 'GET') { response.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Método não permitido.'); }
      if (route === 'auth') await authRoute(context, request, response); else await financeRoute(context, request, response);
    } catch (reason) {
      const status = reason instanceof HttpError ? reason.status : reason instanceof FinanceError ? 422 : reason instanceof z.ZodError ? 400 : 503;
      const message = reason instanceof HttpError || reason instanceof FinanceError ? reason.message : reason instanceof z.ZodError ? 'Revise os campos e os limites desta solicitação.' : 'O serviço está temporariamente indisponível. Tente novamente sem alterar os campos.';
      json(response, status, { error: message });
    }
  };
}
function authorizeIdentity(user: Identity, config: ServerConfig) {
  if (user.id !== config.ownerId || !user.confirmed) throw new HttpError(401, 'Não foi possível autorizar esta conta. Confira seu acesso.');
  // Never silently bypass a factor enrolled outside this application.
  if (user.mfaEnrolled) throw new HttpError(401, 'Esta conta exige verificação em duas etapas. Este fluxo ainda não é aceito pelo DexFin; nenhum dado foi liberado.');
}
async function authenticated(context: Runtime, request: ApiRequest, response: ServerResponse): Promise<{ session: Session; user: Identity }> {
  let session = unsealSession(request.headers.cookie, context.config);
  if (!session || !await context.store.sessionActive(session.id, context.config.ownerId)) throw new HttpError(401, 'Sua sessão terminou. Entre novamente.');
  if (!equalToken(typeof request.headers['x-dexfin-csrf'] === 'string' ? request.headers['x-dexfin-csrf'] : undefined, session.csrf) && request.method === 'POST') throw new HttpError(403, 'A confirmação de segurança mudou. Recarregue o aplicativo.');
  if (session.tokenExpires < Date.now() + 60000) { session = { ...session, ...await context.auth.refresh(session.refresh) }; response.setHeader('Set-Cookie', sessionCookie(session, context.config)); }
  const user = await context.auth.identity(session.access); authorizeIdentity(user, context.config);
  return { session, user };
}
async function throttle(context: Runtime, action: string, address: string) {
  const digest = createHmac('sha256', context.config.sessionKey).update(address.trim().toLowerCase()).digest('hex');
  if (!await context.store.rateLimit(`global:${action}`, 20, 900) || !await context.store.rateLimit(`${action}:${digest}`, 6, 900)) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
}
async function authRoute(context: Runtime, request: ApiRequest, response: ServerResponse) {
  const action = new URL(request.url ?? '/', context.config.origin).searchParams.get('action') ?? 'session';
  if (request.method === 'GET') {
    if (action !== 'session') throw new HttpError(405, 'Use o formulário do aplicativo.');
    try { const { session, user } = await authenticated(context, request, response); json(response, 200, { authenticated: true, email: user.email, csrf: session.csrf, expires: session.expires }); }
    catch (reason) { if (!(reason instanceof HttpError) || reason.status !== 401) throw reason; response.setHeader('Set-Cookie', sessionCookie(null, context.config)); json(response, 200, { authenticated: false }); }
    return;
  }
  if (action === 'login') {
    const data = login.parse(await body(request)); await throttle(context, 'login', data.email);
    const tokens = await context.auth.login(data.email, data.password), user = await context.auth.identity(tokens.access); authorizeIdentity(user, context.config);
    const previous = unsealSession(request.headers.cookie, context.config); if (previous) await context.store.revokeSession(previous.id, user.id);
    const session: Session = { ...tokens, id: randomToken(), csrf: randomToken(), expires: Date.now() + SESSION_MS };
    await context.store.createSession(session.id, user.id, session.expires);
    response.setHeader('Set-Cookie', sessionCookie(session, context.config)); json(response, 200, { authenticated: true, email: user.email, csrf: session.csrf, expires: session.expires }); return;
  }
  if (action === 'recover') {
    const data = recover.parse(await body(request)); await throttle(context, 'recovery', data.email);
    await context.auth.recover(data.email); json(response, 202, { message: 'Se o endereço estiver autorizado, o serviço enviará um código. Confira também a pasta de spam.' }); return;
  }
  if (action === 'reset') {
    const data = reset.parse(await body(request)); await throttle(context, 'reset', data.email);
    const user = await context.auth.reset(data.email, data.code, data.password, async identity => { authorizeIdentity(identity, context.config); await context.store.revokeSession(null, identity.id); }); authorizeIdentity(user, context.config); response.setHeader('Set-Cookie', sessionCookie(null, context.config)); json(response, 200, { authenticated: false }); return;
  }
  if (action === 'logout' || action === 'logoutAll') {
    const { user, session } = await authenticated(context, request, response);
    await context.store.revokeSession(action === 'logoutAll' ? null : session.id, user.id);
    response.setHeader('Set-Cookie', sessionCookie(null, context.config));
    try { await context.auth.logout(session.access); } catch { /* App registry already prevents replay of the revoked session. */ }
    json(response, 200, { authenticated: false }); return;
  }
  throw new HttpError(404, 'Ação não encontrada.');
}
function decoded(snapshot: Snapshot) {
  if (snapshot.format !== CLOUD_FORMAT) throw new HttpError(409, 'Atualize o aplicativo antes de acessar este formato de dados.');
  const state = snapshot.document === null ? emptyState() : stateSchema.parse(snapshot.document); assertState(state); return state;
}
function withinLimit(state: State) { if (Buffer.byteLength(JSON.stringify(state)) > MAX_CLOUD_STATE_BYTES) throw new HttpError(413, 'A base excede o limite inicial de 2 MiB da nuvem. Nenhum registro foi gravado.'); }
async function financeRoute(context: Runtime, request: ApiRequest, response: ServerResponse) {
  const { user, session } = await authenticated(context, request, response);
  if (request.method === 'GET') {
    const raw = new URL(request.url ?? '/', context.config.origin).searchParams.get('since');
    const since = raw === null ? undefined : z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(raw);
    const snapshot = await context.store.read(user.id, since);
    if (!snapshot) { json(response, 304); return; }
    json(response, 200, { format: CLOUD_FORMAT, revision: snapshot.revision, state: decoded(snapshot) }); return;
  }
  const data = financeRequest.parse(await body(request));
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await context.store.read(user.id); if (!snapshot) throw new HttpError(503, 'Não foi possível consultar os dados.');
    let state = decoded(snapshot); const originalHash = stateHash(state);
    if (data.action === 'replace') {
      assertState(data.state);
      if (stateHash(data.state) === originalHash) { json(response, 200, { format: CLOUD_FORMAT, revision: snapshot.revision, state }); return; }
      if (data.expectedHash !== originalHash) throw new HttpError(409, 'Os dados mudaram em outro dispositivo. Revise a prévia novamente.');
      state = data.state;
    } else {
      const allReplayed = data.commands.every(command => state.receipts.some(item => item.id === command.key && item.payload === JSON.stringify(command)));
      if (data.expectedHash && data.expectedHash !== originalHash && !allReplayed) throw new HttpError(409, 'Os dados mudaram em outro dispositivo. Recalcule e revise a prévia.');
      const results = [];
      for (const command of data.commands) {
        const planned = command.type === 'createForecast' || (command.type === 'settleForecast' && command.action === 'cancel');
        if (!planned && 'date' in command && command.date > localToday(context.config.timeZone)) throw new FinanceError('Confirme somente fatos realizados até hoje.');
        const result = execute(state, command, { now: new Date().toISOString(), newId: randomUUID }); state = result.state;
        results.push({ resultId: result.resultId, replayed: result.replayed });
      }
      if (results.every(item => item.replayed)) { json(response, 200, { format: CLOUD_FORMAT, revision: snapshot.revision, state, results }); return; }
      withinLimit(state);
      const revision = await context.store.commit(user.id, snapshot.revision, state, session.id);
      if (revision !== null) { json(response, 200, { format: CLOUD_FORMAT, revision, state, results }); return; }
      continue;
    }
    withinLimit(state); const revision = await context.store.commit(user.id, snapshot.revision, state, session.id);
    if (revision !== null) { json(response, 200, { format: CLOUD_FORMAT, revision, state }); return; }
  }
  throw new HttpError(409, 'Outro dispositivo atualizou os dados. Tente novamente com os mesmos campos.');
}
