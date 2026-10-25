import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixture, purchaseCommand, uid } from '../../src/test/finance-fixture';
import { plainBackup } from '../../src/portability/backup';
import { summary } from '../../src/domain/queries';
import type { State } from '../../src/domain/model';

async function nav(page: Page, name: string) {
  const button = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await button.click();
}
async function restore(page: Page, state: State) {
  await page.goto('/'); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(plainBackup(state)) });
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.', { exact: true })).toBeVisible();
}
function scenario() {
  const f = fixture(); f.run(purchaseCommand(f));
  f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, date: '2026-01-06', amount: 30000, description: 'Fatura quitada' });
  f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, date: '2026-01-07', amount: 6000, description: 'A reembolsou 60' });
  return f;
}
async function reviewRefund(page: Page, purchaseId: string, parts = ['120,00', '100,00', '80,00'], date = '2026-01-10') {
  await nav(page, 'Cartões e faturas'); await page.getByRole('button', { name: 'Registrar devolução', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar devolução de compra', exact: true });
  await dialog.getByLabel('Compra devolvida', { exact: true }).selectOption(purchaseId);
  for (const [index, value] of parts.entries()) await dialog.getByLabel(`Devolução da divisão ${index + 1} (R$)`, { exact: true }).fill(value);
  await dialog.getByLabel('Data efetiva', { exact: true }).fill(date);
  await dialog.getByLabel('Motivo ou descrição', { exact: true }).fill('Compra devolvida à loja');
  await dialog.getByRole('button', { name: 'Calcular prévia', exact: true }).click();
  return dialog;
}
async function confirm(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Conferi o fato realizado, a data e todos os valores da prévia.', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Confirmar registro', exact: true }).click(); await expect(dialog).not.toBeVisible();
}
async function backup(page: Page, path: string) {
  await nav(page, 'Relatórios e backup'); await page.getByLabel('Criptografar backup com senha', { exact: true }).uncheck();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  await (await download).saveAs(path); return JSON.parse(await readFile(path, 'utf8'));
}

