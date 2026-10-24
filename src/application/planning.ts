import type { State } from '../domain/model';
import { balance, available } from '../domain/queries';
import { sum } from '../domain/money';
import { monthRange } from './dashboard';
import { categoryDescendantIds, categoryPath } from '../domain/categories';
export function planningData(state: State, month: string, includeIncome = false) {
  const period = monthRange(month);
  const ids = new Set(state.operations.filter(op => op.date >= period.from && op.date <= period.to).map(op => op.id));
  const budgets = state.budgets.filter(item => item.month === month).map(item => {
    const categoryIds = new Set(categoryDescendantIds(state.categories, item.categoryId));
    return { ...item, name: categoryPath(state.categories, item.categoryId),
      spent: sum(state.entries.filter(entry => entry.ledger === 'expense' && categoryIds.has(entry.referenceId) && ids.has(entry.operationId)).map(entry => entry.side === 'debit' ? entry.amount : -entry.amount)),
    };
  });
  const open = state.forecasts.filter(item => !item.cancelled && !item.operationId && item.date <= period.to);
  const predictedIncome = sum(open.filter(item => item.kind === 'income').map(item => item.amount));
  const predictedExpense = sum(open.filter(item => item.kind === 'expense').map(item => item.amount));
  const invoices = sum(state.invoices.filter(item => item.dueDate <= period.to).map(item => balance(state, 'card', item.id)));
  const loans = sum(state.loans.filter(item => item.direction === 'borrowed' && item.dueDate <= period.to).map(item => balance(state, 'loanDebt', item.id)));
  return { budgets, predictedIncome, predictedExpense, invoices, loans,
    conservative: sum([available(state), -predictedExpense, -invoices, -loans, ...(includeIncome ? [predictedIncome] : [])]),
  };
}
