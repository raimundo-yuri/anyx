import type { Operation, State } from '../domain/model.js';
import { sum, cents } from '../domain/money.js';
import { validDate } from '../domain/dates.js';
import { FinanceError } from '../domain/errors.js';
import { reversalFor } from '../domain/queries.js';
import { categoryPath } from '../domain/categories.js';

export const operationLabels: Record<Operation['kind'], string> = {
  reversal: 'Estorno de correção', purchaseRefund: 'Devolução de compra', cardCreditUse: 'Crédito aplicado em fatura', personRefund: 'Devolução à pessoa',
  investmentDeposit: 'Aporte', investmentWithdrawal: 'Resgate', valuation: 'Avaliação patrimonial', loanLent: 'Empréstimo concedido', loanBorrowed: 'Empréstimo recebido', loanRepayment: 'Pagamento de empréstimo',
  opening: 'Saldo inicial', income: 'Receita', expense: 'Despesa', transfer: 'Transferência',
  purchase: 'Compra no cartão', reimbursement: 'Reembolso', invoicePayment: 'Pagamento de fatura', contributionPayment: 'Contribuição',
};
export interface MovementFilters { query: string; kind: string; accountId: string; from: string; to: string }
export const emptyFilters: MovementFilters = { query: '', kind: '', accountId: '', from: '', to: '' };
export function movementRows(state: State, filters: MovementFilters = emptyFilters) {
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) ||
    (filters.from && filters.to && filters.from > filters.to)) throw new FinanceError('Informe um período válido: a data inicial não pode ser posterior à final.');
  return state.operations.map(operation => {
    const original = operation.kind === 'reversal' ? state.operations.find(item => item.id === operation.relatedId) : undefined;
    const reversal = reversalFor(state, operation.id);
    const entries = state.entries.filter(item => item.operationId === operation.id);
    const cash = entries.filter(item => item.ledger === 'cash');
    const transfer = operation.kind === 'transfer' || original?.kind === 'transfer';
    if (transfer) cash.sort((a, b) => (a.side === 'credit' ? 0 : 1) - (b.side === 'credit' ? 0 : 1));
    const accountIds = cash.map(item => item.referenceId);
    const accounts = [...new Set(accountIds)].map(id => state.accounts.find(item => item.id === id)?.name ?? 'Conta');
    const categoryIds = [...new Set(entries.flatMap(item => item.categoryId ? [item.categoryId] : []))];
    const categories = categoryIds.map(id => categoryPath(state.categories, id));
    const debit = sum(entries.filter(item => item.side === 'debit').map(item => item.amount));
    const cashChange = sum(cash.map(item => item.side === 'debit' ? item.amount : -item.amount));
    const direction = transfer ? 'neutral' : cashChange > 0 ? 'in' : cashChange < 0 || operation.kind === 'purchase' ? 'out' : 'neutral';
    return { ...operation, original, reversal, label: original ? `Estorno de ${operationLabels[original.kind].toLocaleLowerCase('pt-BR')}` : operationLabels[operation.kind], accountIds, accounts, categories, amount: debit, cashChange, direction };
  }).filter(row => (!filters.kind || row.kind === filters.kind) && (!filters.accountId || row.accountIds.includes(filters.accountId)) &&
    (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) &&
    `${row.description} ${row.original?.description ?? ''} ${row.reversal?.description ?? ''} ${row.accounts.join(' ')} ${row.categories.join(' ')}`.toLocaleLowerCase('pt-BR').includes(filters.query.trim().toLocaleLowerCase('pt-BR')))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
/** Format integer cents without converting to an imprecise decimal near MAX_SAFE_INTEGER. */
export function formatMoney(value: number) {
  cents(value);
  const amount = BigInt(value), absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}R$\u00a0${new Intl.NumberFormat('pt-BR').format(absolute / 100n)},${String(absolute % 100n).padStart(2, '0')}`;
}
export function displayDate(date: string) { return date.split('-').reverse().join('/'); }
export function localToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
