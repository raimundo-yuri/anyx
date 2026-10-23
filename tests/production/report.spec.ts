import { expect, test, type Page } from '@playwright/test';
async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
test('produção: relatório gera PDF e exclusão exige confirmação literal', async ({ page }, info) => {
  await page.goto('/'); await nav(page, 'Contas e saldos');
  await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill('Conta do relatório');
  await dialog.getByLabel('Saldo inicial (R$)', { exact: true }).fill('100,00');
  await dialog.getByLabel('Data de abertura', { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Relatórios e backup'); await page.getByLabel('Mês do relatório', { exact: true }).fill('2026-01');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Relatório financeiro · DexFin', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toBeVisible();
  const pdf = await page.pdf({ path: info.outputPath('finance-report.pdf'), format: 'A4' });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF'); expect(pdf.length).toBeGreaterThan(1000);
  await page.emulateMedia({ media: 'screen' });
  await nav(page, 'Privacidade');
  const erase = page.getByRole('button', { name: 'Excluir todos os registros locais', exact: true });
  await expect(erase).toBeDisabled();
  await page.getByLabel('Digite APAGAR para excluir', { exact: true }).fill('errado'); await expect(erase).toBeDisabled();
  await page.getByLabel('Digite APAGAR para excluir', { exact: true }).fill('APAGAR'); await erase.click();
  await expect(page.getByText(/Registros financeiros locais excluídos/)).toBeVisible();
  await nav(page, 'Contas e saldos'); await expect(page.getByRole('heading', { name: 'Seu primeiro passo: uma conta', exact: true })).toBeVisible();
});
