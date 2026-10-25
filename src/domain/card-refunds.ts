import type { Command, Entry, Operation, State } from './model';
import type { Context } from './engine';
import { ensure, requireRecord } from './integrity';
import { activeRefundAllocations, balance } from './queries';
import { sum } from './money';

type RefundCommand = Extract<Command, { type: 'purchaseRefund' | 'cardCreditUse' | 'personRefund' }>;
type Posting = Pick<Entry, 'ledger' | 'referenceId' | 'side' | 'amount' | 'categoryId'>;
type Hooks = { op: (kind: Operation['kind'], date: string, description: string, relatedId?: string) => void; entry: (ledger: Entry['ledger'], referenceId: string, side: Entry['side'], amount: number, categoryId?: string) => void };
export function stateAt(state: State, date: string): State {
  const ids = new Set(state.operations.filter(item => item.date <= date).map(item => item.id));
  return { ...state, entries: state.entries.filter(item => ids.has(item.operationId)) };
}
export function refundedSplit(state: State, splitId: string) { return sum(activeRefundAllocations(state).filter(item => item.splitId === splitId).map(item => item.amount)); }

/** A commercial credit keeps original installments and cash payments untouched. */
export function cardRefundCommand(state: State, command: RefundCommand, context: Context, hooks: Hooks): string {
  const record = <T extends { id: string }>(rows: T[], id: string, name: string) => requireRecord(rows, id, name);
  const post = (ledger: Entry['ledger'], referenceId: string, side: Entry['side'], amount: number, categoryId?: string) => { if (amount) hooks.entry(ledger, referenceId, side, amount, categoryId); };
  if (command.type === 'purchaseRefund') {
    const purchase = record(state.purchases, command.purchaseId, 'Compra');
    const original = record(state.operations, purchase.operationId, 'Compra original');
    const invoice = record(state.invoices, command.invoiceId, 'Fatura creditada');
    const cardId = record(state.invoices, purchase.invoiceId, 'Fatura original').cardId;
    ensure(invoice.cardId === cardId, 'Escolha uma fatura do mesmo cartão da compra.');
    ensure(!record(state.cards, cardId, 'Cartão').archived, 'Este cartão está arquivado.');
    ensure(command.date >= original.date, 'O crédito não pode ser anterior à compra.');
    ensure(new Set(command.allocations.map(item => item.splitId)).size === command.allocations.length, 'Divisão repetida no estorno.');
    ensure(sum(command.allocations.map(item => item.amount)) === command.amount, 'A soma das devoluções por divisão deve corresponder ao crédito.');
    const invoiceIds = new Set(state.invoices.filter(item => item.cardId === cardId).map(item => item.id));
    const receivableIds = new Set(state.receivables.filter(item => command.allocations.some(allocation => allocation.splitId === item.splitId)).map(item => item.id));
    const affected = new Set(state.entries.filter(item => (item.ledger === 'card' && invoiceIds.has(item.referenceId)) || (item.ledger === 'cardCredit' && item.referenceId === cardId) || (['receivable', 'personPayable'].includes(item.ledger) && receivableIds.has(item.referenceId))).map(item => item.operationId));
    ensure(!state.operations.some(item => affected.has(item.id) && item.date > command.date), 'Há movimentos posteriores neste cartão ou nas divisões selecionadas. Registre os créditos em ordem de data; revise o histórico antes de lançar um estorno retroativo.');
    for (const allocation of command.allocations) {
      const split = record(state.splits, allocation.splitId, 'Divisão');
      ensure(split.purchaseId === purchase.id, 'A divisão pertence a outra compra.');
      ensure(sum([refundedSplit(state, split.id), allocation.amount]) <= split.amount, 'O estorno excede o valor ainda não devolvido da divisão.');
    }
    const meta = () => ({ id: context.newId(), createdAt: context.now });
    const refund = { ...meta(), operationId: command.key, purchaseId: purchase.id, invoiceId: invoice.id, amount: command.amount };
    state.purchaseRefunds.push(refund);
    hooks.op('purchaseRefund', command.date, command.description, purchase.id);
    const reduction = Math.min(command.amount, balance(state, 'card', invoice.id));
    post('card', invoice.id, 'debit', reduction);
    post('cardCredit', cardId, 'debit', command.amount - reduction);
    for (const allocation of command.allocations) {
      const split = record(state.splits, allocation.splitId, 'Divisão');
      state.refundAllocations.push({ ...meta(), refundId: refund.id, ...allocation });
      if (split.personId) {
        const receivable = state.receivables.find(item => item.splitId === split.id)!;
        const cancelled = Math.min(allocation.amount, balance(state, 'receivable', receivable.id));
        post('receivable', receivable.id, 'credit', cancelled);
        post('personPayable', receivable.id, 'credit', allocation.amount - cancelled);
      } else post('expense', split.categoryId!, 'credit', allocation.amount, split.categoryId);
    }
    return refund.id;
  }
  const atDate = stateAt(state, command.date);
  if (command.type === 'cardCreditUse') {
    const invoice = record(state.invoices, command.invoiceId, 'Fatura');
    ensure(command.amount <= balance(state, 'cardCredit', invoice.cardId) && command.amount <= balance(atDate, 'cardCredit', invoice.cardId), 'O valor excede o crédito disponível neste cartão na data.');
    ensure(command.amount <= balance(state, 'card', invoice.id) && command.amount <= balance(atDate, 'card', invoice.id), 'O crédito utilizado excede a fatura pendente na data.');
    hooks.op('cardCreditUse', command.date, command.description, invoice.id);
    post('card', invoice.id, 'debit', command.amount); post('cardCredit', invoice.cardId, 'credit', command.amount);
  } else {
    const receivable = record(state.receivables, command.receivableId, 'Recebível da devolução');
    ensure(!record(state.accounts, command.accountId, 'Conta').archived, 'Esta conta está arquivada.');
    ensure(command.amount <= balance(state, 'personPayable', receivable.id) && command.amount <= balance(atDate, 'personPayable', receivable.id), 'A devolução excede o valor devido à pessoa na data.');
    hooks.op('personRefund', command.date, command.description, receivable.id);
    post('personPayable', receivable.id, 'debit', command.amount); post('cash', command.accountId, 'credit', command.amount);
  }
  return command.key;
}

