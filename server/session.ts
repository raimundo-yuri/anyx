import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ServerConfig } from './config';
const schema = z.strictObject({ id: z.string().regex(/^[a-f0-9]{64}$/), access: z.string().min(20).max(3072), refresh: z.string().min(8).max(512), tokenExpires: z.number().int(), expires: z.number().int(), csrf: z.string().regex(/^[a-f0-9]{64}$/) });
export type Session = z.infer<typeof schema>;
export const SESSION_MS = 8 * 60 * 60 * 1000;
export const randomToken = () => randomBytes(32).toString('hex');
export function cookieName(config: ServerConfig) { return config.secure ? '__Host-dexfin' : 'dexfin-dev'; }
export function sealSession(session: Session, config: ServerConfig) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', config.sessionKey, iv);
  cipher.setAAD(Buffer.from('dexfin-session-v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(schema.parse(session))), cipher.final()]);
  const value = [iv, encrypted, cipher.getAuthTag()].map(item => item.toString('base64url')).join('.');
  if (value.length > 3800) throw new Error('Session size limit');
  return value;
}
export function unsealSession(cookie: string | undefined, config: ServerConfig, now = Date.now()): Session | null {
  try {
    const value = cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(cookieName(config) + '='))?.slice(cookieName(config).length + 1);
    if (!value || value.length > 3800 || !/^[A-Za-z0-9_.-]+$/.test(value)) return null;
    const [iv, encrypted, tag, extra] = value.split('.'); if (extra || !tag) return null;
    const decipher = createDecipheriv('aes-256-gcm', config.sessionKey, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from('dexfin-session-v1')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const session = schema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')));
    return session.expires > now ? session : null;
  } catch { return null; }
}
export function sessionCookie(session: Session | null, config: ServerConfig, now = Date.now()) {
  return `${cookieName(config)}=${session ? sealSession(session, config) : ''}; Path=/; HttpOnly; SameSite=Strict${config.secure ? '; Secure' : ''}; Max-Age=${session ? Math.max(0, Math.floor((session.expires - now) / 1000)) : 0}`;
}
export function equalToken(actual: string | undefined, expected: string) {
  if (!actual || !/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
