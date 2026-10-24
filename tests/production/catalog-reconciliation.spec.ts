import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixture, today, uid } from '../../src/test/finance-fixture';
import { plainBackup } from '../../src/portability/backup';
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

async function exportedState(page: Page, path: string): Promise<State> {
  await nav(page, 'Relatórios e backup');
  await page.getByLabel('Criptografar backup com senha', { exact: true }).uncheck();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  await (await pending).saveAs(path);
  return JSON.parse(await readFile(path, 'utf8')).state as State;
}

async function checkBudget(page: Page, category: string, spent: string) {
  await nav(page, 'Planejamento e metas');
  await page.getByLabel('Mês do planejamento', { exact: true }).fill('2026-01');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: category, exact: true }) })).toContainText(`R$ ${spent} de R$ 100,00`);
}

test('produção: subcategoria organiza despesa e orçamento sem duplicar valores ou trocar IDs', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = fixture(), leisureId = uid();
  f.run({ type: 'createCategory', id: leisureId, name: 'Lazer', kind: 'expense' });
  for (const categoryId of [f.ids.expense, leisureId]) f.run({ type: 'setBudget', id: uid(), categoryId, month: '2026-01', amount: 10000 });
  await restore(page, f.state); await nav(page, 'Categorias e fontes');
  await page.getByRole('button', { name: 'Nova subcategoria', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova subcategoria', exact: true });
  await dialog.getByLabel('Nome da subcategoria', { exact: true }).fill('Restaurantes');
  await dialog.getByLabel('Grupo da subcategoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await expect(dialog).toContainText('Prévia: Alimentação / Restaurantes');
  await expect(dialog.getByRole('button', { name: 'Criar subcategoria', exact: true })).toBeDisabled();
  await dialog.getByLabel('Revisei o nome e o grupo da subcategoria.', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Criar subcategoria', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar categoria Alimentação / Restaurantes', exact: true })).toBeVisible();

  await nav(page, 'Movimentações'); await page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova movimentação', exact: true });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('30,00');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Almoço na subcategoria');
  await dialog.getByLabel('Data', { exact: true }).fill(today);
  await dialog.getByLabel('Conta', { exact: true }).selectOption({ label: 'Principal' });
  const [subcategoryId] = await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação / Restaurantes' });
  expect(subcategoryId).toBeTruthy();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await checkBudget(page, 'Alimentação', '30,00'); await checkBudget(page, 'Lazer', '0,00');
  await nav(page, 'Visão geral'); await page.getByLabel('Período do dashboard', { exact: true }).fill('2026-01');
  await expect(page.getByText('Despesas do período', { exact: true }).locator('..')).toContainText('R$ 30,00');
  const distribution = page.getByRole('heading', { name: 'Despesas por categoria', exact: true }).locator('..');
  await expect(distribution.getByText('Alimentação / Restaurantes', { exact: true })).toHaveCount(1);
  await expect(distribution.getByText('Alimentação', { exact: true })).toHaveCount(0);
  const beforeMoving = await exportedState(page, info.outputPath('antes-de-organizar.json'));

  await nav(page, 'Categorias e fontes'); await page.getByRole('button', { name: 'Organizar grupos', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Organizar grupos de categorias', exact: true });
  await dialog.getByLabel('Categoria para organizar', { exact: true }).selectOption(subcategoryId);
  await dialog.getByLabel('Novo grupo', { exact: true }).selectOption({ label: 'Lazer' });
  await expect(dialog).toContainText('Prévia: Lazer / Restaurantes');
  await expect(dialog.getByRole('button', { name: 'Confirmar novo grupo', exact: true })).toBeDisabled();
  await dialog.getByLabel('Revisei a mudança de grupo e seus efeitos nos registros existentes.', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Confirmar novo grupo', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar categoria Lazer / Restaurantes', exact: true })).toBeVisible();
  await checkBudget(page, 'Alimentação', '0,00'); await checkBudget(page, 'Lazer', '30,00');

  await nav(page, 'Categorias e fontes'); await page.getByRole('button', { name: 'Organizar grupos', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Organizar grupos de categorias', exact: true });
  await dialog.getByLabel('Categoria para organizar', { exact: true }).selectOption(subcategoryId);
  await dialog.getByLabel('Novo grupo', { exact: true }).selectOption('');
  await expect(dialog).toContainText('Prévia: Restaurantes');
  await expect(dialog.getByRole('button', { name: 'Confirmar novo grupo', exact: true })).toBeDisabled();
  await dialog.getByLabel('Revisei a mudança de grupo e seus efeitos nos registros existentes.', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Confirmar novo grupo', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar categoria Restaurantes', exact: true })).toBeVisible();
  await page.reload(); await nav(page, 'Categorias e fontes');
  await expect(page.getByRole('button', { name: 'Editar categoria Restaurantes', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('subcategorias.png'), fullPage: true });
  await checkBudget(page, 'Alimentação', '0,00'); await checkBudget(page, 'Lazer', '0,00');
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/970,00/);
  const afterMoving = await exportedState(page, info.outputPath('depois-de-organizar.json'));
  expect(afterMoving.categories.find(item => item.id === subcategoryId)).toMatchObject({ id: subcategoryId, name: 'Restaurantes' });
  expect(afterMoving.categories.find(item => item.id === subcategoryId)?.parentId).toBeUndefined();
  expect(afterMoving.entries).toEqual(beforeMoving.entries); expect(afterMoving.operations).toEqual(beforeMoving.operations);
  expect(afterMoving.accounts).toEqual(beforeMoving.accounts);
  expect(afterMoving.entries.some(item => item.ledger === 'expense' && item.referenceId === subcategoryId && item.amount === 3000)).toBe(true);
});

