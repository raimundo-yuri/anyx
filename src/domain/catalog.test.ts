import { describe, expect, it } from 'vitest';
import { fixture, purchaseCommand, today, uid } from '../test/finance-fixture';
import { summary } from './queries';
import { catalogId } from './catalog';

describe('Cadastros e compatibilidade do domínio', () => {
  it('adiciona sugestões uma vez, sem criar contas ou valores fictícios', () => {
    const f = fixture(); const before = summary(f.state);
    f.run({ type: 'installCatalog' });
    expect(f.state.categories).toHaveLength(15); // Existing Alimentação is reused; existing Trabalho is reused.
    expect(f.state.sources).toHaveLength(7);
    const counts = [f.state.categories.length, f.state.sources.length, f.state.receipts.length];
    f.run({ type: 'installCatalog' }); // Even a different command key must not duplicate suggestions.
    expect([f.state.categories.length, f.state.sources.length]).toEqual(counts.slice(0, 2));
    expect(summary(f.state)).toEqual(before);
    expect(f.state.accounts).toHaveLength(2);
    expect(f.state.operations).toHaveLength(1);
  });
  it('editar metadados não altera centavos, operações ou relações antigas', () => {
    const f = fixture(); f.run(purchaseCommand(f));
    const entries = structuredClone(f.state.entries), before = summary(f.state);
    f.run({ type: 'updateAccount', id: f.ids.account, name: 'Conta renomeada', institution: 'Nubank', kind: 'payment' });
    f.run({ type: 'renameCategory', id: f.ids.expense, name: 'Mercado' });
    f.run({ type: 'renameSource', id: f.ids.source, name: 'Bolsa' });
    expect(f.state.entries).toEqual(entries);
    expect(summary(f.state)).toEqual(before);
    expect(f.state.accounts[0]).toMatchObject({ name: 'Conta renomeada', institution: 'Nubank', kind: 'payment' });
    expect(f.state.categories.find(item => item.id === f.ids.expense)?.kind).toBe('expense');
  });
  it('aceita formatos antigos sem metadados e rejeita alterar natureza ou saldo na edição', () => {
    const f = fixture();
    expect(f.state.accounts[0].institution).toBeUndefined();
    expect(() => f.run({ type: 'updateAccount', id: f.ids.account, name: 'Conta', openingBalance: 0 })).toThrow();
    expect(() => f.run({ type: 'renameCategory', id: f.ids.expense, name: 'Novo nome', kind: 'income' })).toThrow();
  });
  it('arquiva apenas contas zeradas, preserva-as e permite reativá-las', () => {
    const f = fixture();
    expect(() => f.run({ type: 'setArchived', entity: 'account', id: f.ids.account, archived: true })).toThrow(/saldo zero/);
    f.run({ type: 'setArchived', entity: 'account', id: f.ids.other, archived: true });
    expect(f.state.accounts).toHaveLength(2);
    const transfer = { type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 100, date: today, description: 'Transferir' };
    expect(() => f.run(transfer)).toThrow(/arquivada/);
    f.run({ type: 'setArchived', entity: 'account', id: f.ids.other, archived: false });
    f.run(transfer);
    expect(summary(f.state).cash).toBe(100000);
  });
  it('categorias e fontes arquivadas não podem receber novos lançamentos', () => {
    const f = fixture();
    f.run({ type: 'setArchived', entity: 'category', id: f.ids.expense, archived: true });
    expect(() => f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 100, date: today, description: 'Almoço' })).toThrow(/arquivada/);
    f.run({ type: 'setArchived', entity: 'source', id: f.ids.source, archived: true });
    expect(() => f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 100, date: today, description: 'Bolsa' })).toThrow(/arquivada/);
  });
  it('reinstalar sugestões não desfaz nomes editados ou arquivamento', () => {
    const f = fixture(); f.run({ type: 'installCatalog' });
    const id = catalogId('category', 2);
    f.run({ type: 'renameCategory', id, name: 'Mobilidade' });
    f.run({ type: 'setArchived', entity: 'category', id, archived: true });
    f.run({ type: 'installCatalog' });
    expect(f.state.categories.find(item => item.id === id)).toMatchObject({ name: 'Mobilidade', archived: true });
    expect(f.state.categories.some(item => item.name === 'Transporte')).toBe(false);
  });
  it('rejeita editar ou arquivar IDs inexistentes', () => {
    const f = fixture();
    expect(() => f.run({ type: 'renameSource', id: uid(), name: 'Inexistente' })).toThrow(/encontrado/);
    expect(() => f.run({ type: 'setArchived', entity: 'account', id: uid(), archived: true })).toThrow(/encontrado/);
  });
});
