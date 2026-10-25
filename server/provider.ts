import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ServerConfig } from './config';
import { HttpError } from './config';
import type { State } from '../src/domain/model';
import { CLOUD_FORMAT } from '../src/application/cloud-contract';

export interface Tokens { access: string; refresh: string; tokenExpires: number }
export interface Identity { id: string; email: string; confirmed: boolean; mfaEnrolled?: boolean }
export interface Snapshot { revision: number; format: number; document: unknown }
export interface CloudStore {
  read(userId: string, since?: number): Promise<Snapshot | null>;
  commit(userId: string, revision: number, state: State, sessionId: string): Promise<number | null>;
  createSession(id: string, userId: string, expires: number): Promise<void>;
  sessionActive(id: string, userId: string): Promise<boolean>;
  revokeSession(id: string | null, userId: string): Promise<void>;
  rateLimit(bucket: string, limit: number, seconds: number): Promise<boolean>;
}
export interface AuthProvider {
  login(email: string, password: string): Promise<Tokens>;
  refresh(token: string): Promise<Tokens>;
  identity(access: string): Promise<Identity>;
  logout(access: string): Promise<void>;
  recover(email: string): Promise<void>;
  reset(email: string, code: string, password: string, beforeChange: (identity: Identity) => Promise<void>): Promise<Identity>;
}
function failure(error: unknown): never {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
  throw new HttpError(status === 429 ? 429 : status >= 500 || status === 0 ? 503 : 401, status === 429 ? 'Aguarde alguns minutos antes de tentar novamente.' : status >= 500 || status === 0 ? 'O serviço de acesso está temporariamente indisponível.' : 'Não foi possível entrar. Confira os dados ou recupere sua senha.');
}
function identity(user: { id: string; email?: string; email_confirmed_at?: string; factors?: { status: string }[] }): Identity {
  return { id: user.id, email: user.email ?? '', confirmed: !!user.email_confirmed_at, mfaEnrolled: user.factors?.some(factor => factor.status === 'verified') ?? false };
}
export function providers(config: ServerConfig): { auth: AuthProvider; store: CloudStore } {
  const options = { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) }) }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  // Separate clients: signing in must never replace the database service credential.
  const auth = createClient(config.supabaseUrl, config.publishableKey, options);
  const database = createClient(config.supabaseUrl, config.secretKey, options);
  const tokens = (session: { access_token: string; refresh_token: string; expires_at?: number } | null): Tokens => {
    if (!session?.expires_at) throw new HttpError(401, 'A sessão não pôde ser confirmada.');
    return { access: session.access_token, refresh: session.refresh_token, tokenExpires: session.expires_at * 1000 };
  };
  return { auth: {
    async login(email, password) { const result = await auth.auth.signInWithPassword({ email, password }); if (result.error) failure(result.error); return tokens(result.data.session); },
    async refresh(refresh_token) { const result = await auth.auth.refreshSession({ refresh_token }); if (result.error) failure(result.error); return tokens(result.data.session); },
    async identity(access) { const result = await auth.auth.getUser(access); if (result.error || !result.data.user) failure(result.error); return identity(result.data.user); },
    async logout(access) {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', redirect: 'error', headers: { apikey: config.publishableKey, Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10000) });
      if (!response.ok && response.status !== 401) throw new Error('Provider logout unavailable');
    },
    async recover(email) { const result = await auth.auth.resetPasswordForEmail(email); if (result.error) failure(result.error); },
    async reset(email, token, password, beforeChange) {
      const verified = await auth.auth.verifyOtp({ email, token, type: 'recovery' }); if (verified.error || !verified.data.user) failure(verified.error);
      if (!verified.data.session) throw new HttpError(401, 'Não foi possível confirmar a recuperação.');
      const checked = await auth.auth.getUser(verified.data.session.access_token); if (checked.error || !checked.data.user) failure(checked.error);
      const user = identity(checked.data.user); if (user.id !== config.ownerId || !user.confirmed) throw new HttpError(401, 'Não foi possível confirmar a recuperação.');
      await beforeChange(user);
      const updated = await auth.auth.updateUser({ password }); if (updated.error) failure(updated.error);
      await auth.auth.signOut({ scope: 'global' }); return user;
    },
  }, store: new SupabaseStore(database) };
}
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
function storeError(error: unknown): asserts error is null { if (error) throw new HttpError(503, 'Não foi possível acessar os dados na nuvem. Tente novamente sem limpar seus registros.'); }
class SupabaseStore implements CloudStore {
  constructor(private readonly client: SupabaseClient) {}
  async read(userId: string, since?: number): Promise<Snapshot | null> {
    const opened = await this.client.rpc('dexfin_open', { p_user_id: userId }); storeError(opened.error);
    const meta = await this.client.from('dexfin_state').select('revision,format_version').eq('user_id', userId).single(); storeError(meta.error);
    const revision = revisionSchema.parse(meta.data.revision);
    if (since === revision) return null;
    const result = await this.client.from('dexfin_state').select('revision,format_version,document').eq('user_id', userId).single(); storeError(result.error);
    return { revision: revisionSchema.parse(result.data.revision), format: result.data.format_version, document: result.data.document };
  }
  async commit(userId: string, revision: number, state: State, sessionId: string) {
    const result = await this.client.rpc('dexfin_commit', { p_user_id: userId, p_session_id: sessionId, p_expected: revision, p_document: state, p_format: CLOUD_FORMAT }); storeError(result.error);
    return result.data === null ? null : revisionSchema.parse(result.data);
  }
  async createSession(id: string, userId: string, expires: number) { const result = await this.client.from('dexfin_sessions').insert({ id, user_id: userId, expires_at: new Date(expires).toISOString() }); storeError(result.error); }
  async sessionActive(id: string, userId: string) {
    const result = await this.client.from('dexfin_sessions').select('expires_at,revoked_at').eq('id', id).eq('user_id', userId).maybeSingle(); storeError(result.error);
    return !!result.data && !result.data.revoked_at && Date.parse(result.data.expires_at) > Date.now();
  }
  async revokeSession(id: string | null, userId: string) {
    let query = this.client.from('dexfin_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId);
    if (id) query = query.eq('id', id); const result = await query; storeError(result.error);
  }
  async rateLimit(bucket: string, limit: number, seconds: number) { const result = await this.client.rpc('dexfin_rate_limit', { p_bucket: bucket, p_limit: limit, p_seconds: seconds }); storeError(result.error); return result.data === true; }
}
