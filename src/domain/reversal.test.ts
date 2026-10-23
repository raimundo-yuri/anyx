import { describe, expect, it } from 'vitest';
import { fixture, purchaseCommand, today, uid } from '../test/finance-fixture';
import { balance, reversalFor, summary } from './queries';
import { assertState } from './integrity';
import { movementRows } from '../application/finance-view';
import { planningData } from '../application/planning';
import { reversalPreview } from '../application/reversal-preview';

describe('Estorno integral de correção', () => {
  it('preserva o original e anula caixa, consumo e orçamento na data original', () => {
    const f = fixture();
    f.run({ type: 'setBudget', id: uid(), categoryId: f.ids.expense, month: '2026-01', amount: 10000 });
    const { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1250, date: today, description: 'Almoço duplicado' });
    const original = structuredClone(f.state.operations.find(item => item.id === resultId));
    const entries = structuredClone(f.state.entries.filter(item => item.operationId === resultId));
    expect(reversalPreview(f.state, resultId).changes[0]).toMatchObject({ delta: 1250, after: 100000 });
    const reversed = f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Registro duplicado' });
    expect(f.state.operations.find(item => item.id === resultId)).toEqual(original);
    expect(f.state.entries.filter(item => item.operationId === resultId)).toEqual(entries);
    expect(reversalFor(f.state, resultId)).toMatchObject({ id: reversed.resultId, date: today, relatedId: resultId, description: 'Registro duplicado' });
    expect(summary(f.state)).toMatchObject({ cash: 100000, expenses: 0, income: 0, netWorth: 100000 });
    expect(summary(f.state, { from: '2026-01-01', to: '2026-01-31' }).expenses).toBe(0);
    expect(summary(f.state, { from: '2026-02-01', to: '2026-02-28' }).expenses).toBe(0);
    expect(planningData(f.state, '2026-01').budgets[0].spent).toBe(0);
    const rows = movementRows(f.state, { query: 'Almoço duplicado', kind: '', accountId: '', from: '', to: '' });
    expect(rows).toHaveLength(2); expect(rows.find(item => item.id === resultId)?.reversal?.id).toBe(reversed.resultId);
    expect(rows.find(item => item.id === reversed.resultId)).toMatchObject({ direction: 'in', label: 'Estorno de despesa', original });
  });

  it('libera contribuições pendentes e preserva pagamentos já realizados da receita', () => {
    const f = fixture();
    for (const [name, mode] of [['Sugestão', 'suggest'], ['Reserva', 'reserve'], ['Paga', 'suggest']]) f.run({ type: 'createRule', id: uid(), name, enabled: true, basisPoints: 1000, sourceIds: [f.ids.source], mode });
    const { resultId } = f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today, description: 'Receita duplicada' });
    const paidId = f.state.contributions[2].id;
    f.run({ type: 'settleContribution', contributionId: paidId, categoryId: f.ids.expense, date: today, action: 'pay' });
    const paid = structuredClone(f.state.contributions[2]), payments = structuredClone(f.state.entries.filter(item => item.operationId === paid.paymentId));
    expect(reversalPreview(f.state, resultId)).toMatchObject({ pending: [{ status: 'suggested' }, { status: 'reserved' }], paid: [{ id: paidId }] });
    const reversal = f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Renda cadastrada duas vezes' });
    expect(f.state.contributions.slice(0, 2).every(item => item.status === 'cancelled' && item.cancelledById === reversal.resultId)).toBe(true);
    expect(f.state.contributions[2]).toEqual(paid);
    expect(f.state.entries.filter(item => item.operationId === paid.paymentId)).toEqual(payments);
    expect(summary(f.state)).toMatchObject({ cash: 99000, income: 0, expenses: 1000, reserved: 0, available: 99000 });
    expect(() => f.run({ type: 'settleContribution', contributionId: f.state.contributions[0].id, date: today, action: 'pay', categoryId: f.ids.expense })).toThrow(/encerrada/);
  });

  it('restaura as duas contas da transferência sem gerar renda ou despesa', () => {
    const f = fixture(), command = { type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 10000, date: today, description: 'Transferência duplicada' };
    const { resultId } = f.run(command);
    const reversal = f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Duplicada' });
    expect(balance(f.state, 'cash', f.ids.account)).toBe(100000); expect(balance(f.state, 'cash', f.ids.other)).toBe(0);
    expect(summary(f.state)).toMatchObject({ cash: 100000, income: 0, expenses: 0 });
    const row = movementRows(f.state).find(item => item.id === reversal.resultId)!;
    expect(row).toMatchObject({ direction: 'neutral', accounts: ['Carteira', 'Principal'], cashChange: 0, amount: 10000 });
  });

  it('retentativa com a mesma chave é idempotente; outra chave não estorna duas vezes', () => {
    const f = fixture(), { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1000, date: today, description: 'Incorreta' });
    const command = { type: 'reverseMovement', operationId: resultId, reason: 'Duplicada', key: uid() };
    const result = f.run(command), snapshot = structuredClone(f.state);
    expect(f.run(command)).toMatchObject({ resultId: result.resultId, replayed: true });
    expect(() => f.run({ ...command, key: uid() })).toThrow(/já foi estornado/);
    expect(() => f.run({ ...command, reason: 'Outro motivo' })).toThrow(/idempotência/);
    expect(f.state).toEqual(snapshot);
  });

  it('recusa estorno que deixaria reservas de meta sem cobertura, sem gravar uma correção parcial', () => {
    const f = fixture(), { resultId } = f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today, description: 'Incorreta' }), goalId = uid();
    f.run({ type: 'createGoal', id: goalId, name: 'Reserva', accountId: f.ids.account, target: 110000, deadline: '2026-12-31' });
    f.run({ type: 'fundGoal', id: goalId, amount: 105000 });
    const before = structuredClone(f.state);
    expect(reversalPreview(f.state, resultId).blockedReason).toMatch(/reservas sem cobertura/);
    expect(() => f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Duplicada' })).toThrow(/reservado/);
    expect(f.state).toEqual(before);
    f.run({ type: 'fundGoal', id: goalId, amount: 100000 });
    f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Duplicada' });
    expect(summary(f.state)).toMatchObject({ cash: 100000, available: 0, reserved: 100000 });
  });

  it('exige reativar a conta, preservando categorias arquivadas no histórico', () => {
    const f = fixture(), { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 100000, date: today, description: 'Saldo gasto por engano' });
    f.run({ type: 'setArchived', entity: 'account', id: f.ids.account, archived: true });
    f.run({ type: 'setArchived', entity: 'category', id: f.ids.expense, archived: true });
    expect(reversalPreview(f.state, resultId).blockedReason).toMatch(/Reative/);
    expect(() => f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Incorreta' })).toThrow(/arquivada/);
    f.run({ type: 'setArchived', entity: 'account', id: f.ids.account, archived: false });
    f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Incorreta' });
    expect(summary(f.state).cash).toBe(100000);
    expect(f.state.categories.find(item => item.id === f.ids.expense)?.archived).toBe(true);
  });

  it('a realização da previsão fica vinculada ao original sem ser reaberta ou liquidada de novo', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createForecast', id, kind: 'expense', name: 'Assinatura', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1000, date: today });
    f.run({ type: 'settleForecast', id, action: 'confirm', date: today });
    const operationId = f.state.forecasts[0].operationId!;
    f.run({ type: 'reverseMovement', operationId, reason: 'Confirmei por engano' });
    expect(f.state.forecasts[0].operationId).toBe(operationId);
    expect(planningData(f.state, '2026-01').predictedExpense).toBe(0);
    expect(summary(f.state)).toMatchObject({ cash: 100000, expenses: 0 });
    expect(() => f.run({ type: 'settleForecast', id, action: 'confirm', date: today })).toThrow(/encerrada/);
  });

  it('corrigir receita fictícia pode revelar saldo negativo real sem fabricar caixa', () => {
    const f = fixture(), { resultId } = f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today, description: 'Receita incorreta' });
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 110000, date: today, description: 'Pagamento real' });
    f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Não foi recebida' });
    expect(summary(f.state)).toMatchObject({ cash: -10000, income: 0, expenses: 110000 });
  });

  it('recusa tipos fora do escopo, estorno de estorno, motivo vazio e data arbitrária', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    for (const operationId of [f.state.operations[0].id, f.state.purchases[0].operationId]) expect(() => f.run({ type: 'reverseMovement', operationId, reason: 'Incorreta' })).toThrow(/receitas, despesas e transferências/);
    const { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1000, date: today, description: 'Incorreta' });
    expect(() => f.run({ type: 'reverseMovement', operationId: resultId, reason: '  ' })).toThrow();
    expect(() => f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Incorreta', date: '2026-02-01' })).toThrow();
    expect(() => f.run({ type: 'reverseMovement', operationId: uid(), reason: 'Incorreta' })).toThrow(/não encontrado/);
    const reversal = f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Incorreta' });
    expect(() => f.run({ type: 'reverseMovement', operationId: reversal.resultId, reason: 'Voltar' })).toThrow(/receitas, despesas e transferências/);
  });

  it('valida a inversão exata, a data e a unicidade mesmo em snapshots importados', () => {
    const f = fixture(), { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1000, date: today, description: 'Incorreta' });
    const reversed = f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Duplicada' });
    const amount = structuredClone(f.state); amount.entries.filter(item => item.operationId === reversed.resultId).forEach(item => item.amount++);
    expect(() => assertState(amount)).toThrow(/incompatível/);
    const account = structuredClone(f.state); account.entries.find(item => item.operationId === reversed.resultId && item.ledger === 'cash')!.referenceId = f.ids.other;
    expect(() => assertState(account)).toThrow(/incompatível/);
    const date = structuredClone(f.state); date.operations.find(item => item.id === reversed.resultId)!.date = '2026-02-01';
    expect(() => assertState(date)).toThrow(/data original/);
    const duplicate = structuredClone(f.state), id = uid();
    duplicate.operations.push({ ...reversalFor(f.state, resultId)!, id });
    duplicate.entries.push(...f.state.entries.filter(item => item.operationId === reversed.resultId).map(item => ({ ...item, id: uid(), operationId: id })));
    expect(() => assertState(duplicate)).toThrow(/mais de uma vez/);
  });
});
