import { z } from 'zod';
import { FinanceError } from '../domain/errors';
const sessionSchema = z.union([z.strictObject({ authenticated: z.literal(false) }), z.strictObject({ authenticated: z.literal(true), email: z.email(), csrf: z.string().regex(/^[a-f0-9]{64}$/), expires: z.number().int() })]);
export type CloudSession = z.infer<typeof sessionSchema>;
const signedOutKey = 'dexfin-cloud-signout-pending';
let current: CloudSession | null = null, generation = 0;
let networkQueue: Promise<unknown> = Promise.resolve();
let logoutNotice = '';
export const cloudLogoutNotice = () => logoutNotice;
const listeners = new Set<(session: CloudSession | null) => void>();
const resetters = new Set<() => void>();
export const authGeneration = () => generation;
export const cloudSession = () => current;
export function onCloudSession(listener: (session: CloudSession | null) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function onCloudClear(listener: () => void) { resetters.add(listener); return () => { resetters.delete(listener); }; }
function setSession(next: CloudSession) {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  generation++; current = next;
  for (const reset of resetters) reset();
  for (const listener of listeners) listener(current);
}
function pendingLogout() { try { return !!localStorage.getItem(signedOutKey); } catch { return false; } }
function markLogout(pending: boolean, all = false) { try { if (pending) localStorage.setItem(signedOutKey, all ? 'all' : 'local'); else localStorage.removeItem(signedOutKey); } catch { /* No financial data or tokens are stored in this marker. */ } }
export function cloudRequest(path: string, data?: unknown, csrf?: string): Promise<Response> {
  const started = generation;
  const work = async () => {
  if (path.startsWith('/api/finance') && started !== generation) throw new FinanceError('Sua sessão mudou. Revise os dados novamente.');
  let response: Response;
  try {
    response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-DexFin-Client': '1' }), ...((csrf ?? (current?.authenticated ? current.csrf : undefined)) ? { 'X-DexFin-CSRF': csrf ?? (current?.authenticated ? current.csrf : '') } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(25000) });
  } catch { throw new FinanceError('Sem conexão com a nuvem. Nada será salvo neste navegador. Reconecte e tente novamente com os mesmos campos.'); }
  if (response.status === 401 && started === generation && path.startsWith('/api/finance')) setSession({ authenticated: false });
  if (!response.ok && response.status !== 304) {
    let message = 'Não foi possível confirmar a solicitação na nuvem. Tente novamente.';
    try { const body = await response.json(); if (typeof body.error === 'string' && body.error.length < 800) message = body.error; } catch { /* Platform errors must not leak HTML or internal details. */ }
    throw new FinanceError(message);
  }
  return response;
  };
  const result = networkQueue.then(work); networkQueue = result.catch(() => undefined); return result;
}
export async function checkCloudSession() {
  const started = generation;
  const response = sessionSchema.parse(await (await cloudRequest('/api/auth?action=session')).json());
  if (started !== generation) return;
  if (pendingLogout()) {
    if (response.authenticated) { let all = false; try { all = localStorage.getItem(signedOutKey) === 'all'; } catch {} await cloudRequest(`/api/auth?action=${all ? 'logoutAll' : 'logout'}`, {}, response.csrf); }
    markLogout(false); logoutNotice = 'Sessão encerrada neste dispositivo.'; setSession({ authenticated: false }); listeners.forEach(next => next(current)); return;
  }
  setSession(response);
}
export async function loginCloud(email: string, password: string) {
  const response = sessionSchema.parse(await (await cloudRequest('/api/auth?action=login', { email, password })).json());
  markLogout(false); logoutNotice = ''; setSession(response);
}
export async function logoutCloud(all = false) {
  const csrf = current?.authenticated ? current.csrf : undefined;
  logoutNotice = 'Concluindo saída do servidor…'; markLogout(true, all); setSession({ authenticated: false });
  try { await cloudRequest(`/api/auth?action=${all ? 'logoutAll' : 'logout'}`, {}, csrf); markLogout(false); logoutNotice = all ? 'Todas as sessões foram encerradas.' : 'Sessão encerrada neste dispositivo.'; }
  catch (reason) { logoutNotice = 'A tela foi fechada. Reconecte para concluir o encerramento da sessão no servidor.'; throw reason; }
  finally { listeners.forEach(next => next(current)); }
}
export function clearCloudFromOtherTab() { if (pendingLogout()) setSession({ authenticated: false }); }
