import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD } from '../../server/test-support';
const baseURL = 'http://127.0.0.1:4186';
test.beforeEach(async ({ request }) => { await request.post('/__test/reset'); });
async function nav(page: Page, name: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click(); await target.click();
}
async function login(page: Page, password = TEST_PASSWORD) {
  await page.goto('/'); await page.getByLabel('E-mail', { exact: true }).fill(TEST_EMAIL); await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  if (password === TEST_PASSWORD) await expect(page.getByRole('button', { name: 'Sair deste dispositivo', exact: true })).toBeVisible();
}
async function createAccount(page: Page, name = 'Conta privada na nuvem') {
  await nav(page, 'Contas e saldos'); await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true }); await dialog.getByLabel('Nome da conta', { exact: true }).fill(name);
  await dialog.getByLabel('Saldo inicial (R$)', { exact: true }).fill('100,00'); await dialog.getByLabel('Data de abertura', { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
}
async function secondDevice(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }); const page = await context.newPage(); await login(page); return { context, page };
}
test('nuvem: login real do servidor, cookie protegido e nenhum banco financeiro local', async ({ page, context }, info) => {
  await login(page, 'senha-errada'); await expect(page.getByRole('alert')).toContainText('Não foi possível entrar');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  await page.getByLabel('Senha', { exact: true }).fill(TEST_PASSWORD); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await createAccount(page); await expect(page.getByTestId('accounts-total')).toHaveText(/100,00/);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(item => item.name))).toEqual([]);
  expect(await page.evaluate(() => Object.values(localStorage).join(''))).not.toContain('Conta privada na nuvem');
  expect(await page.evaluate(() => Object.values(localStorage).join(''))).not.toContain('test-access');
  expect(await page.evaluate(() => document.cookie)).not.toContain('dexfin-dev');
  const cookies = await context.cookies(); expect(cookies.find(cookie => cookie.name === 'dexfin-dev')).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  await page.reload(); await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/100,00/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('conta-nuvem.png'), fullPage: true });
});
test('nuvem: dois dispositivos compartilham a base e atualizam sem copiar backup', async ({ page, browser }) => {
  test.setTimeout(60000); await login(page); const tablet = await secondDevice(browser);
  try {
    await createAccount(page); await tablet.page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await nav(tablet.page, 'Contas e saldos');
    await expect(tablet.page.getByTestId('accounts-total')).toHaveText(/100,00/);
    await nav(page, 'Categorias e fontes'); await page.getByRole('button', { name: 'Adicionar sugestões', exact: true }).click();
    await tablet.page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await nav(tablet.page, 'Movimentações');
    await tablet.page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
    const dialog = tablet.page.getByRole('dialog', { name: 'Nova movimentação', exact: true }); await dialog.getByLabel('Valor (R$)', { exact: true }).fill('10,00');
    await dialog.getByLabel('Descrição', { exact: true }).fill('Despesa salva pelo tablet'); await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/90,00/);
    await nav(page, 'Movimentações'); await expect(page.getByText('Despesa salva pelo tablet', { exact: true })).toBeVisible();
  } finally { await tablet.context.close(); }
});
test('nuvem: saída revoga só este dispositivo e saída global encerra os dois', async ({ page, context, browser }) => {
  await login(page); await createAccount(page); const tablet = await secondDevice(browser);
  try {
    const saved = (await context.cookies()).find(cookie => cookie.name === 'dexfin-dev')!;
    await page.getByRole('button', { name: 'Sair deste dispositivo', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
    const replay = await context.request.get('/api/finance', { headers: { Cookie: `${saved.name}=${saved.value}` } }); expect(replay.status()).toBe(401);
    await tablet.page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await nav(tablet.page, 'Contas e saldos'); await expect(tablet.page.getByTestId('accounts-total')).toHaveText(/100,00/);
    await login(page); await nav(page, 'Privacidade'); await page.getByRole('button', { name: 'Encerrar sessões em todos os dispositivos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
    await tablet.page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await expect(tablet.page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
  } finally { await tablet.context.close(); }
});
test('nuvem: offline bloqueia dados, não enfileira gravações e conclui logout ao reconectar', async ({ page, context }) => {
  test.setTimeout(60000); await login(page); await createAccount(page);
  await expect(page.getByText('Aplicativo preparado. Acesso aos dados na nuvem depende de conexão.', { exact: true })).toBeVisible(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true); await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível consultar a nuvem' })).toBeVisible();
  await expect(page.getByText('Conta privada na nuvem', { exact: true })).toHaveCount(0);
  await context.setOffline(false); await expect(page.getByText('Conta privada na nuvem', { exact: true })).toBeVisible();
  await context.setOffline(true); await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível consultar a nuvem' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair deste dispositivo', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
  await context.setOffline(false); await expect(page.getByText('Sessão encerrada neste dispositivo.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
  expect(urls.some(url => new URL(url).pathname.startsWith('/api/'))).toBe(false);
});
test('nuvem: recuperação por código exige senha forte e encerra a sessão anterior', async ({ page, browser }) => {
  await login(page); const tablet = await secondDevice(browser);
  try {
    await page.getByRole('button', { name: 'Sair deste dispositivo', exact: true }).click();
    await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click(); await page.getByLabel('E-mail', { exact: true }).fill(TEST_EMAIL);
    await page.getByRole('button', { name: 'Enviar código', exact: true }).click(); await page.getByLabel('Código recebido por e-mail', { exact: true }).fill('123456');
    await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-exclusiva-123'); await page.getByLabel('Confirmar nova senha', { exact: true }).fill('nova-senha-exclusiva-123');
    await page.getByRole('button', { name: 'Salvar nova senha', exact: true }).click(); await expect(page.getByText(/Senha atualizada/)).toBeVisible();
    await tablet.page.getByRole('button', { name: 'Atualizar dados', exact: true }).click(); await expect(tablet.page.getByRole('heading', { name: 'Entre para continuar', exact: true })).toBeVisible();
  } finally { await tablet.context.close(); }
});
