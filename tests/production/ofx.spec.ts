import { expect, test, type Page } from '@playwright/test';
import { fixture, uid } from '../../src/test/finance-fixture';
import type { State } from '../../src/domain/model';
import { plainBackup } from '../../src/portability/backup';

async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
async function restoreFixture(page: Page, state: State) {
  await page.goto('/'); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles({ name: 'ofx-fixture.json', mimeType: 'application/json', buffer: Buffer.from(plainBackup(state)) });
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.', { exact: true })).toBeVisible();
}
function row(id: string, amount: string, type: string, memo: string, extra = '') {
  return `<STMTTRN><TRNTYPE>${type}</TRNTYPE><DTPOSTED>20260105120000[-3:BRT]</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${id}</FITID><MEMO>${memo}</MEMO>${extra}</STMTTRN>`;
}
function ofx(rows: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><OFX><BANKMSGSRSV1><STMTTRNRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>BRL</CURDEF><BANKACCTFROM><BANKID>001</BANKID><ACCTID>000123456</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM><BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>${rows}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}
async function loadAndClassify(page: Page, contents: string, expenseLabel = 'Alimentação') {
  const importer = page.getByRole('region', { name: 'Importar extrato OFX', exact: true });
  await importer.getByLabel('Arquivo de extrato OFX', { exact: true }).setInputFiles({ name: 'extrato.ofx', mimeType: 'application/x-ofx', buffer: Buffer.from(contents) });
  await expect(importer.getByText(/Conta identificada no arquivo: banco 001/)).toBeVisible();
  await importer.getByLabel('Conta de destino do extrato OFX', { exact: true }).selectOption({ label: 'Principal' });
  await importer.getByLabel('Conferi a conta no arquivo e selecionei a conta correspondente no DexFin.', { exact: true }).check();
  await importer.getByLabel('Categoria padrão de despesas OFX', { exact: true }).selectOption({ label: expenseLabel });
  await importer.getByLabel('Categoria padrão de receitas OFX', { exact: true }).selectOption({ label: 'Trabalho' });
  await importer.getByLabel('Fonte padrão de receitas OFX', { exact: true }).selectOption({ label: 'Estágio' });
  await importer.getByRole('button', { name: 'Classificar lançamentos comuns pendentes', exact: true }).click();
  return importer;
}

test('produção: OFX revisado preserva centavos e detecta duplicatas após importar e recarregar', async ({ page, context }) => {
  test.setTimeout(60000);
  const f = fixture();
  f.run({ type: 'createCategory', id: uid(), name: 'Mercado', kind: 'expense', parentId: f.ids.expense });
  await restoreFixture(page, f.state);
  const contents = ofx(row('BANK-EXP-1', '-12.50', 'DEBIT', 'Almoço do extrato') + row('BANK-INC-1', '200.00', 'CREDIT', 'Bolsa recebida'));
  let importer = await loadAndClassify(page, contents, 'Alimentação / Mercado');
  await importer.getByRole('button', { name: 'Validar e visualizar importação OFX', exact: true }).click();
  await expect(importer.getByText(/Prévia OFX: 2 linhas, 2 novas, 0 duplicatas e 0 ignoradas/)).toBeVisible();
  const confirm = importer.getByRole('button', { name: 'Confirmar importação OFX', exact: true });
  await expect(confirm).toBeDisabled();
  const other = await context.newPage(); await other.goto('/'); await nav(other, 'Contas e saldos');
  await expect(other.getByTestId('accounts-total')).toHaveText(/1\.000,00/); await other.close();
  await importer.getByLabel('Revisei a conta e confirmo que os lançamentos selecionados são receitas/despesas reais.', { exact: true }).check();
  await confirm.click(); await expect(importer.getByText(/Lote OFX processado/)).toBeVisible();
  await importer.getByRole('button', { name: 'Validar e visualizar importação OFX', exact: true }).click();
  await expect(importer.getByText(/Prévia OFX: 2 linhas, 0 novas, 2 duplicatas e 0 ignoradas/)).toBeVisible();
  await expect(importer.getByRole('button', { name: 'Confirmar importação OFX', exact: true })).toBeDisabled();
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/1\.187,50/);
  await page.reload(); await nav(page, 'Relatórios e backup');
  importer = await loadAndClassify(page, contents, 'Alimentação / Mercado');
  await importer.getByRole('button', { name: 'Validar e visualizar importação OFX', exact: true }).click();
  await expect(importer.getByText(/Prévia OFX: 2 linhas, 0 novas, 2 duplicatas/)).toBeVisible();
  await importer.getByLabel('Categoria do lançamento OFX 1', { exact: true }).selectOption({ label: 'Alimentação' });
  await expect(importer.getByRole('button', { name: 'Confirmar importação OFX', exact: true })).toHaveCount(0);
  await importer.getByRole('button', { name: 'Validar e visualizar importação OFX', exact: true }).click();
  await expect(importer.getByRole('alert')).toContainText('FITID já foi usado');
  await nav(page, 'Movimentações');
  await expect(page.getByRole('row').filter({ has: page.getByText('Almoço do extrato', { exact: true }) })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ has: page.getByText('Bolsa recebida', { exact: true }) })).toHaveCount(1);
});

