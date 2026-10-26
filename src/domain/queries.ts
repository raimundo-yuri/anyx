import { FinanceError } from './errors.js';
import type { Entry, State } from './model.js';
import { validDate } from './dates.js';
import { cents, sum } from './money.js';

/** Natural balances: asset/expense debit positive; liability/income/equity credit positive. */
export function balance(state: State, ledger: Entry['ledger'], referenceId?: string): number {
  const debitPositive = ['cash', 'receivable', 'expense', 'investment', 'loanAsset', 'cardCredit'].includes(ledger);
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
    receivables, invoices, cardCredit: balance(state, 'cardCredit'), personPayable: balance(state, 'personPayable'), netWorth: sum([cash, receivables, -invoices, balance(state, 'cardCredit'), -balance(state, 'personPayable'), balance(state, 'investment'), balance(state, 'loanAsset'), -balance(state, 'loanDebt')]),
  };
}

export function activeRefundAllocations(state: State) {
  const reversed = new Set(state.operations.filter(item => item.kind === 'reversal').map(item => item.relatedId));
  const active = new Set(state.purchaseRefunds.filter(item => !reversed.has(item.operationId)).map(item => item.id));
  return state.refundAllocations.filter(item => active.has(item.refundId));
}
export function netReimbursementIds(state: State) {
  const originals = new Set(state.operations.filter(item => item.kind === 'reimbursement').map(item => item.id));
  return new Set(state.operations.filter(item => originals.has(item.id) || (item.kind === 'reversal' && originals.has(item.relatedId!))).map(item => item.id));
}

export function receivablePlan(state: State, receivableId: string) {
  const receivable = state.receivables.find(item => item.id === receivableId);
  if (!receivable) return [];
  const reimbursedIds = netReimbursementIds(state);
  let paid = sum(state.entries.filter(item => reimbursedIds.has(item.operationId) && item.ledger === 'receivable' && item.referenceId === receivableId).map(item => item.side === 'credit' ? item.amount : -item.amount));
  let cancelled = sum(activeRefundAllocations(state).filter(item => item.splitId === receivable.splitId).map(item => item.amount));
  const cancellations = new Map<string, number>();
  for (const part of state.receivableSchedules.filter(item => item.receivableId === receivableId).sort((a, b) => b.index - a.index)) {
    const amount = Math.min(cancelled, part.amount); cancelled -= amount; cancellations.set(part.id, amount);
  }
  return state.receivableSchedules.filter(item => item.receivableId === receivableId).sort((a, b) => a.index - b.index).map(item => {
    const cancelled = cancellations.get(item.id) ?? 0;
    const applied = Math.min(paid, item.amount - cancelled); paid -= applied;
    return { ...item, paid: applied, cancelled, pending: item.amount - cancelled - applied };
  });
}
