import { FinanceError } from './errors';
import type { Entry, State } from './model';
import { validDate } from './dates';
import { cents, sum } from './money';

/** Natural balances: asset/expense debit positive; liability/income/equity credit positive. */
export function balance(state: State, ledger: Entry['ledger'], referenceId?: string): number {
  const debitPositive = ['cash', 'receivable', 'expense', 'investment', 'loanAsset'].includes(ledger);
  return sum(state.entries.filter(entry => entry.ledger === ledger && (!referenceId || entry.referenceId === referenceId))
    .map(entry => (entry.side === (debitPositive ? 'debit' : 'credit') ? 1 : -1) * entry.amount));
}
export function reserved(state: State, accountId?: string): number {
  return sum(state.reserves.filter(item => (!accountId || item.accountId === accountId) &&
    (item.goalId ? state.goals.some(goal => goal.id === item.goalId) : state.contributions.some(contribution => contribution.id === item.contributionId && contribution.status === 'reserved'))).map(item => item.amount));
}
export function available(state: State, accountId?: string): number {
  return cents(balance(state, 'cash', accountId) - reserved(state, accountId));
}
export function reversalFor(state: State, operationId: string) {
  return state.operations.find(item => item.kind === 'reversal' && item.relatedId === operationId);
}
export function summary(state: State, period?: { from: string; to: string }) {
  if (period && (!validDate(period.from) || !validDate(period.to) || period.from > period.to)) throw new FinanceError('Período inválido.');
  const ids = new Set(state.operations.filter(op => !period || (op.date >= period.from && op.date <= period.to)).map(op => op.id));
  const inPeriod = { ...state, entries: state.entries.filter(entry => ids.has(entry.operationId)) };
  const cash = balance(state, 'cash');
  const receivables = balance(state, 'receivable');
  const invoices = balance(state, 'card');
  return {
    cash, available: available(state), reserved: reserved(state),
    income: balance(inPeriod, 'income'), expenses: balance(inPeriod, 'expense'),
    receivables, invoices, netWorth: sum([cash, receivables, -invoices, balance(state, 'investment'), balance(state, 'loanAsset'), -balance(state, 'loanDebt')]),
  };
}

export function receivablePlan(state: State, receivableId: string) {
  const receivable = state.receivables.find(item => item.id === receivableId);
  if (!receivable) return [];
  let paid = receivable.amount - balance(state, 'receivable', receivableId);
  return state.receivableSchedules.filter(item => item.receivableId === receivableId).sort((a, b) => a.index - b.index).map(item => {
    const applied = Math.min(paid, item.amount); paid -= applied;
    return { ...item, pending: item.amount - applied };
  });
}
