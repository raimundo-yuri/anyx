import { isReversibleMovement, type State } from '../domain/model';
import { requireRecord } from '../domain/integrity';
import { balance, reserved, reversalFor } from '../domain/queries';
import { sum } from '../domain/money';

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
  const blockedReason = !isReversibleMovement(original.kind) ? 'O estorno de correção está disponível para receitas, despesas e transferências.'
    : reversal ? 'Este lançamento já foi estornado.'
    : changes.some(item => item.account.archived) ? 'Reative as contas envolvidas antes de estornar este lançamento.'
    : changes.some(item => item.heldAfter > 0 && item.after < item.heldAfter) ? 'O estorno deixaria reservas sem cobertura. Ajuste as reservas das contas envolvidas antes de confirmar.' : '';
  return { original, reversal, amount, changes, pending, paid, blockedReason };
}
