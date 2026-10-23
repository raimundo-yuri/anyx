import { describe, expect, it } from 'vitest';
import { fixture, purchaseCommand, uid, today } from '../test/finance-fixture';
import { balance, summary, receivablePlan } from './queries';
import { planningData } from '../application/planning';
import { dashboardData } from '../application/dashboard';
import { localAssistant } from '../application/assistant';

describe('Parcelas e recebíveis independentes', () => {
  it('E: preserva centavos, primeira fatura explícita e despesa única da compra original', () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), amount: 30001, installmentCount: 3, cycle: '2026-03', splits: [{ amount: 12001, categoryId: f.ids.expense }, { amount: 10000, personId: f.ids.person }, { amount: 8000, personId: f.ids.person2 }] });
    expect(f.state.installments.map(item => item.amount)).toEqual([10001, 10000, 10000]);
    expect(f.state.invoices.map(item => item.cycle)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(summary(f.state)).toMatchObject({ expenses: 12001, invoices: 30001, receivables: 18000 });
    expect(new Set(f.state.installments.map(item => item.purchaseId)).size).toBe(1);
    f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 10001, date: today, description: 'Primeira parcela' });
    expect(summary(f.state)).toMatchObject({ expenses: 12001, invoices: 20000 });
  });
  it('o plano de reembolso não replica o ativo nem depende das parcelas do cartão', () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), installmentCount: 3 });
    const receivableId = f.state.receivables[0].id;
    f.run({ type: 'scheduleReceivable', receivableId, count: 2, firstDueDate: '2026-01-31' });
    expect(receivablePlan(f.state, receivableId).map(item => item.dueDate)).toEqual(['2026-01-31', '2026-02-28']);
    f.run({ type: 'reimbursement', receivableId, accountId: f.ids.account, amount: 6000, date: today, description: 'Parcial' });
    expect(receivablePlan(f.state, receivableId).map(item => item.pending)).toEqual([0, 4000]);
    expect(summary(f.state)).toMatchObject({ income: 0, receivables: 12000, invoices: 30000 });
    expect(() => f.run({ type: 'scheduleReceivable', receivableId, count: 1, firstDueDate: today })).toThrow(/plano/);
  });
  it('editar cartão não altera as datas das faturas existentes', () => {
    const f = fixture(); f.run(purchaseCommand(f)); const invoice = structuredClone(f.state.invoices[0]);
    f.run({ type: 'updateCard', id: f.ids.card, name: 'Novo nome', limit: 90000, closingDay: 10, dueDay: 20 });
    expect(f.state.invoices[0]).toEqual(invoice);
  });
});

describe('Planejamento separado do realizado', () => {
  it('reservar para meta não gera consumo e liberação não gera renda', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createGoal', id, name: 'Reserva', accountId: f.ids.account, target: 50000, deadline: '2026-12-31' });
    f.run({ type: 'fundGoal', id, amount: 30000 });
    expect(summary(f.state)).toMatchObject({ cash: 100000, available: 70000, reserved: 30000, income: 0, expenses: 0 });
    expect(() => f.run({ type: 'fundGoal', id, amount: 50001 })).toThrow(/alvo/);
    f.run({ type: 'fundGoal', id, amount: 0 });
    expect(summary(f.state)).toMatchObject({ available: 100000, reserved: 0, income: 0 });
  });
  it('orçamento é único por categoria/mês e utiliza só consumo pessoal', () => {
    const f = fixture();
    for (const amount of [10000, 20000]) f.run({ type: 'setBudget', id: uid(), categoryId: f.ids.expense, month: '2026-01', amount });
    f.run(purchaseCommand(f));
    expect(f.state.budgets).toHaveLength(1);
    expect(planningData(f.state, '2026-01').budgets[0]).toMatchObject({ amount: 20000, spent: 12000 });
    expect(dashboardData(f.state, '2026-01').categories[0].amount).toBe(12000);
  });
  it('previsão não vira caixa até confirmação e não pode ser confirmada duas vezes', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createForecast', id, name: 'Receita prevista', kind: 'income', amount: 20000, accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, date: '2026-02-01' });
    expect(summary(f.state)).toMatchObject({ cash: 100000, income: 0 });
    expect(planningData(f.state, '2026-02').conservative).toBe(100000);
    expect(planningData(f.state, '2026-02', true).conservative).toBe(120000);
    f.run({ type: 'settleForecast', id, action: 'confirm', date: '2026-02-01' });
    expect(summary(f.state)).toMatchObject({ cash: 120000, income: 20000 });
    expect(() => f.run({ type: 'settleForecast', id, action: 'confirm', date: '2026-02-01' })).toThrow(/encerrada/);
  });
  it('recorrências geram previsões únicas com clamping de dias, sem lançamentos automáticos', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createRecurring', id, name: 'Assinatura', kind: 'expense', amount: 1000, day: 31, active: true, accountId: f.ids.account, categoryId: f.ids.expense });
    f.run({ type: 'generateForecasts', month: '2026-02' }); f.run({ type: 'generateForecasts', month: '2026-02' });
    expect(f.state.forecasts).toHaveLength(1); expect(f.state.forecasts[0].date).toBe('2026-02-28');
    expect(summary(f.state)).toMatchObject({ cash: 100000, expenses: 0 });
    f.run({ type: 'settleForecast', id: f.state.forecasts[0].id, action: 'cancel', date: '2026-02-28' });
    expect(summary(f.state).expenses).toBe(0);
  });
});

