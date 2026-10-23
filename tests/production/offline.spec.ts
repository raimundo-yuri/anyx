import { expect, test, type Page } from '@playwright/test';
async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
test('produção: manifesto, CSP, cache offline e salvamento após recarga sem rede', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Disponível offline neste navegador.', { exact: true })).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest'); return response.json();
  });
  expect(manifest).toMatchObject({ name: 'DexFin', display: 'standalone', start_url: '/' });
  expect(manifest.icons).toHaveLength(2);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  await nav(page, 'Contas e saldos'); await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill('Conta offline');
  await dialog.getByLabel('Saldo inicial (R$)', { exact: true }).fill('100,00');
  await dialog.getByLabel('Data de abertura', { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Categorias e fontes'); await page.getByRole('button', { name: 'Adicionar sugestões', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar categoria Alimentação', exact: true })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await expect(page.getByText('Offline · registros locais continuam disponíveis.', { exact: true })).toBeVisible();
  await nav(page, 'Movimentações'); await page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova movimentação', exact: true });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('10,00');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Despesa sem conexão');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row', { name: /Despesa sem conexão/ })).toBeVisible();
  // Lazy routes must also work offline; every production chunk is precached.
  await nav(page, 'Relatórios e backup');
  await expect(page.getByRole('heading', { name: 'Backup completo', exact: true })).toBeVisible();
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/90,00/);
  await page.reload(); await nav(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/90,00/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('offline.png'), fullPage: true });
});
