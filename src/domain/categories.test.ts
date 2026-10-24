import { describe, expect, it } from 'vitest';
import { FinanceError } from './errors';
import { assertCategoryHierarchy, categoryDescendantIds, categoryPath, type CategoryNode } from './categories';

const root: CategoryNode = { id: 'food', name: 'Alimentação', kind: 'expense' };
const restaurants: CategoryNode = { id: 'restaurants', name: 'Restaurantes', kind: 'expense', parentId: 'food' };
const lunch: CategoryNode = { id: 'lunch', name: 'Almoço', kind: 'expense', parentId: 'restaurants' };
const groceries: CategoryNode = { id: 'groceries', name: 'Mercado', kind: 'expense', parentId: 'food' };
const salary: CategoryNode = { id: 'salary', name: 'Trabalho', kind: 'income' };

describe('Hierarquia de categorias', () => {
  it('mantém categorias antigas como raízes e identifica nomes iguais pelo caminho', () => {
    const categories = [root, restaurants, lunch, groceries, salary, { id: 'travel', name: 'Viagens', kind: 'expense' as const }, { id: 'travel-food', name: 'Alimentação', kind: 'expense' as const, parentId: 'travel' }];
    const before = structuredClone(categories);
    expect(() => assertCategoryHierarchy(categories)).not.toThrow();
    expect(categoryPath(categories, root.id)).toBe('Alimentação');
    expect(categoryPath(categories, lunch.id)).toBe('Alimentação / Restaurantes / Almoço');
    expect(categoryPath(categories, 'travel-food')).toBe('Viagens / Alimentação');
    expect(categories).toEqual(before);
  });

  it('retorna cada descendente uma vez, sem misturar grupos irmãos ou receitas', () => {
    const categories = [root, restaurants, lunch, groceries, salary];
    expect(categoryDescendantIds(categories, root.id)).toEqual(['food', 'restaurants', 'groceries', 'lunch']);
    expect(categoryDescendantIds(categories, restaurants.id)).toEqual(['restaurants', 'lunch']);
    expect(categoryDescendantIds(categories, salary.id)).toEqual(['salary']);
  });

  it('reorganizar um grupo muda caminhos e conjuntos sem trocar os IDs', () => {
    const categories = [root, restaurants, lunch, groceries, { id: 'leisure', name: 'Lazer', kind: 'expense' as const }];
    const moved = categories.map(category => category.id === restaurants.id ? { ...category, parentId: 'leisure' } : category);
    expect(categoryDescendantIds(moved, 'food')).toEqual(['food', 'groceries']);
    expect(categoryDescendantIds(moved, 'leisure')).toEqual(['leisure', 'restaurants', 'lunch']);
    expect(categoryPath(moved, 'lunch')).toBe('Lazer / Restaurantes / Almoço');
    const detached = moved.map(category => category.id === restaurants.id ? { ...category, parentId: undefined } : category);
    expect(categoryPath(detached, 'lunch')).toBe('Restaurantes / Almoço');
    expect(detached.map(category => category.id)).toEqual(categories.map(category => category.id));
  });

  it('recusa grupo ausente, natureza diferente, auto-pai e identificador repetido', () => {
    expect(() => assertCategoryHierarchy([{ ...root, parentId: 'missing' }])).toThrow(/não encontrado/);
    expect(() => assertCategoryHierarchy([root, { ...restaurants, parentId: salary.id }, salary])).toThrow(/mesma natureza/);
    expect(() => assertCategoryHierarchy([{ ...root, parentId: root.id }])).toThrow(/próprio grupo/);
    expect(() => assertCategoryHierarchy([root, { ...root, name: 'Outra' }])).toThrow(/duplicado/);
  });

  it('recusa ciclos diretos e indiretos mesmo quando há outras raízes válidas', () => {
    for (const categories of [
      [{ ...root, parentId: restaurants.id }, restaurants],
      [salary, { ...root, parentId: lunch.id }, restaurants, lunch],
    ]) {
      expect(() => assertCategoryHierarchy(categories)).toThrow(/ciclo/);
      expect(() => categoryPath(categories, root.id)).toThrow(/ciclo/);
      expect(() => categoryDescendantIds(categories, root.id)).toThrow(/ciclo/);
    }
  });

  it('não permite filho ativo sob grupo arquivado e preserva caminhos do histórico arquivado', () => {
    expect(() => assertCategoryHierarchy([{ ...root, archived: true }, restaurants])).toThrow(/grupo arquivado/);
    const archived = [{ ...root, archived: true }, { ...restaurants, archived: true }, { ...lunch, archived: true }];
    expect(() => assertCategoryHierarchy(archived)).not.toThrow();
    expect(categoryPath(archived, lunch.id)).toBe('Alimentação / Restaurantes / Almoço');
    expect(categoryDescendantIds(archived, root.id)).toEqual(['food', 'restaurants', 'lunch']);
  });

  it('apresenta falhas de referência seguras e rótulos de texto sem interpretar conteúdo', () => {
    expect(() => categoryPath([], 'missing')).toThrow(FinanceError);
    expect(() => categoryDescendantIds([], 'missing')).toThrow(FinanceError);
    expect(() => categoryPath([{ ...restaurants, parentId: 'missing' }], restaurants.id)).toThrow(/não encontrado/);
    const name = '<img src=x onerror=alert(1)>';
    expect(categoryPath([root, { ...restaurants, name }], restaurants.id)).toBe(`Alimentação / ${name}`);
  });

  it('valida árvores profundas sem recursão ou alteração dos registros', () => {
    const categories = Array.from({ length: 2500 }, (_, index): CategoryNode => ({ id: `id-${index}`, name: String(index), kind: 'expense', ...(index ? { parentId: `id-${index - 1}` } : {}) }));
    expect(() => assertCategoryHierarchy(categories)).not.toThrow();
    expect(categoryDescendantIds(categories, 'id-0')).toHaveLength(2500);
    expect(categoryPath(categories, 'id-2499')).toMatch(/^0 \/ 1 \/ 2 \/ /);
  });
});