describe('Ativos, passivos e juros', () => {
  it('aporte/resgate não são consumo e avaliação não cria renda recebida', () => {
    const f = fixture(), investmentId = uid();
    f.run({ type: 'createInvestment', id: investmentId, name: 'Reserva aplicada' });
    f.run({ type: 'investmentFlow', direction: 'deposit', investmentId, accountId: f.ids.account, amount: 20000, date: today, description: 'Aporte' });
    expect(summary(f.state)).toMatchObject({ cash: 80000, expenses: 0, income: 0, netWorth: 100000 });
    f.run({ type: 'valueInvestment', investmentId, value: 22000, date: today });
    expect(summary(f.state)).toMatchObject({ cash: 80000, income: 0, netWorth: 102000 });
    f.run({ type: 'investmentFlow', direction: 'withdraw', investmentId, accountId: f.ids.account, amount: 10000, date: today, description: 'Resgate' });
    expect(summary(f.state)).toMatchObject({ cash: 90000, income: 0, expenses: 0, netWorth: 102000 });
    expect(balance(f.state, 'investment', investmentId)).toBe(12000);
    expect(() => f.run({ type: 'investmentFlow', direction: 'withdraw', investmentId, accountId: f.ids.account, amount: 12001, date: today, description: 'Excesso' })).toThrow(/Resgate/);
  });
  it('empréstimo concedido permanece no patrimônio e só juros recebidos são renda', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createLoan', id, description: 'Empréstimo', direction: 'lent', accountId: f.ids.account, personId: f.ids.person, amount: 10000, date: today, dueDate: '2026-03-05' });
    expect(summary(f.state)).toMatchObject({ cash: 90000, income: 0, expenses: 0, netWorth: 100000 });
    f.run({ type: 'repayLoan', id, accountId: f.ids.account, principalAmount: 6000, interestAmount: 500, sourceId: f.ids.source, categoryId: f.ids.income, date: today });
    expect(balance(f.state, 'loanAsset', id)).toBe(4000);
    expect(summary(f.state)).toMatchObject({ cash: 96500, income: 500, expenses: 0, netWorth: 100500 });
    expect(() => f.run({ type: 'repayLoan', id, accountId: f.ids.account, principalAmount: 4001, interestAmount: 0, date: today })).toThrow(/Principal/);
  });
  it('empréstimo recebido é passivo; pagar principal não repete despesa e juros são consumo', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createLoan', id, description: 'Crédito recebido', direction: 'borrowed', accountId: f.ids.account, personId: f.ids.person, amount: 10000, date: today, dueDate: '2026-03-05' });
    expect(summary(f.state)).toMatchObject({ cash: 110000, income: 0, netWorth: 100000 });
    f.run({ type: 'repayLoan', id, accountId: f.ids.account, principalAmount: 10000, interestAmount: 500, categoryId: f.ids.expense, date: today });
    expect(summary(f.state)).toMatchObject({ cash: 99500, expenses: 500, income: 0, netWorth: 99500 });
    expect(balance(f.state, 'loanDebt', id)).toBe(0);
  });
});

describe('Assistente local', () => {
  it('consulta dados reais e reconhece lançamento sem salvá-lo antes da confirmação', () => {
    const f = fixture(); const before = structuredClone(f.state);
    const answer = localAssistant.answer(f.state, 'gastei 12,50 em Alimentação na conta Principal', today);
    expect(answer.command).toMatchObject({ type: 'expense', amount: 1250, accountId: f.ids.account, categoryId: f.ids.expense });
    expect(f.state).toEqual(before);
    expect(localAssistant.answer(f.state, 'Quanto tenho disponível?', today).text).toContain('1.000,00');
  });
  it('pergunta quando uma conta é ambígua e não inventa um lançamento', () => {
    const f = fixture(); f.run({ type: 'createAccount', id: uid(), name: 'Principal', date: today, openingBalance: 0 });
    const answer = localAssistant.answer(f.state, 'gastei 12,50 em Alimentação na conta Principal', today);
    expect(answer.command).toBeUndefined(); expect(answer.text).toContain('nome exato');
  });
});
