import { describe, expect, it } from 'vitest';
import { fixture, today, uid } from '../test/finance-fixture';
import { categoryPath } from './categories';
import { summary } from './queries';
import { movementRows } from '../application/finance-view';
import { planningData } from '../application/planning';
import { dashboardData } from '../application/dashboard';
import { localAssistant } from '../application/assistant';
import { plainBackup, readBackup } from '../portability/backup';

describe('Subcategorias integradas ao domínio e aos relatórios', () => {
  it('agrega filhos no orçamento de grupo sem duplicar consumo no dashboard', () => {
    const f = fixture(), child = uid(), grandchild = uid();
    f.run({ type: 'createCategory', id: child, name: 'Restaurantes', kind: 'expense', parentId: f.ids.expense });
    f.run({ type: 'createCategory', id: grandchild, name: 'Almoço', kind: 'expense', parentId: child });
    f.run({ type: 'setBudget', id: uid(), categoryId: f.ids.expense, month: '2026-01', amount: 10000 });
    f.run({ type: 'setBudget', id: uid(), categoryId: child, month: '2026-01', amount: 5000 });
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 100, date: today, description: 'Mercado' });
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: grandchild, amount: 1250, date: today, description: 'Restaurante' });
    expect(planningData(f.state, '2026-01').budgets.map(item => item.spent)).toEqual([1350, 1250]);
    const data = dashboardData(f.state, '2026-01');
    expect(data.totals.expenses).toBe(1350); expect(data.categories.reduce((total, item) => total + item.amount, 0)).toBe(1350);
    expect(movementRows(f.state).find(item => item.description === 'Restaurante')?.categories).toEqual(['Alimentação / Restaurantes / Almoço']);
    expect(localAssistant.answer(f.state, 'gastei 5,00 em Alimentação / Restaurantes / Almoço na conta Principal', today).command).toMatchObject({ categoryId: grandchild, amount: 500 });
  });

  it('mover o grupo altera o agrupamento sem reescrever lançamentos ou dinheiro', () => {
    const f = fixture(), child = uid(), other = uid();
    f.run({ type: 'createCategory', id: child, name: 'Filha', kind: 'expense', parentId: f.ids.expense });
    f.run({ type: 'createCategory', id: other, name: 'Novo grupo', kind: 'expense' });
    f.run({ type: 'expense', accountId: f.ids.account, categoryId: child, amount: 1000, date: today, description: 'Compra' });
    const entries = structuredClone(f.state.entries), totals = summary(f.state);
    f.run({ type: 'setCategoryParent', id: child, parentId: other });
    expect(f.state.entries).toEqual(entries); expect(summary(f.state)).toEqual(totals);
    expect(categoryPath(f.state.categories, child)).toBe('Novo grupo / Filha');
    f.run({ type: 'setCategoryParent', id: child, parentId: null });
    expect(categoryPath(f.state.categories, child)).toBe('Filha');
  });

  it('assistente pede esclarecimento quando um caminho coincide com um nome literal', () => {
    const f = fixture();
    f.run({ type: 'createCategory', id: uid(), name: 'Restaurantes', kind: 'expense', parentId: f.ids.expense });
    f.run({ type: 'createCategory', id: uid(), name: 'Alimentação / Restaurantes', kind: 'expense' });
    const before = structuredClone(f.state);
    const answer = localAssistant.answer(f.state, 'gastei 5,00 em Alimentação / Restaurantes na conta Principal', today);
    expect(answer.command).toBeUndefined(); expect(answer.text).toMatch(/categoria ativa/);
    expect(f.state).toEqual(before);
  });

  it('rejeita ciclos, grupos de outra natureza e arquivamento com filho ativo sem gravação parcial', () => {
    const f = fixture(), child = uid();
    f.run({ type: 'createCategory', id: child, name: 'Filha', kind: 'expense', parentId: f.ids.expense });
    const before = structuredClone(f.state);
    for (const command of [
      { type: 'setCategoryParent', id: f.ids.expense, parentId: child },
      { type: 'setCategoryParent', id: child, parentId: f.ids.income },
      { type: 'setArchived', entity: 'category', id: f.ids.expense, archived: true },
    ]) expect(() => f.run(command)).toThrow();
    expect(f.state).toEqual(before);
    f.run({ type: 'setArchived', entity: 'category', id: child, archived: true });
    f.run({ type: 'setArchived', entity: 'category', id: f.ids.expense, archived: true });
    expect(() => f.run({ type: 'setArchived', entity: 'category', id: child, archived: false })).toThrow(/grupo arquivado/);
    f.run({ type: 'setArchived', entity: 'category', id: f.ids.expense, archived: false });
    f.run({ type: 'setArchived', entity: 'category', id: child, archived: false });
    expect(f.state.categories.find(item => item.id === child)?.archived).toBe(false);
  });

  it('backup v4 preserva hierarquia e mantém compatibilidade de leitura com v3', async () => {
    const f = fixture(), legacy = JSON.parse(plainBackup(f.state)); legacy.version = 3;
    expect(await readBackup(JSON.stringify(legacy))).toEqual(f.state);
    f.run({ type: 'createCategory', id: uid(), name: 'Filha', kind: 'expense', parentId: f.ids.expense });
    const backup = plainBackup(f.state); expect(JSON.parse(backup).version).toBe(4);
    expect(await readBackup(backup)).toEqual(f.state);
    await expect(readBackup(JSON.stringify({ ...JSON.parse(backup), version: 3 }))).rejects.toThrow(/versão 4/);
  });
});
