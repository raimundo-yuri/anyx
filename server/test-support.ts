import type { State } from '../src/domain/model';
import type { AuthProvider, CloudStore, Identity, Snapshot, Tokens } from './provider';
import type { ServerConfig } from './config';
import { HttpError } from './config';
import { CLOUD_FORMAT } from '../src/application/cloud-contract';
export const TEST_OWNER = '10000000-0000-4000-8000-000000000001';
export const TEST_OTHER = '10000000-0000-4000-8000-000000000002';
export const TEST_EMAIL = 'owner@example.test';
export const TEST_PASSWORD = 'somente-teste-1234';
export function testConfig(origin = 'https://dexfin.example.test'): ServerConfig {
  return { origin, timeZone: 'America/Sao_Paulo', ownerId: TEST_OWNER, sessionKey: Buffer.alloc(32, 7), secure: origin.startsWith('https:'), supabaseUrl: 'https://example.supabase.co', publishableKey: 'test-publishable-not-real', secretKey: 'test-secret-not-real' };
}
export class TestStore implements CloudStore {
  snapshots = new Map<string, Snapshot>();
  sessions = new Map<string, { userId: string; expires: number; revoked: boolean }>();
  limits = new Map<string, { count: number; until: number }>();
  forceConflict = false;
  async read(userId: string, since?: number) {
    const snapshot = this.snapshots.get(userId) ?? { revision: 0, format: CLOUD_FORMAT, document: null }; this.snapshots.set(userId, snapshot);
    return since === snapshot.revision ? null : structuredClone(snapshot);
  }
  async commit(userId: string, revision: number, state: State, sessionId: string) {
    if (this.forceConflict) { this.forceConflict = false; return null; }
    if (!await this.sessionActive(sessionId, userId)) return null;
    const current = this.snapshots.get(userId); if (!current || current.revision !== revision) return null;
    this.snapshots.set(userId, { revision: revision + 1, format: CLOUD_FORMAT, document: structuredClone(state) }); return revision + 1;
  }
  async createSession(id: string, userId: string, expires: number) { this.sessions.set(id, { userId, expires, revoked: false }); }
  async sessionActive(id: string, userId: string) { const session = this.sessions.get(id); return !!session && session.userId === userId && !session.revoked && session.expires > Date.now(); }
  async revokeSession(id: string | null, userId: string) { for (const [key, session] of this.sessions) if (session.userId === userId && (id === null || key === id)) session.revoked = true; }
  async rateLimit(bucket: string, limit: number, seconds: number) {
    const now = Date.now(), value = this.limits.get(bucket); const next = value && value.until > now ? { ...value, count: value.count + 1 } : { count: 1, until: now + seconds * 1000 };
    this.limits.set(bucket, next); return next.count <= limit;
  }
}
export class TestAuth implements AuthProvider {
  password = TEST_PASSWORD;
  confirmed = true;
  mfaEnrolled = false;
  refreshes = 0;
  userId = TEST_OWNER;
  tokens(): Tokens { return { access: `test-access-token-${this.userId}-${Date.now()}`, refresh: 'test-refresh-token', tokenExpires: Date.now() + 60 * 60 * 1000 }; }
  async login(email: string, password: string) { if (email !== TEST_EMAIL || password !== this.password) throw new HttpError(401, 'Não foi possível entrar.'); return this.tokens(); }
  async refresh() { this.refreshes++; return this.tokens(); }
  async identity(): Promise<Identity> { return { id: this.userId, email: TEST_EMAIL, confirmed: this.confirmed, mfaEnrolled: this.mfaEnrolled }; }
  async logout() {}
  async recover() {}
  async reset(email: string, code: string, password: string, beforeChange: (identity: Identity) => Promise<void>) {
    if (email !== TEST_EMAIL || code !== '123456') throw new HttpError(401, 'Código inválido.');
    const user = await this.identity(); await beforeChange(user); this.password = password; return user;
  }
}
