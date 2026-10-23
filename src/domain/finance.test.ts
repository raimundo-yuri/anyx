import { describe, expect, it } from 'vitest';
import { allocate, cents, parseBRL, percentage, sum } from './money';
import { invoiceDates, validDate } from './dates';
import { available, balance, reserved, summary } from './queries';
import { execute } from './engine';
import { assertState } from './integrity';
import { emptyState } from './model';
import { fixture, purchaseCommand, today, uid } from '../test/finance-fixture';

describe('Precisão monetária', () => {
  it.each([['0,01', 1], ['1.234,56', 123456], ['100', 10000], ['-25,5', -2550], ['0', 0], ['90.071.992.547.409,91', Number.MAX_SAFE_INTEGER]])('converte %s sem aritmética decimal imprecisa', (text, expected) => {
    expect(parseBRL(text)).toBe(expected);
  });
  it.each(['1.25', '1,234', '1e3', 'NaN', '', '1.00,00', '90.071.992.547.409,92', '1,2,3', 'Infinity', 'R$ 10,00'])('rejeita entrada ambígua/inválida: %s', input => expect(() => parseBRL(input)).toThrow());
  it('rejeita centavos fracionários e overflow em cálculos', () => {
    expect(() => cents(0.1)).toThrow();
    expect(() => sum([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
  it('arredonda percentual meio para cima usando inteiros', () => {
    expect(percentage(5, 1000)).toBe(1);
    expect(percentage(4, 1000)).toBe(0);
    expect(percentage(12345, 750)).toBe(926);
    expect(percentage(Number.MAX_SAFE_INTEGER, 10000)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => percentage(100, 10001)).toThrow();
  });
  it('distribui restos sem perder centavos', () => {
    expect(allocate(100, 3)).toEqual([34, 33, 33]);
    expect(sum(allocate(30_001, 12))).toBe(30_001);
    expect(() => allocate(2, 3)).toThrow();
  });
});

describe('Datas civis e ciclos de fatura', () => {
  it('valida anos bissextos, datas impossíveis e anos fora da faixa', () => {
    expect(validDate('2024-02-29')).toBe(true);
    for (const date of ['2025-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '26-01-01']) expect(validDate(date)).toBe(false);
  });
  it('compra no fechamento vai para o próximo ciclo por padrão', () => {
    expect(invoiceDates('2026-01-20', 20, 10)).toEqual({ cycle: '2026-02', closingDate: '2026-02-20', dueDate: '2026-03-10' });
    expect(invoiceDates('2026-01-20', 20, 28, '2026-01').cycle).toBe('2026-01');
  });
  it('limita dias ao mês e preserva vencimento posterior ao fechamento', () => {
    expect(invoiceDates('2026-02-10', 31, 31)).toEqual({ cycle: '2026-02', closingDate: '2026-02-28', dueDate: '2026-03-31' });
    expect(invoiceDates('2024-02-10', 31, 30)).toEqual({ cycle: '2024-02', closingDate: '2024-02-29', dueDate: '2024-03-30' });
    expect(invoiceDates('2026-12-31', 31, 10).cycle).toBe('2027-01');
    expect(() => invoiceDates('2026-02-10', 20, 28, '2026-01')).toThrow();
  });
});

describe('Motor financeiro', () => {
  it('inicia vazio, sem contas nem saldos fictícios', () => {
    assertState(emptyState());
    expect(summary(emptyState())).toEqual({ cash: 0, available: 0, reserved: 0, income: 0, expenses: 0, receivables: 0, invoices: 0, netWorth: 0 });
  });
  it('saldo inicial não é receita e suporta saldo bancário negativo', () => {
    const f = fixture();
    expect(summary(f.state)).toMatchObject({ cash: 100_000, income: 0, netWorth: 100_000 });
    f.run({ type: 'createAccount', id: uid(), name: 'Conta com cheque especial', openingBalance: -2000, date: today });
    expect(summary(f.state)).toMatchObject({ cash: 98_000, income: 0 });
  });
  it('A: transferência de R$ 100 entre contas não muda receita, consumo ou patrimônio', () => {
    const f = fixture();
    f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 10_000, date: today, description: 'Reserva na carteira' });
    expect(balance(f.state, 'cash', f.ids.account)).toBe(90_000);
    expect(balance(f.state, 'cash', f.ids.other)).toBe(10_000);
    expect(summary(f.state)).toMatchObject({ cash: 100_000, income: 0, expenses: 0, netWorth: 100_000 });
  });
  it('receita e despesa afetam somente seus respectivos fluxos; filtros não mudam o estoque atual', () => {
    const f = fixture();
    f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 20_000, date: today, description: 'Recebido' });
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 2_000, date: '2026-02-01', description: 'Almoço' });
    expect(summary(f.state)).toMatchObject({ cash: 118_000, income: 20_000, expenses: 2_000 });
    expect(summary(f.state, { from: '2026-01-01', to: '2026-01-31' })).toMatchObject({ cash: 118_000, income: 20_000, expenses: 0 });
    expect(() => summary(f.state, { from: '2026-02-30', to: '2026-03-01' })).toThrow();
  });
  it('B: uma compra de R$ 300 gera R$ 120 pessoais e dois recebíveis de R$ 100 e R$ 80', () => {
    const f = fixture();
    f.run(purchaseCommand(f));
    expect(f.state.purchases).toHaveLength(1);
    expect(f.state.splits).toHaveLength(3);
    expect(f.state.receivables.map(item => item.amount)).toEqual([10000, 8000]);
    expect(summary(f.state)).toMatchObject({ cash: 100000, expenses: 12000, receivables: 18000, invoices: 30000, netWorth: 88000 });
    expect(f.state.invoices[0]).toMatchObject({ cycle: '2026-01', dueDate: '2026-01-28' });
  });
  it('C: reembolso parcial de R$ 60 deixa R$ 40 a receber, sem receita nova', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    const receivableId = f.state.receivables[0].id;
    f.run({ type: 'reimbursement', accountId: f.ids.account, receivableId, amount: 6000, date: today, description: 'Pagamento parcial' });
    expect(balance(f.state, 'receivable', receivableId)).toBe(4000);
    expect(summary(f.state)).toMatchObject({ cash: 106000, income: 0, expenses: 12000, receivables: 12000, netWorth: 88000 });
    expect(() => f.run({ type: 'reimbursement', accountId: f.ids.account, receivableId, amount: 4001, date: today, description: 'Excesso' })).toThrow(/excede/);
  });
  it('D: pagamento parcial e total da fatura não duplicam a despesa', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    const invoiceId = f.state.invoices[0].id;
    const pay = (amount: number) => f.run({ type: 'invoicePayment', accountId: f.ids.account, invoiceId, amount, date: '2026-01-28', description: 'Pagamento da fatura' });
    pay(10_000);
    expect(balance(f.state, 'card', invoiceId)).toBe(20_000);
    pay(20_000);
    expect(summary(f.state)).toMatchObject({ cash: 70000, invoices: 0, expenses: 12000, netWorth: 88000 });
    expect(() => pay(1)).toThrow(/excede/);
  });
  it('reutiliza o ciclo de fatura sem duplicá-lo', () => {
    const f = fixture(); f.run(purchaseCommand(f)); f.run(purchaseCommand(f));
    expect(f.state.invoices).toHaveLength(1);
    expect(f.state.purchases).toHaveLength(2);
    expect(balance(f.state, 'card')).toBe(60000);
  });
  it('retentativa idêntica não altera registros e conflito na chave é rejeitado', () => {
    const f = fixture(); const command = purchaseCommand(f);
    const first = f.run(command);
    const before = structuredClone(f.state);
    const second = f.run(command);
    expect(second.replayed).toBe(true);
    expect(second.resultId).toBe(first.resultId);
    expect(f.state).toEqual(before);
    expect(() => f.run({ ...command, description: 'Outro conteúdo' })).toThrow(/idempotência/);
  });
  it('uma falha não modifica o estado de entrada nem cria fatura ou compra parcial', () => {
    const f = fixture(); const before = structuredClone(f.state);
    expect(() => f.run({ ...purchaseCommand(f), splits: [{ amount: 30000, personId: uid() }] })).toThrow(/Pessoa/);
    expect(f.state).toEqual(before);
    expect(() => f.run({ ...purchaseCommand(f), splits: [{ amount: 1, categoryId: f.ids.expense }] })).toThrow(/soma/);
    expect(f.state).toEqual(before);
  });
  it('rejeita categorias de natureza errada, referências ausentes, datas e centavos inválidos', () => {
    const f = fixture();
    const command = { type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 100, date: today, description: 'Despesa' };
    for (const change of [{ categoryId: f.ids.income }, { accountId: uid() }, { amount: 0 }, { amount: 1.5 }, { date: '2026-02-30' }, { amount: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(() => f.run({ ...command, ...change })).toThrow();
    }
    expect(() => f.run({ ...command, date: '2025-12-31' })).toThrow(/abertura/);
    expect(() => f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.account, amount: 1, date: today, description: 'Inválido' })).toThrow(/diferentes/);
  });
  it('rejeita duplicação de entidade, relação inválida ou saldo adulterado no estado', () => {
    const f = fixture();
    expect(() => f.run({ type: 'createPerson', id: f.ids.person, name: 'Duplicado' })).toThrow(/duplicado/);
    const broken = structuredClone(f.state);
    broken.entries[0].amount += 1;
    expect(() => assertState(broken)).toThrow(/desequilibrada/);
    const orphan = structuredClone(f.state);
    orphan.entries[0].operationId = uid();
    expect(() => assertState(orphan)).toThrow();
  });
  it('pagamento retroativo não pode criar fatura negativa em uma data intermediária', () => {
    const f = fixture();
    for (const [date, amount] of [['2026-01-02', 10000], ['2026-01-10', 10000]] as const) {
      f.run({ ...purchaseCommand(f), date, amount, splits: [{ amount, categoryId: f.ids.expense }] });
    }
    const invoiceId = f.state.invoices[0].id;
    f.run({ type: 'invoicePayment', invoiceId, accountId: f.ids.account, amount: 20000, date: '2026-01-10', description: 'Quitação' });
    f.run({ ...purchaseCommand(f), date: '2026-01-15', amount: 10000, splits: [{ amount: 10000, categoryId: f.ids.expense }] });
    expect(() => f.run({ type: 'invoicePayment', invoiceId, accountId: f.ids.account, amount: 10000, date: '2026-01-05', description: 'Retroativo' })).toThrow(/histórico/);
  });
  it('não permite reembolso antes da compra nem pagar fatura ainda sem obrigação', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    expect(() => f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 100, date: '2026-01-02', description: 'Antes da compra' })).toThrow(/anterior/);
    expect(() => f.run({ type: 'invoicePayment', invoiceId: f.state.invoices[0].id, accountId: f.ids.account, amount: 100, date: '2026-01-02', description: 'Antes da compra' })).toThrow(/excede/);
  });
});

