import { expect, test } from '@playwright/test';

test('produção: atualização recebida com formulário aberto preserva o preenchimento', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Contas e saldos', exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
  await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill('Rascunho preservado');
  // Deliver the notification another tab's worker activation would send to this controlled tab.
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await expect(page.getByText(/Uma atualização está ativa/)).toBeAttached();
  await expect(dialog.getByLabel('Nome da conta', { exact: true })).toHaveValue('Rascunho preservado');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Recarregar aplicação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recarregar aplicação', exact: true })).toHaveCount(0);
});
