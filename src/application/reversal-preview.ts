import { isReversibleMovement, type State } from '../domain/model';
import { requireRecord } from '../domain/integrity';
import { balance, reserved, reversalFor } from '../domain/queries';
import { sum } from '../domain/money';
import { execute } from '../domain/engine';
import { userError } from './user-error';

export function reversalPreview(state: State, operationId: string) {
  const original = requireRecord(state.operations, operationId, 'Lançamento original');
  const reversal = reversalFor(state, original.id);
  const amount = sum(state.entries.filter(item => item.operationId === original.id && item.side === 'debit').map(item => item.amount));
  const contributions = state.contributions.filter(item => item.incomeId === original.id);
  const pending = contributions.filter(item => item.status === 'suggested' || item.status === 'reserved');
  const paid = contributions.filter(item => item.status === 'paid');
  const changes = state.entries.filter(item => item.operationId === original.id && item.ledger === 'cash').map(item => {
    const account = requireRecord(state.accounts, item.referenceId, 'Conta');
    const delta = item.side === 'credit' ? item.amount : -item.amount;
    const released = sum(state.reserves.filter(hold => hold.accountId === account.id && pending.some(contribution => contribution.id === hold.contributionId && contribution.status === 'reserved')).map(hold => hold.amount));
    const after = sum([balance(state, 'cash', account.id), ...(reversal ? [] : [delta])]);
    const heldAfter = sum([reserved(state, account.id), -released]);
    return { account, delta, after, heldAfter };
  });
  let blockedReason = !isReversibleMovement(original.kind) ? 'Este tipo de registro ainda não admite correção por estorno.'
    : reversal ? 'Este lançamento já foi estornado.'
    : changes.some(item => item.account.archived) ? 'Reative as contas envolvidas antes de estornar este lançamento.'
    : changes.some(item => item.heldAfter > 0 && item.after < item.heldAfter) ? 'O estorno deixaria reservas sem cobertura. Ajuste as reservas das contas envolvidas antes de confirmar.' : '';
  if (!blockedReason) {
    try { execute(state, { key: crypto.randomUUID(), type: 'reverseMovement', operationId, reason: 'Prévia de correção' }, { now: new Date().toISOString(), newId: () => crypto.randomUUID() }); }
    catch (reason) { blockedReason = `A correção não pode ser confirmada neste estado: ${userError(reason)} Revise os registros que dependem deste lançamento.`; }
  }
  const ledgerChanges = new Map<string, { ledger: State['entries'][number]['ledger']; referenceId: string; delta: number; after: number }>();
  for (const entry of state.entries.filter(item => item.operationId === original.id && item.ledger !== 'cash')) {
    const key = `${entry.ledger}:${entry.referenceId}`, old = ledgerChanges.get(key);
    const debitPositive = ['receivable', 'expense', 'investment', 'loanAsset', 'cardCredit'].includes(entry.ledger);
    const delta = sum([old?.delta ?? 0, (entry.side === 'credit' ? 1 : -1) * (debitPositive ? 1 : -1) * entry.amount]);
    ledgerChanges.set(key, { ledger: entry.ledger, referenceId: entry.referenceId, delta, after: sum([balance(state, entry.ledger, entry.referenceId), ...(reversal ? [] : [delta])]) });
  }
  return { original, reversal, amount, changes, pending, paid, blockedReason, ledgerChanges: [...ledgerChanges.values()] };
}
