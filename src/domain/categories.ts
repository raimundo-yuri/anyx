import { FinanceError } from './errors.js';

/** Structural type also accepts legacy root categories that have no parentId. */
export interface CategoryNode {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  parentId?: string;
  archived?: boolean;
}

function categoryMap(categories: readonly CategoryNode[]) {
  const map = new Map(categories.map(category => [category.id, category]));
  if (map.size !== categories.length) throw new FinanceError('Identificador de categoria duplicado.');
  return map;
}

/** Check hierarchy independently from financial postings; categories keep their original IDs. */
export function assertCategoryHierarchy(categories: readonly CategoryNode[]): void {
  const map = categoryMap(categories);
  for (const category of categories) {
    if (!category.parentId) continue;
    const parent = map.get(category.parentId);
    if (!parent) throw new FinanceError('Grupo da categoria não encontrado.');
    if (parent.id === category.id) throw new FinanceError('Uma categoria não pode ser seu próprio grupo.');
    if (parent.kind !== category.kind) throw new FinanceError('Categoria e grupo precisam ter a mesma natureza.');
    if (parent.archived && !category.archived) throw new FinanceError('Uma categoria ativa não pode ficar em um grupo arquivado.');
  }
  // Iteration avoids a call-stack overflow on a long hierarchy restored from a file.
  const resolved = new Set<string>();
  for (const category of categories) {
    const visiting = new Set<string>();
    let current: CategoryNode | undefined = category;
    while (current && !resolved.has(current.id)) {
      if (visiting.has(current.id)) throw new FinanceError('Os grupos de categorias não podem formar um ciclo.');
      visiting.add(current.id);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
    for (const id of visiting) resolved.add(id);
  }
}

/** A path is a label only: callers must continue storing and relating category IDs. */
export function categoryPath(categories: readonly CategoryNode[], id: string): string {
  const map = categoryMap(categories), names: string[] = [], visited = new Set<string>();
  let current = map.get(id);
  if (!current) throw new FinanceError('Categoria não encontrada.');
  while (current) {
    if (visited.has(current.id)) throw new FinanceError('Os grupos de categorias não podem formar um ciclo.');
    visited.add(current.id); names.push(current.name);
    if (!current.parentId) break;
    const parent = map.get(current.parentId);
    if (!parent) throw new FinanceError('Grupo da categoria não encontrado.');
    if (parent.kind !== current.kind) throw new FinanceError('Categoria e grupo precisam ter a mesma natureza.');
    current = parent;
  }
  return names.reverse().join(' / ');
}

/** Includes the selected category once, then its descendants in input-stable breadth-first order. */
export function categoryDescendantIds(categories: readonly CategoryNode[], id: string): string[] {
  assertCategoryHierarchy(categories);
  if (!categories.some(category => category.id === id)) throw new FinanceError('Categoria não encontrada.');
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category.id); children.set(category.parentId, siblings);
  }
  const ids = [id];
  for (let cursor = 0; cursor < ids.length; cursor++) {
    for (const childId of children.get(ids[cursor]) ?? []) ids.push(childId);
  }
  return ids;
}