test('produção: OFX ambíguo exige decisão e arquivo inválido preserva os saldos', async ({ page }, info) => {
  test.setTimeout(60000);
  await restoreFixture(page, fixture().state);
  const contents = ofx(row('SHOP-1', '-12.50', 'DEBIT', 'Compra na padaria') + row('PIX-1', '100.00', 'XFER', 'PIX entre minhas contas') + row('CARD-1', '-30.00', 'DEBIT', 'Pagamento', '<CCACCTTO><ACCTID>CARTAO-TESTE</ACCTID></CCACCTTO>'));
  const importer = await loadAndClassify(page, contents);
  await expect(importer.getByText('2 pendentes', { exact: true })).toBeVisible();
  await expect(importer.getByLabel('Classificação do lançamento OFX 2', { exact: true })).toHaveValue('pending');
  await expect(importer.getByLabel('Classificação do lançamento OFX 3', { exact: true })).toHaveValue('pending');
  await expect(importer.getByRole('button', { name: 'Validar e visualizar importação OFX', exact: true })).toBeDisabled();
  await importer.getByLabel('Classificação do lançamento OFX 2', { exact: true }).selectOption('ignore');
  await importer.getByLabel('Classificação do lançamento OFX 3', { exact: true }).selectOption('ignore');
  await importer.getByRole('button', { name: 'Validar e visualizar importação OFX', exact: true }).click();
  await expect(importer.getByText(/Prévia OFX: 3 linhas, 1 novas, 0 duplicatas e 2 ignoradas/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('ofx-preview.png'), fullPage: true });
  await importer.getByLabel('Revisei a conta e confirmo que os lançamentos selecionados são receitas/despesas reais.', { exact: true }).check();
  await importer.getByRole('button', { name: 'Confirmar importação OFX', exact: true }).click();
  await expect(importer.getByText(/Lote OFX processado/)).toBeVisible();
  await importer.getByLabel('Arquivo de extrato OFX', { exact: true }).setInputFiles({ name: 'invalido.ofx', mimeType: 'application/x-ofx', buffer: Buffer.from('<!DOCTYPE OFX [<!ENTITY externo SYSTEM "https://example.invalid">]>' + ofx(row('EVIL', '9999.00', 'CREDIT', '&externo;'))) });
  await expect(importer.getByRole('alert')).toContainText('DTD');
  await expect(importer.getByRole('button', { name: 'Confirmar importação OFX', exact: true })).toHaveCount(0);
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/987,50/);
  await page.reload(); await nav(page, 'Movimentações');
  await expect(page.getByText('Compra na padaria', { exact: true })).toBeVisible();
  await expect(page.getByText('PIX entre minhas contas', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Pagamento', { exact: true })).toHaveCount(0);
});
