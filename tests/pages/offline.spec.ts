import { expect, test, type Page } from '@playwright/test';

async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}

test('Pages: manifesto, escopo, cache e gravação offline no caminho /anyx/', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/anyx/');
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await expect(page.getByText('Disponível offline neste navegador.', { exact: true })).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.getByRole('button', { name: 'Aplicar atualização', exact: true })).toHaveCount(0);
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
    return (await fetch(href)).json();
  });
  expect(manifest).toMatchObject({ id: '/anyx/', start_url: '/anyx/', scope: '/anyx/', name: 'DexFin' });
  expect(manifest.icons.every((icon: { src: string }) => icon.src.startsWith('/anyx/'))).toBe(true);
  const worker = await page.evaluate(async () => ({
    script: navigator.serviceWorker.controller!.scriptURL,
    scope: (await navigator.serviceWorker.getRegistration())!.scope,
    cacheUrls: (await Promise.all((await caches.keys()).filter(name => name.startsWith('dexfin-static-')).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat(),
  }));
  expect(worker.script).toContain('/anyx/sw.js'); expect(worker.scope).toContain('/anyx/');
  expect(worker.cacheUrls.length).toBeGreaterThan(5);
  expect(worker.cacheUrls.every(url => url.startsWith('/anyx/'))).toBe(true);
  await nav(page, 'Contas e saldos'); await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill('Conta no Pages');
  await dialog.getByLabel('Saldo inicial (R$)', { exact: true }).fill('100,00');
  await dialog.getByLabel('Data de abertura', { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Categorias e fontes'); await page.getByRole('button', { name: 'Adicionar sugestões', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar categoria Alimentação', exact: true })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await nav(page, 'Movimentações'); await page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova movimentação', exact: true });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('10,00');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Despesa offline no Pages');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Relatórios e backup');
  await expect(page.getByRole('heading', { name: 'Backup completo', exact: true })).toBeVisible();
  await page.reload(); await nav(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/90,00/);
  expect(errors).toEqual([]);
});
