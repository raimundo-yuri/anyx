import { describe, expect, it } from 'vitest';
import { fixture, today } from '../test/finance-fixture';
import { displayDate, emptyFilters, formatMoney, localToday, movementRows } from './finance-view';

describe('Consultas e apresentação de movimentações', () => {
  it('representa transferência como um registro neutro que aparece no extrato das duas contas', () => {
    const f = fixture();
    f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.other, date: today, description: 'Para a carteira', amount: 10000 });
    const rows = movementRows(f.state, { ...emptyFilters, kind: 'transfer' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 10000, direction: 'neutral', cashChange: 0, accounts: ['Principal', 'Carteira'] });
    expect(movementRows(f.state, { ...emptyFilters, kind: 'transfer', accountId: f.ids.account })).toHaveLength(1);
    expect(movementRows(f.state, { ...emptyFilters, kind: 'transfer', accountId: f.ids.other })).toHaveLength(1);
  });
  it('combina busca por descrição/categoria, período e tipo e não altera os saldos', () => {
    const f = fixture();
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, date: today, description: 'Almoço no centro', amount: 1250 });
    const entries = structuredClone(f.state.entries);
    expect(movementRows(f.state, { ...emptyFilters, query: 'ALIMENTAÇÃO', from: '2026-01-05', to: '2026-01-05', kind: 'expense' })).toHaveLength(1);
    expect(movementRows(f.state, { ...emptyFilters, query: 'não existe' })).toHaveLength(0);
    expect(f.state.entries).toEqual(entries);
    expect(() => movementRows(f.state, { ...emptyFilters, from: '2026-02-01', to: '2026-01-01' })).toThrow(/período/);
  });
  it('exibe saldo inicial negativo com direção de saída sem transformá-lo em despesa', () => {
    const f = fixture();
    f.run({ type: 'createAccount', id: crypto.randomUUID(), name: 'Devedora', openingBalance: -100, date: today });
    expect(movementRows(f.state)[0]).toMatchObject({ kind: 'opening', amount: 100, direction: 'out' });
  });
  it('formata centavos extremos sem perder o último centavo', () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe('R$\u00a090.071.992.547.409,91');
    expect(formatMoney(-101)).toBe('-R$\u00a01,01');
    expect(formatMoney(0)).toBe('R$\u00a00,00');
    expect(() => formatMoney(1.5)).toThrow();
  });
  it('usa data brasileira e o fuso configurado, inclusive perto da meia-noite UTC', () => {
    expect(displayDate('2026-01-05')).toBe('05/01/2026');
    expect(localToday('America/Sao_Paulo', new Date('2026-10-23T01:00:00Z'))).toBe('2026-10-22');
  });
});
