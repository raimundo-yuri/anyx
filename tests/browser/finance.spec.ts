import { expect, test } from '@playwright/test';

test('banco nativo, regras financeiras, recarga e interface responsiva', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Estado do armazenamento' })).toContainText('IndexedDB disponível');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: /Conhecer o projeto/ }).click();
  await expect(page.getByRole('heading', { name: 'Sobre o projeto' })).toBeVisible();
  if (!await page.getByRole('button', { name: 'Privacidade', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await page.getByRole('button', { name: 'Privacidade', exact: true }).click();
  await expect(page.getByText(/não é criptografado/)).toBeVisible();
  await page.getByRole('button', { name: 'Visão geral' }).click();

  // Exercise the application API through Vite in a real Chromium context, using native IndexedDB.
  // There are intentionally no financial forms until the next stage.
  const result = await page.evaluate(async () => {
    const databasePath = '/src/infrastructure/database.ts';
    const queriesPath = '/src/domain/queries.ts';
    const { localRepository: repository } = await import(databasePath);
    const { summary } = await import(queriesPath);
    const id = () => crypto.randomUUID();
    const accountId = id(), otherId = id(), categoryId = id(), cardId = id(), personA = id(), personB = id();
    const run = (data: Record<string, unknown>) => repository.execute({ key: id(), ...data });
    await run({ type: 'createAccount', id: accountId, name: 'Conta de teste', openingBalance: 100000, date: '2026-01-01' });
    await run({ type: 'createAccount', id: otherId, name: 'Carteira', openingBalance: 0, date: '2026-01-01' });
    await run({ type: 'createCategory', id: categoryId, name: 'Alimentação', kind: 'expense' });
    await run({ type: 'createCard', id: cardId, name: 'Cartão de teste', limit: 500000, closingDay: 20, dueDay: 28 });
    for (const personId of [personA, personB]) await run({ type: 'createPerson', id: personId, name: 'Pessoa de teste' });
    await run({ type: 'transfer', fromId: accountId, toId: otherId, amount: 10000, date: '2026-01-02', description: 'Entre contas' });
    const transfer = summary(await repository.read());
    const purchase = { key: id(), type: 'purchase', cardId, amount: 30000, date: '2026-01-05', description: 'Compra de teste', splits: [
      { amount: 12000, categoryId }, { amount: 10000, personId: personA }, { amount: 8000, personId: personB },
    ] };
    await repository.execute(purchase);
    await repository.execute(purchase); // Same key must not duplicate the purchase.
    const state = await repository.read();
    await run({ type: 'reimbursement', receivableId: state.receivables.find((item: { amount: number }) => item.amount === 10000).id, accountId, amount: 6000, date: '2026-01-06', description: 'Reembolso parcial' });
    await run({ type: 'invoicePayment', invoiceId: state.invoices[0].id, accountId, amount: 30000, date: '2026-01-28', description: 'Fatura paga' });
    return { transfer, final: summary(await repository.read()) };
  });
  expect(result.transfer).toMatchObject({ cash: 100000, income: 0, expenses: 0, netWorth: 100000 });
  expect(result.final).toMatchObject({ cash: 76000, income: 0, expenses: 12000, receivables: 12000, invoices: 0, netWorth: 88000 });
  await page.reload();
  await expect(page.getByRole('status', { name: 'Estado do armazenamento' })).toContainText('IndexedDB disponível');
  const persisted = await page.evaluate(async () => {
    const databasePath = '/src/infrastructure/database.ts';
    const queriesPath = '/src/domain/queries.ts';
    const { localRepository } = await import(databasePath);
    const { summary } = await import(queriesPath);
    const state = await localRepository.read();
    return { totals: summary(state), purchases: state.purchases.length, receivables: state.receivables.length };
  });
  expect(persisted.totals).toEqual(result.final);
  expect(persisted.purchases).toBe(1);
  expect(persisted.receivables).toBe(2);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
});
