import { describe, expect, it } from 'vitest';
import { fixture, today, uid } from '../test/finance-fixture';
import { emptyState } from '../domain/model';
import { execute } from '../domain/engine';
import { accountReconciliation } from './reconciliation';

describe('Conferência manual do saldo de uma conta', () => {
  it('compara o saldo do corte sem incluir movimentos posteriores ou alterar registros', () => {
    const f = fixture();
    f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 5000, date: today, description: 'Receita recebida' });
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1250, date: '2026-01-06', description: 'Despesa posterior' });
    const before = structuredClone(f.state);
    const result = accountReconciliation(f.state, f.ids.account, today, 105001);
    expect(result).toMatchObject({ calculatedBalance: 105000, statementBalance: 105001, difference: 1 });
    expect(result.movements.map(item => item.description)).toContain('Receita recebida');
    expect(result.movements.map(item => item.description)).not.toContain('Despesa posterior');
    expect(accountReconciliation(f.state, f.ids.account, '2026-01-06', 103750).difference).toBe(0);
    expect(f.state).toEqual(before);
  });

  it('mostra transferência como saída na origem e entrada no destino', () => {
    const f = fixture(), transfer = f.run({ type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 10000, date: today, description: 'Entre contas' });
    const source = accountReconciliation(f.state, f.ids.account, today, 90000);
    const target = accountReconciliation(f.state, f.ids.other, today, 10000);
    expect(source.calculatedBalance).toBe(90000); expect(target.calculatedBalance).toBe(10000);
    expect(source.movements.find(item => item.id === transfer.resultId)?.cashChange).toBe(-10000);
    expect(target.movements.find(item => item.id === transfer.resultId)?.cashChange).toBe(10000);
  });

  it('inclui o original e seu estorno no corte financeiro original', () => {
    const f = fixture(), original = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1250, date: today, description: 'Despesa duplicada' });
    const reversed = f.run({ type: 'reverseMovement', operationId: original.resultId, reason: 'Duplicada' });
    const result = accountReconciliation(f.state, f.ids.account, today, 100000);
    expect(result.difference).toBe(0);
    expect(result.movements.find(item => item.id === original.resultId)).toMatchObject({ cashChange: -1250, reversed: true });
    expect(result.movements.find(item => item.id === reversed.resultId)).toMatchObject({ cashChange: 1250, originalDescription: 'Despesa duplicada' });
  });

  it('aceita saldo devedor e define diferença como extrato menos calculado', () => {
    const f = fixture(), id = uid();
    f.run({ type: 'createAccount', id, name: 'Conta devedora', openingBalance: -5000, date: '2026-01-01' });
    f.run({ type: 'expense', accountId: id, categoryId: f.ids.expense, amount: 100, date: today, description: 'Tarifa' });
    expect(accountReconciliation(f.state, id, today, -5000)).toMatchObject({ calculatedBalance: -5100, difference: 100 });
    expect(accountReconciliation(f.state, id, today, -5200).difference).toBe(-100);
  });

  it('conta com abertura zero e sem lançamentos tem saldo calculado zero', () => {
    const f = fixture(), result = accountReconciliation(f.state, f.ids.other, today, 0);
    expect(result).toMatchObject({ calculatedBalance: 0, difference: 0, movements: [] });
  });

  it.each(['2026-02-30', '2025-12-31', '2026/01/05', ''])('recusa corte inválido ou anterior à abertura: %s', cutoff => {
    const f = fixture();
    expect(() => accountReconciliation(f.state, f.ids.account, cutoff, 0)).toThrow();
  });

  it.each([0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('recusa saldo informado fora de centavos inteiros seguros: %s', value => {
    const f = fixture();
    expect(() => accountReconciliation(f.state, f.ids.account, today, value)).toThrow(/intervalo seguro/);
  });

  it('recusa conta ausente e diferença que ultrapassaria o intervalo seguro', () => {
    const id = uid();
    const { state } = execute(emptyState(), { key: uid(), type: 'createAccount', id, name: 'Extrema', openingBalance: Number.MAX_SAFE_INTEGER, date: '2026-01-01' }, { now: '2026-01-01T12:00:00Z', newId: uid });
    expect(() => accountReconciliation(state, uid(), today, 0)).toThrow(/Conta não encontrado/);
    expect(() => accountReconciliation(state, id, today, -Number.MAX_SAFE_INTEGER)).toThrow(/intervalo seguro/);
  });
});
