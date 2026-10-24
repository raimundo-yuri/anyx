import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { fixture, purchaseCommand, uid } from '../test/finance-fixture';
import { FinanceDatabase, IndexedDbFinanceRepository } from './database';
import { summary } from '../domain/queries';

// Historical schemas are fixtures: do not replace them with the current database definition.
const versionOne = {
  accounts: 'id', categories: 'id, kind', people: 'id', sources: 'id', cards: 'id',
  invoices: 'id, cardId, &[cardId+cycle]', operations: 'id, date, kind',
  entries: 'id, operationId, [ledger+referenceId]', purchases: 'id, operationId, invoiceId',
  splits: 'id, purchaseId, personId', receivables: 'id, &splitId, personId',
  reserves: 'id, accountId, &contributionId', rules: 'id',
  contributions: 'id, &[incomeId+ruleId], status', receipts: 'id',
};
const versionTwo = {
  ...versionOne,
  installments: 'id, purchaseId, invoiceId, &[purchaseId+index]',
  receivableSchedules: 'id, receivableId, &[receivableId+index]', goals: 'id, accountId',
  budgets: 'id, &[categoryId+month]', forecasts: 'id, date, recurringId',
  recurrings: 'id', investments: 'id', loans: 'id, personId',
};

const versionThree = { ...versionTwo, operations: 'id, date, kind, relatedId' };

const versionFour = { ...versionThree, categories: 'id, kind, parentId' };

it.each([1, 2, 3, 4])('atualiza banco v%i para v5 preservando compras, saldos e idempotência', async version => {
  const name = `dexfin-migration-${uid()}`, legacy = new Dexie(name);
  legacy.version(version).stores(version === 1 ? versionOne : version === 2 ? versionTwo : version === 3 ? versionThree : versionFour);
  const f = fixture(), command = { ...purchaseCommand(f), installmentCount: version === 1 ? 1 : 3 }; f.run(command);
  const current = new FinanceDatabase(name);
  try {
    await legacy.open();
    for (const table of legacy.tables) await table.bulkPut(f.state[table.name as keyof typeof f.state]);
    legacy.close();
    const repository = new IndexedDbFinanceRepository(current), state = await repository.read();
    expect(current.verno).toBe(5);
    expect(current.rows('categories').schema.indexes.some(index => index.name === 'parentId')).toBe(true);
    expect(current.rows('operations').schema.indexes.some(index => index.name === 'relatedId')).toBe(true);
    expect(state.purchaseRefunds).toEqual([]); expect(state.refundAllocations).toEqual([]);
    expect(state.installments).toHaveLength(version === 1 ? 1 : 3);
    expect(summary(state)).toEqual(summary(f.state));
    expect((await repository.execute(command)).replayed).toBe(true);
    const income = { key: uid(), type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: '2026-01-05', description: 'Teste após migração' };
    await repository.execute(income);
    await repository.execute({ key: uid(), type: 'reverseMovement', operationId: income.key, reason: 'Registro de teste incorreto' });
    expect(summary(await repository.read())).toEqual(summary(f.state));
  } finally { legacy.close(); await current.delete(); }
});
