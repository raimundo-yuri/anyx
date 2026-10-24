import type { State } from '../domain/model';
import { summary, balance } from '../domain/queries';
import { sum } from '../domain/money';
import { daysInMonth } from '../domain/dates';
import { FinanceError } from '../domain/errors';
import { categoryPath } from '../domain/categories';
export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new FinanceError('Selecione um mês válido.');
  const [year, number] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${daysInMonth(year, number)}` };
}
export function dashboardData(state: State, month: string) {
  const range = monthRange(month);
  const ids = new Set(state.operations.filter(op => op.date >= range.from && op.date <= range.to).map(op => op.id));
  const categories = state.categories.filter(item => item.kind === 'expense').map(category => ({ id: category.id, name: categoryPath(state.categories, category.id), amount: sum(state.entries.filter(entry => entry.ledger === 'expense' && entry.referenceId === category.id && ids.has(entry.operationId)).map(entry => entry.side === 'debit' ? entry.amount : -entry.amount)) })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const [year, number] = month.split('-').map(Number);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const cursor = new Date(Date.UTC(year, number - 6 + index, 1));
    const cycle = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    const result = summary(state, monthRange(cycle));
    return { month: cycle, income: result.income, expenses: result.expenses };
  });
  const invoices = state.invoices.map(invoice => ({ ...invoice, pending: balance(state, 'card', invoice.id), name: state.cards.find(card => card.id === invoice.cardId)!.name })).filter(item => item.pending > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const people = state.people.map(person => ({ ...person, pending: sum(state.receivables.filter(item => item.personId === person.id).map(item => balance(state, 'receivable', item.id))) })).filter(item => item.pending > 0);
  return { totals: summary(state, range), categories, trend, invoices, people };
}
