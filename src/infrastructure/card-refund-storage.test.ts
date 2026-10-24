import { expect, it } from 'vitest';
import { fixture, purchaseCommand, uid } from '../test/finance-fixture';
import { FinanceDatabase, IndexedDbFinanceRepository } from './database';
import { summary } from '../domain/queries';

async function setup() {
  const f = fixture(); f.run(purchaseCommand(f));
  const database = new FinanceDatabase(`dexfin-refund-${uid()}`), repository = new IndexedDbFinanceRepository(database);
  await repository.replace(f.state, JSON.stringify(await repository.read()));
  const command = { key: uid(), type: 'purchaseRefund', purchaseId: f.state.purchases[0].id, invoiceId: f.state.invoices[0].id, amount: 30000, date: '2026-01-06', description: 'Devolução', allocations: f.state.splits.map(item => ({ splitId: item.id, amount: item.amount })) };
  return { f, database, repository, command };
}
it('duas conexões concorrentes não excedem o estorno e a repetição mantém o recibo', async () => {
  const { database, repository, command } = await setup(), second = new FinanceDatabase(database.name);
  try {
    const results = await Promise.allSettled([repository.execute(command), new IndexedDbFinanceRepository(second).execute({ ...command, key: uid() })]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const state = await repository.read(); expect(state.purchaseRefunds).toHaveLength(1); expect(summary(state).expenses).toBe(0);
    const receipt = state.receipts.find(item => item.id === state.purchaseRefunds[0].operationId)!;
    expect((await repository.execute(JSON.parse(receipt.payload))).replayed).toBe(true);
  } finally { second.close(); await database.delete(); }
});
it('falha ao gravar alocações reverte operação, crédito e recibo inteiro', async () => {
  const { database, repository, command, f } = await setup();
  try {
    database.rows('refundAllocations').hook('creating', () => { throw new Error('Falha simulada'); });
    await expect(repository.execute(command)).rejects.toThrow(/Falha simulada/);
    expect(await repository.read()).toEqual(await sorted(f.state));
  } finally { await database.delete(); }
});
function sorted(state: ReturnType<typeof fixture>['state']) {
  return Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, [...rows].sort((a, b) => a.id.localeCompare(b.id))]));
}
it('confirmação de prévia recusa alterações concorrentes mesmo com limite ainda válido', async () => {
  const { database, repository, command, f } = await setup();
  try {
    const snapshot = JSON.stringify(await repository.read());
    await repository.execute({ key: uid(), type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 1000, date: '2026-01-06', description: 'Recebimento em outra aba' });
    await expect(repository.executeReviewed(command, snapshot)).rejects.toThrow(/mudaram/);
    expect((await repository.read()).purchaseRefunds).toEqual([]);
    await repository.executeReviewed(command, JSON.stringify(await repository.read()));
    expect(summary(await repository.read()).personPayable).toBe(1000);
  } finally { await database.delete(); }
});
