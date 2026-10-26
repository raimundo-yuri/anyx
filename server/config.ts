import { z } from 'zod';
export class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export interface ServerConfig { origin: string; supabaseUrl: string; publishableKey: string; secretKey: string; ownerId: string; sessionKey: Buffer; secure: boolean; timeZone: string }
export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  let setting = 'APP_ORIGIN';
  try {
    const origin = new URL(z.string().min(1).parse(env.APP_ORIGIN));
    const local = env.NODE_ENV !== 'production' && env.VERCEL !== '1' && origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname);
    if ((!local && origin.protocol !== 'https:') || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error();
    setting = 'SUPABASE_URL';
    const supabase = new URL(z.string().min(1).parse(env.SUPABASE_URL));
    if (supabase.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(supabase.hostname) || supabase.port || supabase.username || supabase.password || supabase.pathname !== '/' || supabase.search || supabase.hash) throw new Error();
    setting = 'SESSION_SECRET';
    const encoded = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(env.SESSION_SECRET);
    const sessionKey = Buffer.from(encoded, 'base64url'); if (sessionKey.length !== 32 || sessionKey.toString('base64url') !== encoded) throw new Error();
    setting = 'VITE_TIME_ZONE';
    const timeZone = env.VITE_TIME_ZONE ?? 'America/Sao_Paulo'; new Intl.DateTimeFormat('pt-BR', { timeZone }).format();
    setting = 'SUPABASE_PUBLISHABLE_KEY';
    const publishableKey = z.string().min(20).parse(env.SUPABASE_PUBLISHABLE_KEY);
    setting = 'SUPABASE_SECRET_KEY';
    const secretKey = z.string().min(20).parse(env.SUPABASE_SECRET_KEY);
    setting = 'DEXFIN_OWNER_ID';
    const ownerId = z.uuid().parse(env.DEXFIN_OWNER_ID);
    return { timeZone, origin: origin.origin, supabaseUrl: supabase.origin, sessionKey, secure: !local,
      publishableKey, secretKey, ownerId };
  } catch { throw new HttpError(503, `O acesso na nuvem ainda não foi configurado pelo proprietário. Confira a variável ${setting} em Production na Vercel e faça um novo deploy. Nenhum dado local foi enviado.`); }
}