test('produção: devolução paga gera crédito, obrigação com pessoa e compensação sem fabricar caixa', async ({ page }, info) => {
  test.setTimeout(90000);
  const f = scenario(); await restore(page, f.state);
  let dialog = await reviewRefund(page, f.state.purchases[0].id);
  await expect(dialog.getByRole('heading', { name: 'Depois de confirmar', exact: true })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Confirmar registro', exact: true })).toBeDisabled();
  await expect(dialog.getByText('Crédito no cartão', { exact: true }).locator('..')).toContainText('R$ 300,00');
  await expect(dialog.getByText('A devolver a pessoas', { exact: true }).locator('..')).toContainText('R$ 60,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await dialog.screenshot({ path: info.outputPath('devolucao-preview.png') }); await confirm(page);
  await nav(page, 'Pessoas e recebíveis');
  const person = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Pessoa A · Compra compartilhada', exact: true }) });
  await expect(person.getByText('A devolver: R$ 60,00', { exact: true })).toBeVisible();
  await expect(person).toContainText('Recebido em 07/01/2026');
  await person.getByRole('button', { name: 'Devolver à pessoa', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Devolver dinheiro à pessoa', exact: true });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('60,00');
  await dialog.getByLabel('Conta da devolução', { exact: true }).selectOption(f.ids.account);
  await dialog.getByLabel('Data efetiva', { exact: true }).fill('2026-01-11');
  await dialog.getByLabel('Motivo ou descrição', { exact: true }).fill('Devolvi a parte paga por A');
  await dialog.getByRole('button', { name: 'Calcular prévia', exact: true }).click(); await confirm(page);
  await expect(person).toContainText('Devolvido à pessoa em 11/01/2026');
  await nav(page, 'Cartões e faturas'); await page.getByRole('button', { name: 'Nova compra', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Compra no cartão', exact: true });
  await dialog.getByLabel('Descrição da compra', { exact: true }).fill('Nova compra depois da devolução');
  await dialog.getByLabel('Valor total (R$)', { exact: true }).fill('50,00');
  await dialog.getByLabel('Data da compra', { exact: true }).fill('2026-01-12');
  await dialog.getByLabel('Valor da divisão 1 (R$)', { exact: true }).fill('50,00');
  await dialog.getByLabel('Categoria da divisão 1', { exact: true }).selectOption(f.ids.expense);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Aplicar crédito', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Aplicar crédito em fatura', exact: true });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('50,00');
  await dialog.getByLabel('Data efetiva', { exact: true }).fill('2026-01-13');
  await dialog.getByLabel('Motivo ou descrição', { exact: true }).fill('Crédito compensado pelo emissor');
  await dialog.getByRole('button', { name: 'Calcular prévia', exact: true }).click(); await confirm(page);
  await expect(page.getByText(/Crédito com o emissor: R\$\s250,00/)).toBeVisible();
  await expect(page.getByText('Crédito aplicado em fatura · 13/01/2026', { exact: true })).toBeVisible();
  const exported = await backup(page, info.outputPath('devolucoes.json'));
  expect(exported.version).toBe(6); expect(summary(exported.state)).toMatchObject({ cash: 70000, cardCredit: 25000, personPayable: 0, invoices: 0, expenses: 5000, income: 0, netWorth: 95000 });
  for (const row of f.state.entries) expect(exported.state.entries.find((item: { id: string }) => item.id === row.id)).toEqual(row);
  expect(exported.state.purchaseRefunds).toHaveLength(1); expect(exported.state.installments.filter((item: { purchaseId: string }) => item.purchaseId === f.state.purchases[0].id)).toEqual(f.state.installments);
  await restore(page, exported.state); await page.reload(); await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/700,00/);
});

test('produção: estorno parcial mostra consumo negativo no mês e recusa excesso sem gravar', async ({ page }, info) => {
  const f = scenario(); f.run({ type: 'setBudget', id: uid(), categoryId: f.ids.expense, month: '2026-02', amount: 10000 });
  await restore(page, f.state);
  let dialog = await reviewRefund(page, f.state.purchases[0].id, ['120,01', '0,00', '0,00']);
  await expect(dialog.getByRole('alert')).toContainText('excede');
  await expect(dialog.getByRole('button', { name: 'Confirmar registro', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar formulário', exact: true }).click();
  dialog = await reviewRefund(page, f.state.purchases[0].id, ['20,00', '50,00', '20,00'], '2026-02-01');
  await expect(dialog.getByText('A devolver a pessoas', { exact: true }).locator('..')).toContainText('R$ 10,00'); await confirm(page);
  await nav(page, 'Visão geral'); await page.getByLabel('Período do dashboard', { exact: true }).fill('2026-02');
  await expect(page.getByText('Despesas do período', { exact: true }).locator('..')).toContainText('-R$ 20,00');
  const category = page.getByRole('heading', { name: 'Despesas por categoria', exact: true }).locator('..');
  await expect(category).toContainText('Alimentação'); await expect(category).toContainText('-R$ 20,00');
  expect(await page.locator('svg polyline').evaluateAll(lines => lines.every(line => line.getAttribute('points')!.split(' ').every(pair => { const y = Number(pair.split(',')[1]); return y >= 0 && y <= 230; })))).toBe(true);
  await nav(page, 'Planejamento e metas'); await page.getByLabel('Mês do planejamento', { exact: true }).fill('2026-02');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Alimentação', exact: true }) })).toContainText('-R$ 20,00 de R$ 100,00');
  const exported = await backup(page, info.outputPath('devolucao-parcial.json')); expect(exported.state.purchaseRefunds).toHaveLength(1);
  expect(summary(exported.state)).toMatchObject({ expenses: 10000, personPayable: 1000, receivables: 6000, cardCredit: 9000 });
});

test('produção: outra aba invalida a prévia e exige revisar os novos valores', async ({ page, context }) => {
  const f = scenario(); await restore(page, f.state);
  const dialog = await reviewRefund(page, f.state.purchases[0].id);
  await dialog.getByLabel('Conferi o fato realizado, a data e todos os valores da prévia.', { exact: true }).check();
  const other = await context.newPage(); await other.goto('/'); await nav(other, 'Pessoas e recebíveis');
  await other.getByRole('article').filter({ has: other.getByRole('heading', { name: 'Pessoa A · Compra compartilhada', exact: true }) }).getByRole('button', { name: 'Registrar reembolso', exact: true }).click();
  const payment = other.getByRole('dialog', { name: 'Registrar reembolso', exact: true });
  await payment.getByLabel('Conta de recebimento', { exact: true }).selectOption(f.ids.account);
  await payment.getByLabel('Valor (R$)', { exact: true }).fill('10,00'); await payment.getByLabel('Data', { exact: true }).fill('2026-01-09');
  await payment.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(payment).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar registro', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('Os dados mudaram');
  await dialog.getByRole('button', { name: 'Calcular prévia', exact: true }).click();
  await expect(dialog.getByText('A devolver a pessoas', { exact: true }).locator('..')).toContainText('R$ 70,00');
  await expect(dialog.getByLabel('Conferi o fato realizado, a data e todos os valores da prévia.', { exact: true })).not.toBeChecked();
  await confirm(page); await other.close(); await nav(page, 'Pessoas e recebíveis');
  await expect(page.getByText('A devolver: R$ 70,00', { exact: true })).toBeVisible();
});
