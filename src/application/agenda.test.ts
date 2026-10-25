import { describe, expect, it } from 'vitest';
import { fixture, purchaseCommand, uid } from '../test/finance-fixture';
import { emptyState } from '../domain/model';
import { summary, balance } from '../domain/queries';
import { agendaCounts, agendaItems, agendaMonth, filterAgenda } from './agenda';
import { localAssistant } from './assistant';

describe('Agenda de pendências atuais', () => {
  it('começa vazia e não cria calendário financeiro fictício', () => {
    expect(agendaItems(emptyState(), '2026-01-10')).toEqual([]);
    expect(agendaCounts([])).toEqual({ total: 0, overdue: 0, today: 0, undated: 0 });
  });
  it('uma fatura por ciclo reúne compras e mostra somente o saldo ainda pendente', () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), installmentCount: 3 }); f.run({ ...purchaseCommand(f), installmentCount: 3 });
    f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 5000, date: '2026-01-06', description: 'Pagamento parcial' });
    const invoices = agendaItems(f.state, '2026-01-28').filter(item => item.kind === 'invoice');
    expect(invoices).toHaveLength(3); expect(invoices.map(item => item.amount)).toEqual([15000, 20000, 20000]);
    expect(invoices[0]).toMatchObject({ date: '2026-01-28', status: 'today', page: 'cards', flow: 'outgoing' });
    expect(invoices.reduce((total, item) => total + item.amount, 0)).toBe(balance(f.state, 'card'));
  });
  it('cronograma de terceiro é independente do cartão e não duplica o recebível', () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), installmentCount: 3 });
    f.run({ type: 'scheduleReceivable', receivableId: f.state.receivables[0].id, count: 2, firstDueDate: '2026-02-05' });
    f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 6000, date: '2026-01-06', description: 'Recebi parte de A' });
    const receivables = agendaItems(f.state, '2026-02-10').filter(item => item.kind === 'receivable');
    expect(receivables).toHaveLength(2);
    expect(receivables.find(item => item.date !== null)).toMatchObject({ amount: 4000, date: '2026-03-05', status: 'upcoming', flow: 'incoming' });
    expect(receivables.find(item => item.date === null)).toMatchObject({ amount: 8000, status: 'undated' });
    expect(receivables.reduce((total, item) => total + item.amount, 0)).toBe(summary(f.state).receivables);
  });
  it('um reembolso sem plano usa a data prometida da divisão, sem assumir data quando ausente', () => {
    const f = fixture(), command = purchaseCommand(f); f.run({ ...command, splits: command.splits.map((split, index) => index === 1 ? { ...split, dueDate: '2026-01-12' } : split) });
    const receivables = agendaItems(f.state, '2026-01-12').filter(item => item.kind === 'receivable');
    expect(receivables.filter(item => item.status === 'today')).toHaveLength(1);
    expect(receivables.filter(item => item.status === 'undated')).toHaveLength(1);
  });
  it('devolução cancela parcelas prometidas e mostra a obrigação com pessoa sem inventar vencimento', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    f.run({ type: 'scheduleReceivable', receivableId: f.state.receivables[0].id, count: 2, firstDueDate: '2026-02-05' });
    f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 30000, date: '2026-01-06', description: 'Fatura quitada' });
    f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 6000, date: '2026-01-07', description: 'A pagou' });
    f.run({ type: 'purchaseRefund', purchaseId: f.state.purchases[0].id, invoiceId: f.state.invoices[0].id, amount: 5000, date: '2026-01-08', description: 'Parte de A devolvida', allocations: [{ splitId: f.state.splits[1].id, amount: 5000 }] });
    const items = agendaItems(f.state, '2026-02-10');
    expect(items.filter(item => item.kind === 'receivable' && item.title.startsWith('Pessoa A'))).toEqual([]);
    expect(items.find(item => item.kind === 'personPayable')).toMatchObject({ amount: 1000, date: null, status: 'undated', flow: 'outgoing' });
    expect(items.filter(item => item.kind === 'invoice')).toEqual([]);
    expect(items.some(item => item.title.includes('Crédito'))).toBe(false);
    f.run({ type: 'personRefund', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 1000, date: '2026-01-09', description: 'Devolvi a A' });
    expect(agendaItems(f.state, '2026-02-10').filter(item => item.kind === 'personPayable')).toEqual([]);
  });
  it('previsões realizadas, canceladas e com realização estornada permanecem fora; recorrência não é gerada pela consulta', () => {
    const f = fixture();
    const create = (id: string, date: string) => f.run({ type: 'createForecast', id, name: 'Previsto', kind: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 1000, date });
    const actual = uid(), cancelled = uid(), pending = uid(); create(actual, '2026-01-08'); create(cancelled, '2026-01-09'); create(pending, '2026-01-10');
    const result = f.run({ type: 'settleForecast', id: actual, action: 'confirm', date: '2026-01-08' });
    f.run({ type: 'reverseMovement', operationId: result.resultId, reason: 'Confirmação incorreta' });
    f.run({ type: 'settleForecast', id: cancelled, action: 'cancel', date: '2026-01-09' });
    f.run({ type: 'createRecurring', id: uid(), name: 'Recorrência sem ocorrências', kind: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 500, day: 5, active: true });
    expect(agendaItems(f.state, '2026-01-10')).toMatchObject([{ id: `forecast-${pending}`, date: '2026-01-10', amount: 1000, kind: 'forecastIncome', status: 'today' }]);
    expect(f.state.forecasts).toHaveLength(3);
  });
  it('empréstimos mostram principal restante, sem duplicar juros ou pagamentos', () => {
    const f = fixture(), borrowed = uid(), lent = uid();
    for (const [id, direction, dueDate] of [[borrowed, 'borrowed', '2026-01-09'], [lent, 'lent', '2026-01-11']]) f.run({ type: 'createLoan', id, direction, personId: f.ids.person, accountId: f.ids.account, amount: 20000, date: '2026-01-03', dueDate, description: `Principal ${direction}` });
    f.run({ type: 'repayLoan', id: borrowed, accountId: f.ids.account, principalAmount: 5000, interestAmount: 100, categoryId: f.ids.expense, date: '2026-01-06' });
    const items = agendaItems(f.state, '2026-01-10');
    expect(items.find(item => item.kind === 'loanDebt')).toMatchObject({ amount: 15000, status: 'overdue', flow: 'outgoing' });
    expect(items.find(item => item.kind === 'loanAsset')).toMatchObject({ amount: 20000, status: 'upcoming', flow: 'incoming' });
  });
  it('meta mostra só o que falta reservar e contribuição mantém sugestão/reserva sem vencimento', () => {
    const f = fixture(), goal = uid();
    f.run({ type: 'createGoal', id: goal, name: 'Viagem', accountId: f.ids.account, target: 20000, deadline: '2026-01-09' });
    f.run({ type: 'fundGoal', id: goal, amount: 5000 });
    for (const mode of ['suggest', 'reserve']) f.run({ type: 'createRule', id: uid(), name: `Contribuição ${mode}`, mode, enabled: true, basisPoints: 1000, sourceIds: [f.ids.source] });
    f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: '2026-01-05', description: 'Renda recebida' });
    const items = agendaItems(f.state, '2026-01-10');
    expect(items.find(item => item.kind === 'goal')).toMatchObject({ amount: 15000, flow: 'goal', status: 'overdue' });
    expect(items.filter(item => item.kind === 'contribution')).toHaveLength(2);
    expect(items.filter(item => item.kind === 'contribution').every(item => item.date === null && item.flow === 'decision')).toBe(true);
    f.run({ type: 'fundGoal', id: goal, amount: 20000 });
    for (const item of [...f.state.contributions]) f.run({ type: 'settleContribution', contributionId: item.id, action: 'cancel', date: '2026-01-06' });
    expect(agendaItems(f.state, '2026-01-10')).toEqual([]);
  });
  it('filtros conservam itens sem data no mês e buscam sem depender de acentos', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    const items = agendaItems(f.state, '2026-02-01');
    expect(filterAgenda(items, { month: '2026-02' }).every(item => item.date === null)).toBe(true);
    expect(filterAgenda(items, { month: '2026-01', date: '2026-01-28' })).toHaveLength(1);
    expect(filterAgenda(items, { query: 'CARTAO', kind: 'invoice', status: 'overdue' })).toHaveLength(1);
    expect(filterAgenda(items, { query: 'Pessoa A', status: 'undated' })).toHaveLength(1);
    expect(agendaCounts(items)).toEqual({ total: 3, overdue: 1, today: 0, undated: 2 });
  });
  it('mês passado usa pendente atual, sem ressuscitar fatura já quitada', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 30000, date: '2026-02-02', description: 'Quitada em fevereiro' });
    expect(filterAgenda(agendaItems(f.state, '2026-03-01'), { month: '2026-01', kind: 'invoice' })).toEqual([]);
  });
  it('consultas preservam o estado inteiro e têm ordem estável após leitura por UUID', () => {
    const f = fixture(); f.run(purchaseCommand(f)); const before = structuredClone(f.state), totals = summary(f.state);
    const items = agendaItems(f.state, '2026-01-10');
    const reordered = structuredClone(f.state); Object.values(reordered).forEach(rows => rows.reverse());
    expect(agendaItems(reordered, '2026-01-10')).toEqual(items);
    expect(f.state).toEqual(before); expect(summary(f.state)).toEqual(totals);
  });
  it('valida datas e desenha semanas iniciando na segunda, inclusive fevereiro bissexto', () => {
    expect(agendaMonth('2024-02').filter(Boolean)).toHaveLength(29);
    expect(agendaMonth('2024-02').slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
    expect(agendaMonth('2020-08')).toHaveLength(42); expect(agendaMonth('0001-01')[0]).toBe('0001-01-01');
    expect(() => agendaMonth('2026-13')).toThrow(); expect(() => agendaItems(emptyState(), '2026-02-30')).toThrow();
    expect(() => filterAgenda([], { month: '0000-01' })).toThrow(); expect(() => filterAgenda([], { date: '2026-02-30' })).toThrow();
  });
  it('assistente usa a mesma agenda para datas ultrapassadas e mantém itens sem data separados', () => {
    const f = fixture(); f.run(purchaseCommand(f)); const before = structuredClone(f.state);
    const answer = localAssistant.answer(f.state, 'Quais pendências estão atrasadas?', '2026-02-01');
    expect(answer.text).toContain('Itens com data ultrapassada: 1'); expect(answer.text).toContain('28/01/2026');
    expect(answer.text).toContain('Há 2 item(ns) sem data'); expect(answer.command).toBeUndefined();
    expect(f.state).toEqual(before);
  });
  it('vencimentos do assistente incluem faturas nos próximos sete dias, sem somá-las como despesas', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    const answer = localAssistant.answer(f.state, 'O que vence nos próximos dias?', '2026-01-25');
    expect(answer.text).toContain('Faturas'); expect(answer.text).toContain('300,00');
    expect(answer.text).toContain('Consultar não confirma pagamento ou recebimento');
  });
});
