import { describe, expect, it } from 'vitest';
import { fixture, purchaseCommand, uid } from '../test/finance-fixture';
import { balance, receivablePlan, summary } from './queries';
import { assertState } from './integrity';
import { plainBackup, readBackup, encryptedBackup } from '../portability/backup';
import { dashboardData } from '../application/dashboard';
import { planningData } from '../application/planning';
import { localAssistant } from '../application/assistant';
import { exportCsv, parseCsv } from '../portability/csv';

function scenario(payment = 0, installments = 1, schedule = false) {
  const f = fixture(); f.run({ ...purchaseCommand(f), installmentCount: installments });
  const purchase = f.state.purchases[0], invoice = f.state.invoices[0];
  if (schedule) f.run({ type: 'scheduleReceivable', receivableId: f.state.receivables[0].id, count: 2, firstDueDate: '2026-02-05' });
  if (payment) f.run({ type: 'invoicePayment', invoiceId: invoice.id, accountId: f.ids.account, amount: payment, date: '2026-01-06', description: 'Fatura paga' });
  f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 6000, date: '2026-01-07', description: 'A pagou 60' });
  const refund = (amounts = [12000, 10000, 8000], date = '2026-01-10') => ({ type: 'purchaseRefund', key: uid(), date, description: 'Devolução confirmada pelo emissor', purchaseId: purchase.id, invoiceId: invoice.id, amount: amounts.reduce((a, b) => a + b, 0), allocations: f.state.splits.filter(item => item.purchaseId === purchase.id).map((item, index) => ({ splitId: item.id, amount: amounts[index] })).filter(item => item.amount > 0) });
  return { f, purchase, invoice, refund };
}

