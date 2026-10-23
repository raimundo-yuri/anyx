import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
async function seed(page: Page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const path = '/src/infrastructure/database.ts'; const { localRepository: repo } = await import(path);
    const id = () => crypto.randomUUID(), ids = { account: id(), expense: id(), income: id(), source: id(), person: id(), person2: id(), card: id() };
    const run = async (data: Record<string, unknown>) => {
      try { return await repo.execute({ key: id(), ...data }); }
      catch (error) { const reason = error as Error; throw new Error(`${reason.name}: ${reason.message}`); }
    };
    await run({ type: 'createAccount', id: ids.account, name: 'Principal', openingBalance: 100000, date: '2026-01-01' });
    await run({ type: 'createCategory', id: ids.expense, name: 'Alimentação', kind: 'expense' });
    await run({ type: 'createCategory', id: ids.income, name: 'Trabalho', kind: 'income' });
    await run({ type: 'createSource', id: ids.source, name: 'Estágio' });
    await run({ type: 'createPerson', id: ids.person, name: 'João' }); await run({ type: 'createPerson', id: ids.person2, name: 'Ana' });
    await run({ type: 'createCard', id: ids.card, name: 'Nubank', limit: 500000, closingDay: 20, dueDay: 28 });
    return ids;
  });
}
async function totals(page: Page) {
  return page.evaluate(async () => {
    const db = '/src/infrastructure/database.ts', query = '/src/domain/queries.ts';
    const { localRepository } = await import(db), { summary } = await import(query);
    return summary(await localRepository.read());
  });
}
async function save(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
}

