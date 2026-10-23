import { emptyState, type State } from '../domain/model';
import { execute } from '../domain/engine';

export const uid = () => crypto.randomUUID();
export const today = '2026-01-05';
export function fixture() {
  let state: State = emptyState();
  const ids = { account: uid(), other: uid(), expense: uid(), income: uid(), person: uid(), person2: uid(), source: uid(), otherSource: uid(), card: uid() };
  const run = (command: Record<string, unknown>) => {
    const result = execute(state, { key: uid(), ...command }, { now: '2026-01-01T12:00:00.000Z', newId: uid });
    state = result.state;
    return result;
  };
  run({ type: 'createAccount', id: ids.account, name: 'Principal', openingBalance: 100_000, date: '2026-01-01' });
  run({ type: 'createAccount', id: ids.other, name: 'Carteira', openingBalance: 0, date: '2026-01-01' });
  run({ type: 'createCategory', id: ids.expense, name: 'Alimentação', kind: 'expense' });
  run({ type: 'createCategory', id: ids.income, name: 'Trabalho', kind: 'income' });
  run({ type: 'createPerson', id: ids.person, name: 'Pessoa A' });
  run({ type: 'createPerson', id: ids.person2, name: 'Pessoa B' });
  run({ type: 'createSource', id: ids.source, name: 'Estágio' });
  run({ type: 'createSource', id: ids.otherSource, name: 'Outras receitas' });
  run({ type: 'createCard', id: ids.card, name: 'Cartão pessoal', limit: 500_000, closingDay: 20, dueDay: 28 });
  return { ids, run, get state() { return state; } };
}
export function purchaseCommand(f: ReturnType<typeof fixture>) {
  return { type: 'purchase', key: uid(), date: today, description: 'Compra compartilhada', cardId: f.ids.card, amount: 30_000,
    splits: [{ amount: 12_000, categoryId: f.ids.expense }, { amount: 10_000, personId: f.ids.person }, { amount: 8_000, personId: f.ids.person2 }] };
}