describe('Devolução comercial de cartão e terceiros', () => {
  it.each([0, 15000, 30000])('devolução integral com fatura paga em %i preserva caixa, terceiros e patrimônio', paid => {
    const { f, refund } = scenario(paid), before = structuredClone(f.state), command = refund();
    f.run(command);
    expect(summary(f.state)).toMatchObject({ cash: 106000 - paid, cardCredit: paid, invoices: 0, receivables: 0, personPayable: 6000, expenses: 0, income: 0, netWorth: 100000 });
    for (const table of ['purchases', 'splits', 'installments', 'receivables', 'contributions'] as const) expect(f.state[table]).toEqual(before[table]);
    expect(f.state.entries.filter(item => before.entries.some(entry => entry.id === item.id))).toEqual(before.entries);
    expect(f.run(command).replayed).toBe(true);
    expect(f.state.purchaseRefunds).toHaveLength(1);
    const receivableId = f.state.receivables[0].id;
    f.run({ type: 'personRefund', receivableId, accountId: f.ids.account, date: '2026-01-11', amount: 6000, description: 'Valor devolvido a A' });
    expect(summary(f.state)).toMatchObject({ cash: 100000 - paid, cardCredit: paid, personPayable: 0, expenses: 0, income: 0, netWorth: 100000 });
  });
  it.each([0, 15000, 30000])('devolução parcial com fatura paga em %i usa o rateio explícito', paid => {
    const { f, refund } = scenario(paid); f.run(refund([2000, 5000, 2000]));
    expect(summary(f.state)).toMatchObject({ cash: 106000 - paid, expenses: 10000, receivables: 6000, personPayable: 1000, cardCredit: paid === 30000 ? 9000 : 0, invoices: Math.max(30000 - paid - 9000, 0), netWorth: 90000 });
  });
  it('parcelas futuras permanecem e o crédito só reduz a fatura escolhida', () => {
    const { f, refund } = scenario(10000, 3), installments = structuredClone(f.state.installments);
    f.run(refund());
    expect(f.state.installments).toEqual(installments);
    expect(summary(f.state)).toMatchObject({ invoices: 20000, cardCredit: 30000, personPayable: 6000, netWorth: 100000 });
    f.run({ type: 'cardCreditUse', invoiceId: f.state.invoices[1].id, amount: 10000, date: '2026-01-11', description: 'Crédito compensado em fevereiro' });
    expect(summary(f.state)).toMatchObject({ invoices: 10000, cardCredit: 20000, cash: 96000, netWorth: 100000 });
    expect(balance(f.state, 'card', f.state.invoices[2].id)).toBe(10000);
  });
  it('vários estornos parciais respeitam centavos e o limite de cada divisão', () => {
    const { f, refund } = scenario(); f.run(refund([1, 0, 0])); f.run(refund([11999, 10000, 8000]));
    const before = structuredClone(f.state);
    expect(() => f.run(refund([1, 0, 0]))).toThrow(/excede/); expect(f.state).toEqual(before);
    expect(summary(f.state).expenses).toBe(0);
  });
  it('pessoa repetida mantém duas origens e obrigações independentes', () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), splits: [{ amount: 12000, categoryId: f.ids.expense }, { amount: 10000, personId: f.ids.person }, { amount: 8000, personId: f.ids.person }] });
    f.run({ type: 'reimbursement', receivableId: f.state.receivables[1].id, accountId: f.ids.account, amount: 8000, date: '2026-01-06', description: 'Segunda divisão paga' });
    f.run({ type: 'purchaseRefund', purchaseId: f.state.purchases[0].id, invoiceId: f.state.invoices[0].id, amount: 18000, allocations: f.state.splits.slice(1).map(item => ({ splitId: item.id, amount: item.amount })), date: '2026-01-07', description: 'Devolução de terceiros' });
    expect(balance(f.state, 'personPayable', f.state.receivables[0].id)).toBe(0);
    expect(balance(f.state, 'personPayable', f.state.receivables[1].id)).toBe(8000);
    expect(summary(f.state)).toMatchObject({ expenses: 12000, income: 0, receivables: 0, personPayable: 8000, netWorth: 88000 });
  });
  it('plano distingue pagamento de cancelamento e reduz as últimas parcelas', () => {
    const { f, refund } = scenario(0, 1, true); f.run(refund([0, 5000, 0]));
    expect(receivablePlan(f.state, f.state.receivables[0].id).map(item => ({ paid: item.paid, cancelled: item.cancelled, pending: item.pending }))).toEqual([{ paid: 5000, cancelled: 0, pending: 0 }, { paid: 0, cancelled: 5000, pending: 0 }]);
    expect(summary(f.state).personPayable).toBe(1000);
  });
  it('recusa rateio inválido, duplicado, de outra compra e crédito em outro cartão', () => {
    const { f, refund } = scenario(), valid = refund(), before = structuredClone(f.state);
    expect(() => f.run({ ...valid, amount: 29999 })).toThrow(/soma/);
    expect(() => f.run({ ...valid, allocations: [valid.allocations[0], valid.allocations[0]] })).toThrow(/repetida/);
    f.run({ ...purchaseCommand(f), date: '2026-01-06' });
    expect(() => f.run({ ...refund([1, 0, 0]), allocations: [{ splitId: f.state.splits[3].id, amount: 1 }] })).toThrow(/outra compra/);
    f.run({ type: 'createCard', id: uid(), name: 'Outro cartão', limit: 100000, closingDay: 20, dueDay: 28 });
    f.run({ ...purchaseCommand(f), cardId: f.state.cards[1].id });
    expect(() => f.run({ ...refund(), invoiceId: f.state.invoices.find(item => item.cardId === f.state.cards[1].id)!.id })).toThrow(/mesmo cartão/);
    expect(f.state.purchaseRefunds).toHaveLength(0); expect(f.state.entries.slice(0, before.entries.length)).toEqual(before.entries);
  });
  it('recusa estorno retroativo antes de reembolso ou outro movimento do cartão', () => {
    const { f, refund } = scenario();
    expect(() => f.run(refund([12000, 10000, 8000], '2026-01-06'))).toThrow(/posteriores/);
    f.run(refund([2000, 5000, 2000]));
    const forged = structuredClone(f.state); forged.operations.find(item => item.kind === 'purchaseRefund')!.date = '2026-01-06';
    expect(() => assertState(forged)).toThrow(/histórico|Histórico|retroativo/);
    expect(f.state.purchaseRefunds).toHaveLength(1);
  });
  it('crédito e devolução exigem cobertura na data e no saldo atual', () => {
    const { f, refund } = scenario(30000); f.run(refund());
    const receivableId = f.state.receivables[0].id;
    const back = { type: 'personRefund', receivableId, accountId: f.ids.account, amount: 6000, description: 'Devolver', date: '2026-01-11' };
    expect(() => f.run({ ...back, amount: 6001 })).toThrow(/excede/);
    expect(() => f.run({ ...back, date: '2026-01-06' })).toThrow(/na data/);
    f.run({ type: 'createGoal', id: uid(), accountId: f.ids.account, name: 'Reserva', target: 75000, deadline: '2026-12-01' });
    f.run({ type: 'fundGoal', id: f.state.goals[0].id, amount: 75000 });
    expect(() => f.run(back)).toThrow(/reservado/);
    f.run({ type: 'fundGoal', id: f.state.goals[0].id, amount: 0 }); f.run(back);
    expect(() => f.run(back)).toThrow(/excede/);
    f.run({ ...purchaseCommand(f), date: '2026-02-01' });
    const use = { type: 'cardCreditUse', invoiceId: f.state.invoices[1].id, amount: 30000, description: 'Compensar', date: '2026-02-02' };
    expect(() => f.run({ ...use, date: '2026-01-09' })).toThrow(/na data/);
    expect(() => f.run({ ...use, amount: 30001 })).toThrow(/excede/);
    f.run(use); expect(summary(f.state).cardCredit).toBe(0); expect(() => f.run(use)).toThrow(/excede/);
  });
  it('prefixos impedem pagamento retroativo de consumir crédito já usado', () => {
    const { f, refund } = scenario(30000); f.run(refund());
    f.run({ ...purchaseCommand(f), date: '2026-02-01' });
    f.run({ type: 'cardCreditUse', invoiceId: f.state.invoices[1].id, amount: 30000, date: '2026-02-03', description: 'Crédito utilizado' });
    f.run({ ...purchaseCommand(f), date: '2026-02-04' });
    const before = structuredClone(f.state);
    expect(() => f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[1].id, accountId: f.ids.account, amount: 1, date: '2026-02-02', description: 'Retroativo excessivo' })).toThrow(/retroativo/);
    expect(f.state).toEqual(before);
  });
  it('restauração recusa passivo antecipado, alocação adulterada e operação sem registro', async () => {
    const { f, refund } = scenario(); f.run(refund());
    const forged = structuredClone(f.state); forged.refundAllocations[0].amount++;
    expect(() => assertState(forged)).toThrow(/Alocações/);
    const orphan = structuredClone(f.state); orphan.purchaseRefunds = [];
    expect(() => assertState(orphan)).toThrow(/Estorno|Estorno|estorno/);
    const excess = structuredClone(f.state); excess.refundAllocations[1].amount += 10000; excess.purchaseRefunds[0].amount += 10000;
    expect(() => assertState(excess)).toThrow();
    const backup = JSON.parse(plainBackup(f.state)); backup.version = 4;
    await expect(readBackup(JSON.stringify(backup))).rejects.toThrow(/versão 5/);
  });
  it('backup v5, criptografia, CSV e leitura de v4 preservam os vínculos', async () => {
    const { f, refund } = scenario(30000), legacy = JSON.parse(plainBackup(f.state)); legacy.version = 4;
    delete legacy.state.purchaseRefunds; delete legacy.state.refundAllocations;
    expect(await readBackup(JSON.stringify(legacy))).toEqual(f.state);
    f.run(refund());
    expect(JSON.parse(plainBackup(f.state)).version).toBe(5);
    expect(await readBackup(plainBackup(f.state))).toEqual(f.state);
    expect(await readBackup(await encryptedBackup(f.state, 'teste seguro 123'), 'teste seguro 123')).toEqual(f.state);
    expect(parseCsv(exportCsv(f.state, 'refundAllocations'))).toHaveLength(4);
    const missing = JSON.parse(plainBackup(f.state)); delete missing.state.refundAllocations;
    await expect(readBackup(JSON.stringify(missing))).rejects.toThrow();
  });
  it('devolução em outro mês mantém consumo negativo, orçamento e projeção coerentes', () => {
    const { f, refund } = scenario(30000); f.run(refund(undefined, '2026-02-01'));
    expect(summary(f.state, { from: '2026-01-01', to: '2026-01-31' }).expenses).toBe(12000);
    const data = dashboardData(f.state, '2026-02'); expect(data.totals.expenses).toBe(-12000); expect(data.categories[0].amount).toBe(-12000);
    f.run({ type: 'setBudget', id: uid(), categoryId: f.ids.expense, month: '2026-02', amount: 10000 });
    expect(planningData(f.state, '2026-02')).toMatchObject({ personPayable: 6000, cardCredit: 30000, conservative: 70000, budgets: [{ spent: -12000 }] });
    expect(localAssistant.answer(f.state, 'quanto devo devolver?', '2026-02-02').text).toContain('60,00');
    expect(localAssistant.answer(f.state, 'faturas', '2026-02-02').text).toContain('300,00');
  });
});