test('compra dividida, parcelas de fatura e plano independente de reembolso', async ({ page }, info) => {
  await seed(page); await nav(page, 'Cartões e faturas');
  await page.getByRole('button', { name: 'Nova compra', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Compra no cartão', exact: true });
  await dialog.getByLabel('Descrição da compra', { exact: true }).fill('Compra de R$ 300');
  await dialog.getByLabel('Valor total (R$)', { exact: true }).fill('300,00');
  await dialog.getByLabel('Data da compra', { exact: true }).fill('2026-01-05');
  await dialog.getByLabel('Primeira fatura (opcional)', { exact: true }).fill('2026-03');
  await dialog.getByLabel('Número de parcelas no cartão', { exact: true }).fill('3');
  await dialog.getByLabel('Valor da divisão 1 (R$)', { exact: true }).fill('120,00');
  await dialog.getByLabel('Categoria da divisão 1', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByRole('button', { name: 'Adicionar divisão', exact: true }).click();
  await dialog.getByLabel('Responsável 2', { exact: true }).selectOption({ label: 'João' });
  await dialog.getByLabel('Valor da divisão 2 (R$)', { exact: true }).fill('100,00');
  await dialog.getByRole('button', { name: 'Adicionar divisão', exact: true }).click();
  await dialog.getByLabel('Responsável 3', { exact: true }).selectOption({ label: 'Ana' });
  await dialog.getByLabel('Valor da divisão 3 (R$)', { exact: true }).fill('80,00');
  await save(page, 'Compra no cartão');
  await expect(page.getByRole('button', { name: 'Pagar fatura', exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Pagar fatura', exact: true }).first().click();
  dialog = page.getByRole('dialog', { name: 'Pagar fatura', exact: true });
  await dialog.getByLabel('Conta de pagamento', { exact: true }).selectOption({ label: 'Principal' });
  await dialog.getByLabel('Data', { exact: true }).fill('2026-03-28');
  await save(page, 'Pagar fatura');
  await nav(page, 'Pessoas e recebíveis');
  await page.getByLabel('Filtrar pessoa').selectOption({ label: 'João' });
  await page.getByRole('button', { name: 'Parcelar reembolso', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Parcelar reembolso', exact: true });
  await dialog.getByLabel('Número de parcelas do reembolso', { exact: true }).fill('2');
  await dialog.getByLabel('Primeiro vencimento', { exact: true }).fill('2026-03-31');
  await save(page, 'Parcelar reembolso');
  await page.getByRole('button', { name: 'Registrar reembolso', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Registrar reembolso', exact: true });
  await dialog.getByLabel('Conta de recebimento', { exact: true }).selectOption({ label: 'Principal' });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('60,00');
  await dialog.getByLabel('Data', { exact: true }).fill('2026-03-31');
  await save(page, 'Registrar reembolso');
  await expect.poll(() => totals(page)).toMatchObject({ cash: 96000, expenses: 12000, income: 0, invoices: 20000, receivables: 12000, netWorth: 88000 });
  await nav(page, 'Visão geral');
  await page.getByLabel('Período do dashboard').fill('2026-01');
  await expect(page.getByText('Despesas do período', { exact: true }).locator('..')).toContainText('120,00');
  await page.screenshot({ path: info.outputPath('dashboard.png'), fullPage: true });
});

test('contribuição configurável pode ser reservada, ajustada e paga uma vez', async ({ page }) => {
  await seed(page); await nav(page, 'Contribuições');
  await page.getByRole('button', { name: 'Nova regra', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova regra de contribuição', exact: true });
  await dialog.getByLabel('Nome da regra', { exact: true }).fill('Minha contribuição');
  await dialog.getByLabel('Percentual (%)', { exact: true }).fill('7,50');
  await dialog.getByLabel('Estágio', { exact: true }).check();
  await dialog.getByLabel('Aplicação', { exact: true }).selectOption('reserve');
  await dialog.getByLabel('Regra ativada', { exact: true }).check();
  await save(page, 'Nova regra de contribuição');
  await nav(page, 'Movimentações'); await page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova movimentação', exact: true });
  await dialog.getByRole('button', { name: 'Receita', exact: true }).click();
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('200,00');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Estágio recebido');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Trabalho' });
  await dialog.getByLabel('Fonte de receita', { exact: true }).selectOption({ label: 'Estágio' });
  await save(page, 'Nova movimentação');
  await expect.poll(() => totals(page)).toMatchObject({ cash: 120000, available: 118500, reserved: 1500 });
  await nav(page, 'Contribuições'); await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Ajustar contribuição', exact: true });
  await dialog.getByLabel('Novo valor (R$)', { exact: true }).fill('20,00'); await save(page, 'Ajustar contribuição');
  await page.getByRole('button', { name: 'Registrar pagamento', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Pagar contribuição', exact: true });
  await dialog.getByLabel('Categoria da contribuição', { exact: true }).selectOption({ label: 'Alimentação' });
  await save(page, 'Pagar contribuição');
  await expect.poll(() => totals(page)).toMatchObject({ cash: 118000, available: 118000, reserved: 0, expenses: 2000, income: 20000 });
  await expect(page.getByRole('button', { name: 'Registrar pagamento', exact: true })).toHaveCount(0);
});

test('backup criptografado e CSV são baixados, importados com prévia e restaurados', async ({ page }, info) => {
  const ids = await seed(page); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Senha do backup', { exact: true }).fill('senha teste 1234');
  let download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  const backup = await download, path = info.outputPath('backup-encrypted.json'); await backup.saveAs(path);
  const backupText = await readFile(path, 'utf8'); expect(backupText).not.toContain('Principal'); expect(JSON.parse(backupText).format).toBe('dexfin-encrypted');
  download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar CSV', exact: true }).click();
  const csv = await download, csvPath = info.outputPath('operations.csv'); await csv.saveAs(csvPath); expect(await readFile(csvPath, 'utf8')).toContain('description');
  const text = `externalId;date;type;description;amount;accountId;categoryId;sourceId\nID-1;2026-01-05;expense;Despesa importada;1000;${ids.account};${ids.expense};\n`;
  await page.getByLabel('Arquivo de extrato CSV', { exact: true }).setInputFiles({ name: 'extrato.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
  await page.getByRole('button', { name: 'Visualizar importação', exact: true }).click();
  await expect(page.getByText(/1 linhas: 1 novas e 0 duplicatas/)).toBeVisible();
  await page.getByLabel('Revisei a prévia e confirmo a importação.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar importação', exact: true }).click();
  await expect.poll(() => totals(page)).toMatchObject({ cash: 99000, expenses: 1000 });
  await page.getByRole('button', { name: 'Visualizar importação', exact: true }).click();
  await expect(page.getByText(/1 linhas: 0 novas e 1 duplicatas/)).toBeVisible();
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles(path);
  await page.getByLabel('Senha para restaurar (se criptografado)', { exact: true }).fill('senha teste 1234');
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await expect(page.getByText(/Prévia: 1 contas, 1 operações/)).toBeVisible();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.')).toBeVisible();
  await expect.poll(() => totals(page)).toMatchObject({ cash: 100000, expenses: 0 });
});

test('metas, previsões, orçamento, patrimônio e assistente se conectam ao domínio', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page); await nav(page, 'Planejamento e metas');
  await page.getByLabel('Mês do planejamento', { exact: true }).fill('2026-01');
  await page.getByRole('button', { name: 'Nova meta', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova meta', exact: true });
  await dialog.getByLabel('Nome da meta', { exact: true }).fill('Minha reserva');
  await dialog.getByLabel('Conta da reserva', { exact: true }).selectOption({ label: 'Principal' });
  await dialog.getByLabel('Valor-alvo (R$)', { exact: true }).fill('500,00'); await save(page, 'Nova meta');
  await page.getByRole('button', { name: 'Ajustar reserva', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Ajustar reserva da meta', exact: true });
  await dialog.getByLabel('Total reservado (R$)', { exact: true }).fill('200,00'); await save(page, 'Ajustar reserva da meta');
  await page.getByRole('button', { name: 'Definir orçamento', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Definir orçamento', exact: true });
  await dialog.getByLabel('Categoria de despesa', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByLabel('Limite mensal (R$)', { exact: true }).fill('100,00'); await save(page, 'Definir orçamento');
  await page.getByRole('button', { name: 'Despesa recorrente', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Despesa recorrente', exact: true });
  await dialog.getByLabel('Descrição', { exact: true }).fill('Assinatura mensal');
  await dialog.getByLabel('Valor previsto (R$)', { exact: true }).fill('30,00');
  await dialog.getByLabel('Conta', { exact: true }).selectOption({ label: 'Principal' });
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await save(page, 'Despesa recorrente');
  await page.getByRole('button', { name: 'Gerar previsões do mês', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar realização', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Confirmar realização', exact: true });
  await dialog.getByLabel('Data', { exact: true }).fill('2026-01-05'); await save(page, 'Confirmar realização');
  await expect.poll(() => totals(page)).toMatchObject({ cash: 97000, reserved: 20000, expenses: 3000 });
  await nav(page, 'Investimentos'); await page.getByRole('button', { name: 'Novo investimento', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Novo investimento', exact: true });
  await dialog.getByLabel('Nome do investimento', { exact: true }).fill('Reserva aplicada'); await save(page, 'Novo investimento');
  await page.getByRole('button', { name: 'Aportar', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Registrar aporte', exact: true });
  await dialog.getByLabel('Conta', { exact: true }).selectOption({ label: 'Principal' });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('300,00'); await save(page, 'Registrar aporte');
  await expect.poll(() => totals(page)).toMatchObject({ cash: 67000, netWorth: 97000, income: 0 });
  await nav(page, 'Assistente'); await page.getByLabel('Mensagem para o assistente').fill('gastei 12,50 em Alimentação na conta Principal');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/Prévia: despesa de/)).toBeVisible();
  await expect.poll(() => totals(page)).toMatchObject({ cash: 67000 });
  await page.getByRole('button', { name: 'Revisar e confirmar lançamento', exact: true }).click();
  await save(page, 'Revisar lançamento do assistente');
  await expect(page.getByText('Registro salvo no banco local. Os indicadores serão atualizados.')).toBeVisible();
  await expect.poll(() => totals(page)).toMatchObject({ cash: 65750, expenses: 4250, reserved: 20000 });
  await expect(page.getByRole('button', { name: 'Revisar e confirmar lançamento', exact: true })).toHaveCount(0);
});
