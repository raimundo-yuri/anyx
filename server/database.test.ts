// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { TEST_OWNER, TEST_OTHER } from './test-support';
const database = new PGlite();
const sid = 'a'.repeat(64);
beforeAll(async () => {
  await database.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;');
  await database.exec(await readFile(new URL('../supabase/001_cloud.sql', import.meta.url), 'utf8'));
  await database.query('insert into auth.users values ($1), ($2)', [TEST_OWNER, TEST_OTHER]);
}, 30000);
afterAll(async () => { await database.close(); });
it('PostgreSQL nega acesso direto de anônimos e usuários, inclusive às funções de escrita', async () => {
  for (const role of ['anon', 'authenticated']) {
    await database.exec(`set role ${role}`);
    try {
      await expect(database.query('select * from public.dexfin_state')).rejects.toThrow(/permission denied/);
      await expect(database.query('select public.dexfin_open($1)', [TEST_OWNER])).rejects.toThrow(/permission denied/);
      await expect(database.query('select * from public.dexfin_sessions')).rejects.toThrow(/permission denied/);
    } finally { await database.exec('reset role'); }
  }
  const result = await database.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('dexfin_state','dexfin_sessions','dexfin_limits')");
  expect(result.rows).toHaveLength(3); expect(result.rows.every(row => row.relrowsecurity)).toBe(true);
});
it('revisão atômica impede sobrescrita; sessão revogada impede commit mesmo com chave de serviço', async () => {
  await database.exec('set role service_role');
  try {
    await database.query('select public.dexfin_open($1)', [TEST_OWNER]);
    await database.query("insert into public.dexfin_sessions(id,user_id,expires_at) values($1,$2,now()+interval '1 hour')", [sid, TEST_OWNER]);
    const commit = async (expected: number, document: string) => (await database.query<{ revision: number | null }>('select public.dexfin_commit($1,$2,$3,$4::jsonb,6) as revision', [TEST_OWNER, sid, expected, document])).rows[0].revision;
    expect(await commit(0, '{"test":1}')).toBe(1); expect(await commit(0, '{"test":2}')).toBeNull();
    expect((await database.query<{ document: unknown }>('select document from public.dexfin_state where user_id=$1', [TEST_OWNER])).rows[0].document).toEqual({ test: 1 });
    await database.query('update public.dexfin_sessions set revoked_at=now() where id=$1', [sid]);
    expect(await commit(1, '{"test":3}')).toBeNull();
    expect((await database.query<{ revision: number }>('select revision from public.dexfin_state where user_id=$1', [TEST_OWNER])).rows[0].revision).toBe(1);
  } finally { await database.exec('reset role'); }
});
it('controle de tentativas é persistente, limitado e reinicia a janela expirada', async () => {
  await database.exec('set role service_role');
  try {
    const consume = async () => (await database.query<{ allowed: boolean }>("select public.dexfin_rate_limit('global:login',2,900) as allowed")).rows[0].allowed;
    expect(await consume()).toBe(true); expect(await consume()).toBe(true); expect(await consume()).toBe(false);
    await database.exec("update public.dexfin_limits set started_at=now()-interval '1 hour'"); expect(await consume()).toBe(true);
  } finally { await database.exec('reset role'); }
});