test('produção: conferir saldo respeita corte, transferência e estorno sem alterar o banco', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = fixture();
  f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 10000, date: '2026-01-03', description: 'Transferência para conferir' });
  f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 2500, date: '2026-01-04', description: 'Despesa do dia 4' });
  const wrong = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 500, date: today, description: 'Despesa duplicada para conferir' });
  f.run({ type: 'reverseMovement', operationId: wrong.resultId, reason: 'Correção da despesa duplicada' });
  f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1000, date: '2026-01-06', description: 'Despesa depois do corte' });
  await restore(page, f.state); await nav(page, 'Contas e saldos');
  await page.getByRole('article', { name: 'Principal', exact: true }).getByRole('button', { name: 'Conferir saldo', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Conferir saldo com extrato', exact: true });
  await dialog.getByLabel('Data de corte do extrato', { exact: true }).fill('2026-01-03');
  await dialog.getByLabel('Saldo final no extrato (R$)', { exact: true }).fill('900,01');
  await dialog.getByRole('button', { name: 'Comparar saldos', exact: true }).click();
  await expect(dialog.getByText('Saldo calculado', { exact: true }).locator('..')).toContainText('R$ 900,00');
  await expect(dialog.getByText('Diferença', { exact: true }).locator('..')).toContainText('R$ 0,01');
  let movements = dialog.getByRole('list', { name: 'Movimentações da conta até o corte', exact: true });
  await expect(movements.getByRole('listitem').filter({ hasText: 'Transferência para conferir' })).toContainText('-R$ 100,00');
  await expect(movements.getByText(/Despesa do dia 4/)).toHaveCount(0);

  await dialog.getByLabel('Data de corte do extrato', { exact: true }).fill(today);
  await dialog.getByLabel('Saldo final no extrato (R$)', { exact: true }).fill('875,00');
  await dialog.getByRole('button', { name: 'Comparar saldos', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Os saldos coincidem');
  await expect(dialog.getByText('Saldo calculado', { exact: true }).locator('..')).toContainText('R$ 875,00');
  movements = dialog.getByRole('list', { name: 'Movimentações da conta até o corte', exact: true });
  await expect(movements.getByRole('listitem').filter({ hasText: 'Estornada' })).toContainText('-R$ 5,00');
  await expect(movements.getByRole('listitem').filter({ hasText: 'Correção da despesa duplicada' })).toContainText('+R$ 5,00');
  await expect(movements.getByText(/Despesa depois do corte/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('conferencia-de-saldo.png'), fullPage: true });
  await dialog.getByLabel('Saldo final no extrato (R$)', { exact: true }).fill('-10,00');
  await dialog.getByRole('button', { name: 'Comparar saldos', exact: true }).click();
  await expect(dialog.getByText('Saldo no extrato', { exact: true }).locator('..')).toContainText('-R$ 10,00');
  await expect(dialog.getByText('Diferença', { exact: true }).locator('..')).toContainText('-R$ 885,00');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('accounts-total')).toHaveText(/965,00/);
  await page.reload(); await nav(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/965,00/);
  await page.getByRole('article', { name: 'Principal', exact: true }).getByRole('button', { name: 'Conferir saldo', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Conferir saldo com extrato', exact: true });
  await expect(dialog.getByLabel('Saldo final no extrato (R$)', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('region', { name: 'Resultado da conferência', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const after = await exportedState(page, info.outputPath('apos-conferencia.json'));
  for (const table of Object.keys(f.state) as (keyof State)[]) {
    expect([...after[table]].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...f.state[table]].sort((a, b) => a.id.localeCompare(b.id)));
  }
});
