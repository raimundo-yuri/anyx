// @vitest-environment node
import { expect, it } from 'vitest';
import { serverConfig } from './config';
import { TEST_OWNER } from './test-support';
const example = { NODE_ENV: 'production', APP_ORIGIN: 'https://dexfin.example.test', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public-key-not-real', SUPABASE_SECRET_KEY: 'test-secret-key-not-real', DEXFIN_OWNER_ID: TEST_OWNER, SESSION_SECRET: Buffer.alloc(32, 7).toString('base64url') };
it('configuração ausente fecha o acesso, sem modo local automático', () => {
  expect(() => serverConfig({})).toThrow(/ainda não foi configurado/);
  expect(serverConfig(example)).toMatchObject({ secure: true, ownerId: TEST_OWNER });
});
it('produção recusa origem HTTP, credencial fraca e destinos de banco não autorizados', () => {
  for (const patch of [{ APP_ORIGIN: 'http://127.0.0.1:4186' }, { APP_ORIGIN: 'https://user:password@dexfin.example.test' }, { SUPABASE_URL: 'https://attacker.example' }, { SUPABASE_URL: 'http://project.supabase.co' }, { SUPABASE_URL: 'https://x:y@project.supabase.co' }, { SESSION_SECRET: 'fraca' }, { DEXFIN_OWNER_ID: 'x' }]) expect(() => serverConfig({ ...example, ...patch })).toThrow();
  expect(() => serverConfig({ ...example, NODE_ENV: 'test', VERCEL: '1', APP_ORIGIN: 'http://127.0.0.1:4186' })).toThrow();
});
it('somente desenvolvimento local permite cookie sem Secure, e o fuso precisa ser válido', () => {
  expect(serverConfig({ ...example, NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:4186' }).secure).toBe(false);
  expect(() => serverConfig({ ...example, VITE_TIME_ZONE: 'inexistente' })).toThrow();
});
it('diagnóstico identifica somente o nome da variável inválida, sem revelar seu valor', () => {
  for (const field of ['APP_ORIGIN', 'SUPABASE_URL', 'SESSION_SECRET', 'VITE_TIME_ZONE', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'DEXFIN_OWNER_ID']) {
    try { serverConfig({ ...example, [field]: 'valor-privado' }); throw new Error('Deveria recusar'); }
    catch (reason) { expect((reason as Error).message).toContain(field); expect((reason as Error).message).not.toContain('valor-privado'); }
  }
});