describe('Contribuições e reservas', () => {
  function setup(mode: 'suggest' | 'reserve' = 'reserve', enabled = true) {
    const f = fixture();
    f.run({ type: 'createRule', id: uid(), name: 'Contribuição', enabled, basisPoints: 750, sourceIds: [f.ids.source], mode });
    return f;
  }
  const receive = (f: ReturnType<typeof fixture>, sourceId = f.ids.source) => f.run({ type: 'income', date: today, description: 'Receita elegível', amount: 10_000, accountId: f.ids.account, categoryId: f.ids.income, sourceId });
  it('H: aplica percentual configurado somente sobre a fonte elegível', () => {
    const f = setup(); receive(f, f.ids.otherSource);
    expect(f.state.contributions).toHaveLength(0);
    receive(f);
    expect(f.state.contributions).toHaveLength(1);
    expect(f.state.contributions[0]).toMatchObject({ amount: 750, basisPoints: 750, status: 'reserved' });
    expect(reserved(f.state)).toBe(750);
    expect(available(f.state)).toBe(119250);
    expect(balance(f.state, 'expense')).toBe(0);
  });
  it('regra desativada não gera contribuição', () => {
    const f = setup('reserve', false); receive(f);
    expect(f.state.contributions).toHaveLength(0);
  });
  it('transferências e reembolsos não acionam a regra', () => {
    const f = setup(); f.run(purchaseCommand(f));
    f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.other, date: today, description: 'Transferência', amount: 1000 });
    f.run({ type: 'reimbursement', accountId: f.ids.account, receivableId: f.state.receivables[0].id, date: today, description: 'Reembolso', amount: 1000 });
    expect(f.state.contributions).toHaveLength(0);
  });
  it('sugestão não reserva dinheiro e o pagamento gera despesa uma única vez', () => {
    const f = setup('suggest'); receive(f);
    expect(reserved(f.state)).toBe(0);
    const command = { key: uid(), type: 'settleContribution', contributionId: f.state.contributions[0].id, categoryId: f.ids.expense, date: today, action: 'pay' };
    f.run(command); f.run(command);
    expect(summary(f.state)).toMatchObject({ cash: 109250, expenses: 750, reserved: 0, income: 10000 });
    expect(() => f.run({ ...command, key: uid() })).toThrow(/encerrada/);
  });
  it('cancelamento libera a reserva sem despesa e preserva histórico', () => {
    const f = setup(); receive(f);
    const contribution = f.state.contributions[0];
    f.run({ type: 'settleContribution', contributionId: contribution.id, date: today, action: 'cancel' });
    expect(summary(f.state)).toMatchObject({ cash: 110000, expenses: 0, reserved: 0 });
    expect(f.state.reserves).toHaveLength(1);
    expect(f.state.contributions[0].status).toBe('cancelled');
  });
  it('pagamento libera reserva e reduz caixa sem dupla contagem', () => {
    const f = setup(); receive(f);
    const before = available(f.state);
    f.run({ type: 'settleContribution', contributionId: f.state.contributions[0].id, categoryId: f.ids.expense, date: today, action: 'pay' });
    expect(reserved(f.state)).toBe(0);
    expect(available(f.state)).toBe(before);
    expect(balance(f.state, 'expense')).toBe(750);
  });
  it('bloqueia operações que consumiriam uma reserva ativa e não altera o estado', () => {
    const f = setup(); receive(f);
    const before = structuredClone(f.state);
    expect(() => f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 110000, date: today, description: 'Consome reserva' })).toThrow(/reservado/);
    expect(f.state).toEqual(before);
  });
  it('rejeita regras cujas reservas combinadas excederiam o caixa', () => {
    const f = fixture();
    for (let i = 0; i < 2; i++) f.run({ type: 'createRule', id: uid(), name: 'Regra', enabled: true, basisPoints: 10000, sourceIds: [f.ids.source], mode: 'reserve' });
    const before = structuredClone(f.state);
    expect(() => f.run({ type: 'income', accountId: f.ids.other, categoryId: f.ids.income, sourceId: f.ids.source, amount: 100, date: today, description: 'Sem caixa para ambas' })).toThrow(/reservado/);
    expect(f.state).toEqual(before);
  });
  it('não aceita comandos que tentem introduzir propriedades desconhecidas', () => {
    expect(() => execute(emptyState(), { type: 'createPerson', id: uid(), key: uid(), name: 'Pessoa', secret: 'não esperado' }, { now: new Date().toISOString(), newId: uid })).toThrow();
  });
});
