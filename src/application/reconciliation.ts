import type { State } from '../domain/model';
import { FinanceError } from '../domain/errors';
import { validDate } from '../domain/dates';
import { cents, sum } from '../domain/money';
import { requireRecord } from '../domain/integrity';
import { operationLabels } from './finance-view';

/** Compare a statement's closing balance with this account's cash entries through a civil date. */
export function accountReconciliation(state: State, accountId: string, cutoff: string, statementBalance: number) {
  const account = requireRecord(state.accounts, accountId, 'Conta');
  if (!validDate(cutoff)) throw new FinanceError('Informe uma data de corte válida.');
  if (cutoff < account.openedOn) throw new FinanceError('A data de corte não pode ser anterior à abertura da conta.');
  cents(statementBalance);
  const operations = new Map(state.operations.map(operation => [operation.id, operation]));
  const reversed = new Set(state.operations.filter(operation => operation.kind === 'reversal').map(operation => operation.relatedId));
  const cashByOperation = new Map<string, number[]>();
  for (const entry of state.entries) {
    if (entry.ledger !== 'cash' || entry.referenceId !== accountId) continue;
    const operation = operations.get(entry.operationId);
    if (!operation) throw new FinanceError('Há um lançamento de caixa sem operação correspondente. Confira a integridade dos registros antes de comparar.');
    if (operation.date > cutoff) continue;
    const amounts = cashByOperation.get(operation.id) ?? [];
    amounts.push(entry.side === 'debit' ? entry.amount : -entry.amount);
    cashByOperation.set(operation.id, amounts);
  }
  const movements = [...cashByOperation].map(([id, amounts]) => {
    const operation = operations.get(id)!;
    const original = operation.kind === 'reversal' && operation.relatedId ? operations.get(operation.relatedId) : undefined;
    return {
      ...operation,
      label: operationLabels[operation.kind],
      cashChange: sum(amounts),
      reversed: reversed.has(id),
      originalDescription: original?.description,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const calculatedBalance = sum(movements.map(movement => movement.cashChange));
  return {
    account, cutoff, statementBalance, calculatedBalance,
    // Positive means the bank statement shows more money than the app.
    difference: sum([statementBalance, -calculatedBalance]),
    movements,
  };
}
