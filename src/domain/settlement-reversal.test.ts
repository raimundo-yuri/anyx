import { expect, it } from 'vitest';
import { fixture, purchaseCommand, uid } from '../test/finance-fixture';
import { balance, receivablePlan, summary } from './queries';
import { plainBackup, readBackup } from '../portability/backup';
import { reversalPreview } from '../application/reversal-preview';
function setup() { const f = fixture(); f.run(purchaseCommand(f)); return f; }
it('corrige pagamento de fatura sem apagar compra ou pagamento e sem nova receita', () => {
  const f = setup(), before = summary(f.state), originalEntries = structuredClone(f.state.entries);
  const paid = f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 15000, date: '2026-01-06', description: 'Pagamento incorreto' });
  const correction = { key: uid(), type: 'reverseMovement', operationId: paid.resultId, reason: 'Valor não foi pago' };
  expect(reversalPreview(f.state, paid.resultId).ledgerChanges[0]).toMatchObject({ ledger: 'card', delta: 15000, after: 30000 });
  f.run(correction); expect(summary(f.state)).toEqual(before); expect(f.state.entries.slice(0, originalEntries.length)).toEqual(originalEntries);
  expect(f.run(correction).replayed).toBe(true); expect(() => f.run({ ...correction, key: uid() })).toThrow(/já foi estornado/);
});
it('corrige reembolso e reabre o cronograma sem inventar renda ou apagar o recebido', () => {
  const f = setup(), id = f.state.receivables[0].id;
  f.run({ type: 'scheduleReceivable', receivableId: id, count: 2, firstDueDate: '2026-02-01' });
  const received = f.run({ type: 'reimbursement', receivableId: id, accountId: f.ids.account, amount: 6000, date: '2026-01-06', description: 'Recebimento errado' });
  expect(receivablePlan(f.state, id).map(item => item.pending)).toEqual([0, 4000]);
  f.run({ type: 'reverseMovement', operationId: received.resultId, reason: 'Não recebi este valor' });
  expect(receivablePlan(f.state, id).map(item => item.pending)).toEqual([5000, 5000]); expect(summary(f.state).income).toBe(0); expect(balance(f.state, 'cash')).toBe(100000);
});
it('corrige devolução comercial ainda não utilizada, preserva o rateio e permite novo crédito correto', () => {
  const f = setup(), purchase = f.state.purchases[0];
  const before = summary(f.state);
  const refund = f.run({ type: 'purchaseRefund', purchaseId: purchase.id, invoiceId: purchase.invoiceId, amount: purchase.amount, date: '2026-01-07', description: 'Crédito digitado indevidamente', allocations: f.state.splits.map(item => ({ splitId: item.id, amount: item.amount })) });
  const operationId = f.state.purchaseRefunds.find(item => item.id === refund.resultId)!.operationId;
  f.run({ type: 'reverseMovement', operationId, reason: 'O emissor não confirmou esse crédito' });
  expect(summary(f.state)).toEqual(before); expect(f.state.purchaseRefunds).toHaveLength(1); expect(f.state.refundAllocations).toHaveLength(3);
  f.run({ type: 'purchaseRefund', purchaseId: purchase.id, invoiceId: purchase.invoiceId, amount: purchase.amount, date: '2026-01-08', description: 'Crédito efetivo', allocations: f.state.splits.map(item => ({ splitId: item.id, amount: item.amount })) });
  expect(summary(f.state)).toMatchObject({ expenses: 0, invoices: 0, receivables: 0 });
});
it('bloqueia corrigir crédito consumido por outra fatura até corrigir sua utilização', () => {
  const f = setup(), purchase = f.state.purchases[0];
  f.run({ type: 'invoicePayment', invoiceId: purchase.invoiceId, accountId: f.ids.account, amount: 30000, date: '2026-01-06', description: 'Pagamento real' });
  f.run({ type: 'purchaseRefund', purchaseId: purchase.id, invoiceId: purchase.invoiceId, amount: 30000, date: '2026-01-07', description: 'Devolução incorreta', allocations: f.state.splits.map(item => ({ splitId: item.id, amount: item.amount })) });
  const original = f.state.purchaseRefunds[0].operationId;
  f.run({ ...purchaseCommand(f), date: '2026-02-01' });
  const use = f.run({ type: 'cardCreditUse', invoiceId: f.state.invoices[1].id, amount: 1000, date: '2026-02-02', description: 'Compensação informada' });
  const before = structuredClone(f.state); expect(reversalPreview(f.state, original).blockedReason).not.toBe('');
  expect(() => f.run({ type: 'reverseMovement', operationId: original, reason: 'Crédito não existiu' })).toThrow(); expect(f.state).toEqual(before);
  f.run({ type: 'reverseMovement', operationId: use.resultId, reason: 'Compensação incorreta' });
  f.run({ type: 'reverseMovement', operationId: original, reason: 'Crédito não existiu' }); expect(balance(f.state, 'cardCredit')).toBe(0);
});
it('bloqueia corrigir devolução já paga a pessoa e libera depois de corrigir a saída incorreta', () => {
  const f = setup(), purchase = f.state.purchases[0], receivableId = f.state.receivables[0].id;
  f.run({ type: 'reimbursement', receivableId, accountId: f.ids.account, amount: 6000, date: '2026-01-06', description: 'Reembolso real' });
  f.run({ type: 'purchaseRefund', purchaseId: purchase.id, invoiceId: purchase.invoiceId, amount: 10000, date: '2026-01-07', description: 'Crédito incorreto', allocations: [{ splitId: f.state.splits[1].id, amount: 10000 }] });
  const original = f.state.purchaseRefunds[0].operationId;
  const returned = f.run({ type: 'personRefund', receivableId, accountId: f.ids.account, amount: 6000, date: '2026-01-08', description: 'Devolução informada incorretamente' });
  expect(() => f.run({ type: 'reverseMovement', operationId: original, reason: 'Crédito incorreto' })).toThrow();
  f.run({ type: 'reverseMovement', operationId: returned.resultId, reason: 'Dinheiro não saiu' });
  f.run({ type: 'reverseMovement', operationId: original, reason: 'Crédito não existiu' });
  expect(summary(f.state)).toMatchObject({ cash: 106000, receivables: 12000, personPayable: 0, invoices: 30000, income: 0 });
});
it('backup v6 mantém correções e recusa disfarçá-las como formato v5', async () => {
  const f = setup(); const paid = f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 1, date: '2026-01-06', description: 'Pagamento incorreto' });
  f.run({ type: 'reverseMovement', operationId: paid.resultId, reason: 'Erro' }); const exported = plainBackup(f.state);
  expect(await readBackup(exported)).toEqual(f.state); const legacy = JSON.parse(exported); legacy.version = 5;
  await expect(readBackup(JSON.stringify(legacy))).rejects.toThrow(/versão 6/);
});
