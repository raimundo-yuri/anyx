import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixture, purchaseCommand, today, uid } from '../../src/test/finance-fixture';
import { plainBackup } from '../../src/portability/backup';
import { summary } from '../../src/domain/queries';
import type { State } from '../../src/domain/model';

async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
async function restore(page: Page, state: State) {
  await page.goto('/'); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(plainBackup(state)) });
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.', { exact: true })).toBeVisible();
}
async function openReversal(page: Page, description: string, reason: string) {
  await nav(page, 'Movimentações');
  await page.getByRole('button', { name: `Estornar ${description}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Estornar lançamento', exact: true });
  await dialog.getByLabel('Motivo do estorno', { exact: true }).fill(reason);
  await dialog.getByLabel('Confirmo que este lançamento foi registrado por engano e revisei os efeitos do estorno.', { exact: true }).check();
  return dialog;
}
async function exportedState(page: Page, path: string): Promise<State> {
  await nav(page, 'Relatórios e backup');
  await page.getByLabel('Criptografar backup com senha', { exact: true }).uncheck();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  await (await download).saveAs(path);
  return JSON.parse(await readFile(path, 'utf8')).state;
}

test('produção: corrige pagamento de fatura e reembolso com os originais preservados', async ({ page }, info) => {
  const f = fixture(); f.run(purchaseCommand(f));
  f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 15000, date: '2026-01-06', description: 'Fatura informada por engano' });
  f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 6000, date: '2026-01-07', description: 'Reembolso informado por engano' });
  await restore(page, f.state);
  let dialog = await openReversal(page, 'Fatura informada por engano', 'Este pagamento não aconteceu');
  await expect(dialog.getByRole('list', { name: 'Efeito do estorno nos compromissos' })).toContainText('Fatura pendente');
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  dialog = await openReversal(page, 'Reembolso informado por engano', 'Este recebimento não aconteceu');
  await expect(dialog.getByRole('list', { name: 'Efeito do estorno nos compromissos' })).toContainText('A receber da pessoa');
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Pessoas e recebíveis'); await expect(page.getByText('Correção de reembolso em 07/01/2026', { exact: true })).toBeVisible();
  const state = await exportedState(page, info.outputPath('correcao-pagamentos.json'));
  expect(summary(state)).toMatchObject({ cash: 100000, invoices: 30000, receivables: 18000, income: 0, expenses: 12000 });
  for (const operation of f.state.operations) expect(state.operations.find(item => item.id === operation.id)).toEqual(operation);
  for (const entry of f.state.entries) expect(state.entries.find(item => item.id === entry.id)).toEqual(entry);
  await page.reload(); await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/1\.000,00/);
});

test('produção: crédito consumido bloqueia correção até desfazer sua aplicação incorreta', async ({ page }, info) => {
  const f = fixture(); f.run(purchaseCommand(f)); const purchase = f.state.purchases[0];
  f.run({ type: 'invoicePayment', invoiceId: purchase.invoiceId, accountId: f.ids.account, amount: 30000, date: '2026-01-06', description: 'Pagamento real' });
  f.run({ type: 'purchaseRefund', purchaseId: purchase.id, invoiceId: purchase.invoiceId, amount: 30000, date: '2026-01-07', description: 'Crédito comercial incorreto', allocations: f.state.splits.map(item => ({ splitId: item.id, amount: item.amount })) });
  f.run({ ...purchaseCommand(f), date: '2026-01-08' });
  f.run({ type: 'cardCreditUse', invoiceId: purchase.invoiceId, amount: 1000, date: '2026-01-09', description: 'Aplicação incorreta do crédito' });
  await restore(page, f.state);
  let dialog = await openReversal(page, 'Crédito comercial incorreto', 'Crédito não confirmado');
  await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Confirmar estorno', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  dialog = await openReversal(page, 'Aplicação incorreta do crédito', 'Compensação não realizada');
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  dialog = await openReversal(page, 'Crédito comercial incorreto', 'Crédito não confirmado');
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Cartões e faturas'); await expect(page.getByText('Crédito comercial incorreto · Corrigida por estorno')).toBeVisible();
  const state = await exportedState(page, info.outputPath('correcao-credito.json'));
  expect(summary(state)).toMatchObject({ cash: 70000, invoices: 30000, cardCredit: 0, receivables: 36000, expenses: 24000 });
  expect(state.purchaseRefunds).toEqual(f.state.purchaseRefunds); expect(state.operations.filter(item => item.kind === 'reversal')).toHaveLength(2);
});

test('produção: estorno exige confirmação, preserva vínculo e sobrevive a backup e recarga', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = fixture();
  f.run({ type: 'setBudget', id: uid(), categoryId: f.ids.expense, month: '2026-01', amount: 10000 });
  f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 5000, date: today, description: 'Mercado duplicado' });
  await restore(page, f.state); await nav(page, 'Movimentações');
  await page.getByRole('button', { name: 'Estornar Mercado duplicado', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Estornar lançamento', exact: true });
  await expect(dialog.getByRole('button', { name: 'Confirmar estorno', exact: true })).toBeDisabled();
  await dialog.getByLabel('Motivo do estorno', { exact: true }).fill('Digitado duas vezes');
  await expect(dialog.getByRole('button', { name: 'Confirmar estorno', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/950,00/);
  dialog = await openReversal(page, 'Mercado duplicado', 'Digitado duas vezes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('estorno-preview.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Estornar Mercado duplicado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ has: page.getByText('Mercado duplicado', { exact: true }) })).toContainText('Estornada');
  await page.getByLabel('Buscar movimentações', { exact: true }).fill('Mercado duplicado');
  await expect(page.getByRole('row').filter({ has: page.getByText('Digitado duas vezes', { exact: true }) })).toBeVisible();
  await page.getByRole('button', { name: 'Ver original de Digitado duas vezes', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Detalhes do estorno', exact: true });
  await expect(dialog.getByText('Mercado duplicado', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('Motivo: Digitado duas vezes');
  await expect(dialog).toContainText('Data financeira: 05/01/2026');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await nav(page, 'Visão geral'); await page.getByLabel('Período do dashboard', { exact: true }).fill('2026-01');
  await expect(page.getByText('Despesas do período', { exact: true }).locator('..')).toContainText('0,00');
  await nav(page, 'Planejamento e metas'); await page.getByLabel('Mês do planejamento', { exact: true }).fill('2026-01');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Alimentação', exact: true }) })).toContainText('R$ 0,00 de R$ 100,00');
  await nav(page, 'Relatórios e backup'); await page.getByLabel('Criptografar backup com senha', { exact: true }).uncheck();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  const path = info.outputPath('backup-com-estorno.json'); await (await download).saveAs(path);
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.version).toBe(6); expect(backup.state.operations.filter((item: { kind: string }) => item.kind === 'reversal')).toHaveLength(1);
  await restore(page, backup.state);
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/1\.000,00/);
  await page.reload(); await nav(page, 'Movimentações');
  await expect(page.getByRole('button', { name: 'Ver estorno de Mercado duplicado', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver original de Digitado duas vezes', exact: true })).toBeVisible();
});

test('produção: receita estornada libera reservas e mantém contribuição paga e previsão encerrada', async ({ page }) => {
  const f = fixture();
  for (const [name, mode] of [['Reserva', 'reserve'], ['Pagamento', 'suggest']]) f.run({ type: 'createRule', id: uid(), name, mode, enabled: true, basisPoints: 1000, sourceIds: [f.ids.source] });
  const forecast = uid();
  f.run({ type: 'createForecast', id: forecast, name: 'Receita confirmada por engano', kind: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today });
  f.run({ type: 'settleForecast', id: forecast, action: 'confirm', date: today });
  f.run({ type: 'settleContribution', contributionId: f.state.contributions[1].id, date: today, action: 'pay', categoryId: f.ids.expense });
  await restore(page, f.state);
  const dialog = await openReversal(page, 'Receita confirmada por engano', 'Confirmei uma previsão incorreta');
  await expect(dialog).toContainText('Contribuições já pagas, no total de R$ 10,00');
  await expect(dialog).toContainText('liberando as reservas correspondentes');
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/990,00/);
  await nav(page, 'Contribuições');
  await expect(page.getByText(/Cancelada/)).toBeVisible(); await expect(page.getByText(/ · Paga/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar pagamento', exact: true })).toHaveCount(0);
  await nav(page, 'Planejamento e metas'); await page.getByLabel('Mês do planejamento', { exact: true }).fill('2026-01');
  await expect(page.getByText(/Realização estornada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar realização', exact: true })).toHaveCount(0);
  await nav(page, 'Visão geral'); await page.getByLabel('Período do dashboard', { exact: true }).fill('2026-01');
  await expect(page.getByText('Receitas do período', { exact: true }).locator('..')).toContainText('0,00');
  await expect(page.getByText('Despesas do período', { exact: true }).locator('..')).toContainText('10,00');
});

test('produção: estorno da transferência atualiza outra aba com o formulário aberto sem duplicar', async ({ page, context }) => {
  const f = fixture(); f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 10000, date: today, description: 'Transferência incorreta' });
  await restore(page, f.state);
  const second = await context.newPage(); await second.goto('/');
  const firstDialog = await openReversal(page, 'Transferência incorreta', 'Duplicada na primeira aba');
  await openReversal(second, 'Transferência incorreta', 'Tentativa da outra aba');
  await firstDialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click();
  await expect(firstDialog).not.toBeVisible();
  const secondDialog = second.getByRole('dialog', { name: 'Detalhes do estorno', exact: true });
  await expect(secondDialog).toContainText('Duplicada na primeira aba');
  await expect(second.getByRole('button', { name: 'Confirmar estorno', exact: true })).toHaveCount(0);
  await secondDialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await nav(second, 'Contas e saldos');
  await expect(second.getByRole('article', { name: 'Principal', exact: true })).toContainText('1.000,00');
  await expect(second.getByRole('article', { name: 'Carteira', exact: true })).toContainText('0,00');
  await page.reload(); await nav(page, 'Movimentações');
  await expect(page.getByRole('button', { name: 'Ver original de Duplicada na primeira aba', exact: true })).toHaveCount(1);
  await second.close();
});

test('produção: reserva sem cobertura bloqueia estorno até ajustar a meta', async ({ page }) => {
  const f = fixture(), goal = uid();
  f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today, description: 'Receita incorreta' });
  f.run({ type: 'createGoal', id: goal, name: 'Reserva da meta', accountId: f.ids.account, target: 110000, deadline: '2026-12-31' });
  f.run({ type: 'fundGoal', id: goal, amount: 105000 });
  await restore(page, f.state);
  let dialog = await openReversal(page, 'Receita incorreta', 'Renda duplicada');
  await expect(dialog.getByRole('alert')).toContainText('reservas sem cobertura');
  await expect(dialog.getByRole('button', { name: 'Confirmar estorno', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await nav(page, 'Planejamento e metas'); await page.getByRole('button', { name: 'Ajustar reserva', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Ajustar reserva da meta', exact: true });
  await dialog.getByLabel('Total reservado (R$)', { exact: true }).fill('1.000,00');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  dialog = await openReversal(page, 'Receita incorreta', 'Renda duplicada');
  await dialog.getByRole('button', { name: 'Confirmar estorno', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/1\.000,00/);
});