const fingerprint = (item: Posting) => JSON.stringify([item.ledger, item.referenceId, item.side, item.amount, item.categoryId ?? null]);
function exact(actual: Entry[], expected: Posting[]) {
  ensure(JSON.stringify(actual.map(fingerprint).sort()) === JSON.stringify(expected.map(fingerprint).sort()), 'Lançamentos incompatíveis com o estorno/crédito/devolução.');
}

/** Validate records, exact postings and daily financial prefixes, including restored data. */
export function assertCardRefunds(state: State): void {
  const operations = new Map(state.operations.map(item => [item.id, item]));
  const seen = new Set<string>();
  for (const refund of state.purchaseRefunds) {
    const operation = requireRecord(state.operations, refund.operationId, 'Operação do estorno');
    ensure(operation.kind === 'purchaseRefund' && operation.relatedId === refund.purchaseId && !seen.has(operation.id), 'Vínculo do estorno comercial inválido.'); seen.add(operation.id);
    const purchase = requireRecord(state.purchases, refund.purchaseId, 'Compra estornada');
    ensure(operation.date >= operations.get(purchase.operationId)!.date, 'Estorno anterior à compra.');
    const invoice = requireRecord(state.invoices, refund.invoiceId, 'Fatura creditada');
    ensure(invoice.cardId === requireRecord(state.invoices, purchase.invoiceId, 'Fatura original').cardId, 'Crédito em cartão diferente da compra.');
    const allocations = state.refundAllocations.filter(item => item.refundId === refund.id);
    ensure(allocations.length > 0 && new Set(allocations.map(item => item.splitId)).size === allocations.length && sum(allocations.map(item => item.amount)) === refund.amount, 'Alocações do estorno inválidas.');
    const entries = state.entries.filter(item => item.operationId === operation.id), expected: Posting[] = [];
    const post = (ledger: Entry['ledger'], referenceId: string, side: Entry['side'], amount: number, categoryId?: string) => { if (amount) expected.push({ ledger, referenceId, side, amount, ...(categoryId ? { categoryId } : {}) }); };
    const reduction = sum(entries.filter(item => item.ledger === 'card' && item.side === 'debit').map(item => item.amount));
    ensure(reduction <= refund.amount, 'Redução de fatura excede o estorno.');
    post('card', invoice.id, 'debit', reduction); post('cardCredit', invoice.cardId, 'debit', refund.amount - reduction);
    for (const allocation of allocations) {
      const split = requireRecord(state.splits, allocation.splitId, 'Divisão estornada');
      ensure(split.purchaseId === purchase.id && allocation.amount <= split.amount && refundedSplit(state, split.id) <= split.amount, 'Estorno excedente ou de outra compra.');
      if (!split.personId) post('expense', split.categoryId!, 'credit', allocation.amount, split.categoryId);
      else {
        const receivable = state.receivables.find(item => item.splitId === split.id)!;
        const cancelled = sum(entries.filter(item => item.ledger === 'receivable' && item.referenceId === receivable.id && item.side === 'credit').map(item => item.amount));
        ensure(cancelled <= allocation.amount, 'Cancelamento de recebível excedente.');
        post('receivable', receivable.id, 'credit', cancelled); post('personPayable', receivable.id, 'credit', allocation.amount - cancelled);
      }
    }
    exact(entries, expected);
  }
  for (const item of state.refundAllocations) requireRecord(state.purchaseRefunds, item.refundId, 'Estorno da alocação');
  for (const operation of state.operations) {
    const entries = state.entries.filter(item => item.operationId === operation.id);
    if (operation.kind === 'purchaseRefund') ensure(seen.has(operation.id), 'Estorno comercial sem registro.');
    if (operation.kind === 'cardCreditUse') {
      const invoice = requireRecord(state.invoices, operation.relatedId!, 'Fatura compensada');
      const amount = entries.find(item => item.ledger === 'card')?.amount;
      ensure(amount, 'Utilização sem valor.');
      exact(entries, [{ ledger: 'card', referenceId: invoice.id, side: 'debit', amount }, { ledger: 'cardCredit', referenceId: invoice.cardId, side: 'credit', amount }]);
    }
    if (operation.kind === 'personRefund') {
      const receivable = requireRecord(state.receivables, operation.relatedId!, 'Recebível da devolução');
      const cash = entries.find(item => item.ledger === 'cash'); ensure(cash, 'Devolução sem conta.');
      exact(entries, [{ ledger: 'personPayable', referenceId: receivable.id, side: 'debit', amount: cash.amount }, { ledger: 'cash', referenceId: cash.referenceId, side: 'credit', amount: cash.amount }]);
    }
  }
  // At each day: pending=max(P-R-C,0), payable=max(C-(P-R),0)-D.
  // Same-day events are grouped; no intraday order is asserted by the model.
  for (const receivable of state.receivables) {
    const refunds = state.refundAllocations.filter(item => item.splitId === receivable.splitId);
    if (!refunds.length) continue;
    const activeIds = new Set(activeRefundAllocations(state).map(item => item.id));
    const entries = state.entries.filter(item => ['receivable', 'personPayable'].includes(item.ledger) && item.referenceId === receivable.id);
    const dates = new Set(entries.map(item => operations.get(item.operationId)!.date));
    for (const allocation of refunds) dates.add(operations.get(state.purchaseRefunds.find(item => item.id === allocation.refundId)!.operationId)!.date);
    let principal = 0, cancelled = 0, received = 0, returned = 0, pending = 0, payable = 0;
    for (const date of [...dates].sort()) {
      cancelled = sum([cancelled, ...refunds.filter(item => activeIds.has(item.id) && operations.get(state.purchaseRefunds.find(refund => refund.id === item.refundId)!.operationId)!.date === date).map(item => item.amount)]);
      for (const entry of entries.filter(item => operations.get(item.operationId)!.date === date)) {
        const kind = operations.get(entry.operationId)!.kind;
        if (entry.ledger === 'receivable') {
          pending = sum([pending, entry.side === 'debit' ? entry.amount : -entry.amount]);
          if (kind === 'purchase') principal = sum([principal, entry.amount]);
          if (kind === 'reimbursement' || (kind === 'reversal' && operations.get(operations.get(entry.operationId)!.relatedId!)?.kind === 'reimbursement')) received = sum([received, entry.side === 'credit' ? entry.amount : -entry.amount]);
        } else {
          payable = sum([payable, entry.side === 'credit' ? entry.amount : -entry.amount]);
          if (kind === 'personRefund' || (kind === 'reversal' && operations.get(operations.get(entry.operationId)!.relatedId!)?.kind === 'personRefund')) returned = sum([returned, entry.side === 'debit' ? entry.amount : -entry.amount]);
        }
      }
      const adjusted = sum([principal, -cancelled]);
      ensure(adjusted >= 0 && pending === Math.max(sum([adjusted, -received]), 0) && payable === sum([Math.max(sum([received, -adjusted]), 0), -returned]) && payable >= 0, 'Histórico de recebíveis e devoluções incompatível na data. Um movimento retroativo exige revisão.');
    }
  }
}
