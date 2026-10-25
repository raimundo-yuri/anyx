import { commandSchema, isReversibleMovement, type Command, type Entry, type State } from './model';
import { assertState, ensure, requireRecord } from './integrity';
import { balance, reversalFor } from './queries';
import { cardRefundCommand } from './card-refunds';
import { advancedCommand } from './advanced-engine';
import { allocate, percentage, sum } from './money';
import { invoiceDates, nextMonth } from './dates';
import { catalogId, suggestedCategories, suggestedSources } from './catalog';

export interface Context { now: string; newId: () => string }
export interface Execution { state: State; resultId: string; replayed: boolean }

/** No I/O. The caller owns the atomic database transaction and clock/ID generation. */
export function execute(input: State, raw: unknown, context: Context): Execution {
  assertState(input);
  const command = commandSchema.parse(raw);
  const payload = JSON.stringify(command);
  const previous = input.receipts.find(receipt => receipt.id === command.key);
  if (previous) {
    ensure(previous.payload === payload, 'Chave de idempotência reutilizada com dados diferentes.');
    return { state: input, resultId: previous.resultId, replayed: true };
  }
  const state = structuredClone(input);
  const meta = () => ({ id: context.newId(), createdAt: context.now });
  const namedMeta = (id: string) => ({ id, createdAt: context.now });
  const record = <T extends { id: string }>(items: T[], id: string, label: string) => requireRecord(items, id, label);
  const category = (id: string, kind: 'income' | 'expense') => {
    const item = record(state.categories, id, 'Categoria');
    ensure(item.kind === kind, 'Natureza de categoria incompatível.');
    ensure(!item.archived, 'Esta categoria está arquivada.');
  };
  const account = (id: string) => {
    const item = record(state.accounts, id, 'Conta');
    ensure(!item.archived, 'Esta conta está arquivada.');
    return item;
  };
  const addOperation = (kind: State['operations'][number]['kind'], date: string, description: string, relatedId?: string) => {
    state.operations.push({ ...namedMeta(command.key), kind, date, description, ...(relatedId ? { relatedId } : {}) });
  };
  const entry = (ledger: Entry['ledger'], referenceId: string, side: Entry['side'], amount: number, categoryId?: string) => {
    state.entries.push({ ...meta(), operationId: command.key, ledger, referenceId, side, amount, ...(categoryId ? { categoryId } : {}) });
  };
  const contribute = (data: { accountId: string; sourceId: string; amount: number }) => {
      for (const rule of state.rules.filter(item => item.enabled && item.sourceIds.includes(data.sourceId))) {
        const amount = percentage(data.amount, rule.basisPoints);
        if (amount === 0) continue;
        const contributionId = context.newId();
        state.contributions.push({ ...namedMeta(contributionId), incomeId: command.key, ruleId: rule.id, accountId: data.accountId, amount, basisPoints: rule.basisPoints, status: rule.mode === 'reserve' ? 'reserved' : 'suggested' });
        if (rule.mode === 'reserve') state.reserves.push({ ...meta(), accountId: data.accountId, amount, contributionId });
      }
  };
  const postIncome = (data: { accountId: string; categoryId: string; sourceId: string; amount: number; date: string; description: string }) => {
      account(data.accountId); category(data.categoryId, 'income'); ensure(!record(state.sources, data.sourceId, 'Fonte de receita').archived, 'Esta fonte de receita está arquivada.');
      addOperation('income', data.date, data.description);
      entry('cash', data.accountId, 'debit', data.amount);
      entry('income', data.sourceId, 'credit', data.amount, data.categoryId);
    contribute(data);
  };
  const postExpense = (data: { accountId: string; categoryId: string; amount: number; date: string; description: string }) => {
    account(data.accountId); category(data.categoryId, 'expense');
    addOperation('expense', data.date, data.description);
    entry('expense', data.categoryId, 'debit', data.amount, data.categoryId);
    entry('cash', data.accountId, 'credit', data.amount);
  };
  let resultId = command.key;
  switch (command.type) {
    case 'purchaseRefund': case 'cardCreditUse': case 'personRefund':
      resultId = cardRefundCommand(state, command, context, { op: addOperation, entry }); break;
    case 'setCategoryParent': {
      const item = record(state.categories, command.id, 'Categoria');
      if (command.parentId) item.parentId = command.parentId; else delete item.parentId;
      item.updatedAt = context.now; resultId = item.id; break;
    }
    case 'reverseMovement': {
      const original = record(state.operations, command.operationId, 'Lançamento original');
      ensure(isReversibleMovement(original.kind), 'Este tipo de registro ainda não admite correção por estorno.');
      ensure(!reversalFor(state, original.id), 'Este lançamento já foi estornado.');
      const originalEntries = state.entries.filter(item => item.operationId === original.id);
      for (const item of originalEntries.filter(item => item.ledger === 'cash')) account(item.referenceId);
      // Correct the original reporting period; creation time still records when the correction occurred.
      addOperation('reversal', original.date, command.reason, original.id);
      for (const item of originalEntries) entry(item.ledger, item.referenceId, item.side === 'debit' ? 'credit' : 'debit', item.amount, item.categoryId);
      for (const contribution of state.contributions.filter(item => item.incomeId === original.id && ['suggested', 'reserved'].includes(item.status))) {
        contribution.status = 'cancelled'; contribution.cancelledById = command.key;
      }
      break;
    }
    case 'updateCard': {
      const item = record(state.cards, command.id, 'Cartão');
      Object.assign(item, { name: command.name, limit: command.limit, closingDay: command.closingDay, dueDay: command.dueDay, updatedAt: context.now });
      if (command.institution !== undefined) item.institution = command.institution;
      resultId = item.id; break;
    }
    case 'renamePerson': {
      const item = record(state.people, command.id, 'Pessoa'); item.name = command.name; item.updatedAt = context.now; resultId = item.id; break;
    }
    case 'adjustContribution': {
      const item = record(state.contributions, command.id, 'Contribuição');
      ensure(['suggested', 'reserved'].includes(item.status), 'Contribuição já encerrada.');
      item.amount = command.amount;
      for (const reserve of state.reserves.filter(reserve => reserve.contributionId === item.id)) reserve.amount = command.amount;
      resultId = item.id; break;
    }
    case 'updateRule': {
      const item = record(state.rules, command.id, 'Regra');
      Object.assign(item, { name: command.name, enabled: command.enabled, basisPoints: command.basisPoints, sourceIds: command.sourceIds, mode: command.mode }); resultId = item.id; break;
    }
    case 'installCatalog': {
      for (const [index, [name, kind]] of suggestedCategories.entries()) {
        if (!state.categories.some(item => item.id === catalogId('category', index) || (item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR') && item.kind === kind))) {
          state.categories.push({ ...namedMeta(catalogId('category', index)), name, kind });
        }
      }
      for (const [index, name] of suggestedSources.entries()) {
        if (!state.sources.some(item => item.id === catalogId('source', index) || item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
          state.sources.push({ ...namedMeta(catalogId('source', index)), name });
        }
      }
      resultId = state.categories[0].id;
      break;
    }
    case 'updateAccount': {
      const item = record(state.accounts, command.id, 'Conta');
      item.name = command.name; item.updatedAt = context.now;
      if (command.institution !== undefined) item.institution = command.institution;
      if (command.kind !== undefined) item.kind = command.kind;
      resultId = item.id; break;
    }
    case 'renameCategory': case 'renameSource': {
      const items = command.type === 'renameCategory' ? state.categories : state.sources;
      const item = record(items, command.id, 'Cadastro');
      item.name = command.name; item.updatedAt = context.now; resultId = item.id; break;
    }
    case 'setArchived': {
      const items = command.entity === 'account' ? state.accounts : command.entity === 'category' ? state.categories : state.sources;
      const item = record(items, command.id, 'Cadastro');
      if (command.entity === 'account' && command.archived) ensure(balance(state, 'cash', item.id) === 0, 'A conta precisa ter saldo zero para ser arquivada.');
      item.archived = command.archived; item.updatedAt = context.now; resultId = item.id; break;
    }
    case 'createAccount': {
      state.accounts.push({ ...namedMeta(command.id), name: command.name, currency: 'BRL', openedOn: command.date, ...(command.institution !== undefined ? { institution: command.institution } : {}), ...(command.kind ? { kind: command.kind } : {}) });
      resultId = command.id;
      if (command.openingBalance !== 0) {
        addOperation('opening', command.date, 'Saldo inicial');
        const positive = command.openingBalance > 0;
        entry('cash', command.id, positive ? 'debit' : 'credit', Math.abs(command.openingBalance));
        entry('equity', command.id, positive ? 'credit' : 'debit', Math.abs(command.openingBalance));
      }
      break;
    }
    case 'createCategory':
      state.categories.push({ ...namedMeta(command.id), name: command.name, kind: command.kind, ...(command.parentId ? { parentId: command.parentId } : {}) }); resultId = command.id; break;
    case 'createPerson':
      state.people.push({ ...namedMeta(command.id), name: command.name }); resultId = command.id; break;
    case 'createSource':
      state.sources.push({ ...namedMeta(command.id), name: command.name }); resultId = command.id; break;
    case 'createCard':
      state.cards.push({ ...namedMeta(command.id), name: command.name, limit: command.limit, closingDay: command.closingDay, dueDay: command.dueDay, ...(command.institution !== undefined ? { institution: command.institution } : {}) }); resultId = command.id; break;
    case 'createRule':
      state.rules.push({ ...namedMeta(command.id), name: command.name, enabled: command.enabled, basisPoints: command.basisPoints, sourceIds: command.sourceIds, mode: command.mode }); resultId = command.id; break;
    case 'income': postIncome(command); break;
    case 'expense': postExpense(command); break;
    case 'transfer':
      account(command.fromId); account(command.toId); ensure(command.fromId !== command.toId, 'Escolha contas diferentes.');
      addOperation('transfer', command.date, command.description);
      entry('cash', command.toId, 'debit', command.amount);
      entry('cash', command.fromId, 'credit', command.amount); break;
    case 'purchase': {
      const card = record(state.cards, command.cardId, 'Cartão');
      if (command.buyerId) record(state.people, command.buyerId, 'Comprador');
      ensure(sum(command.splits.map(split => split.amount)) === command.amount, 'A soma das divisões deve corresponder ao valor da compra.');
      const dates = invoiceDates(command.date, card.closingDay, card.dueDay, command.cycle);
      let invoice = state.invoices.find(item => item.cardId === card.id && item.cycle === dates.cycle);
      if (!invoice) {
        invoice = { ...meta(), cardId: card.id, ...dates }; state.invoices.push(invoice);
      } else ensure(invoice.closingDate >= command.date, 'A fatura fecha antes da compra.');
      addOperation('purchase', command.date, command.description);
      const purchase = { ...meta(), operationId: command.key, invoiceId: invoice.id, amount: command.amount, ...(command.buyerId ? { buyerId: command.buyerId } : {}) };
      state.purchases.push(purchase); resultId = purchase.id;
      for (const inputSplit of command.splits) {
        if (inputSplit.categoryId) category(inputSplit.categoryId, 'expense');
        const split = { ...meta(), purchaseId: purchase.id, ...inputSplit };
        state.splits.push(split);
        if (split.personId) {
          record(state.people, split.personId, 'Pessoa');
          if (split.dueDate) ensure(split.dueDate >= command.date, 'Vencimento anterior à compra.');
          const receivable = { ...meta(), splitId: split.id, personId: split.personId, amount: split.amount, ...(split.dueDate ? { dueDate: split.dueDate } : {}) };
          state.receivables.push(receivable);
          entry('receivable', receivable.id, 'debit', split.amount);
        } else {
          ensure(split.categoryId, 'Informe a categoria da sua divisão.'); category(split.categoryId, 'expense');
          entry('expense', split.categoryId, 'debit', split.amount, split.categoryId);
        }
      }
      let installmentCycle = invoice.cycle;
      for (const [index, amount] of allocate(command.amount, command.installmentCount ?? 1).entries()) {
        let target = state.invoices.find(item => item.cardId === card.id && item.cycle === installmentCycle);
        if (!target) { target = { ...meta(), cardId: card.id, ...invoiceDates(command.date, card.closingDay, card.dueDay, installmentCycle) }; state.invoices.push(target); }
        state.installments.push({ ...meta(), purchaseId: purchase.id, invoiceId: target.id, index: index + 1, amount });
        entry('card', target.id, 'credit', amount);
        if (index + 1 < (command.installmentCount ?? 1)) installmentCycle = nextMonth(installmentCycle);
      }
      break;
    }
    case 'reimbursement': {
      account(command.accountId);
      const receivable = record(state.receivables, command.receivableId, 'Recebível');
      const split = record(state.splits, receivable.splitId, 'Divisão');
      const purchase = record(state.purchases, split.purchaseId, 'Compra');
      const original = record(state.operations, purchase.operationId, 'Operação');
      ensure(command.date >= original.date, 'Reembolso anterior à compra.');
      ensure(command.amount <= balance(state, 'receivable', receivable.id), 'O reembolso excede o valor pendente.');
      addOperation('reimbursement', command.date, command.description);
      entry('cash', command.accountId, 'debit', command.amount);
      entry('receivable', receivable.id, 'credit', command.amount); break;
    }
    case 'invoicePayment': {
      account(command.accountId); record(state.invoices, command.invoiceId, 'Fatura');
      const atDate = { ...state, entries: state.entries.filter(item => state.operations.some(op => op.id === item.operationId && op.date <= command.date)) };
      ensure(command.amount <= balance(state, 'card', command.invoiceId) && command.amount <= balance(atDate, 'card', command.invoiceId), 'O pagamento excede a fatura pendente na data.');
      addOperation('invoicePayment', command.date, command.description);
      entry('card', command.invoiceId, 'debit', command.amount);
      entry('cash', command.accountId, 'credit', command.amount); break;
    }
    case 'settleContribution': {
      const contribution = record(state.contributions, command.contributionId, 'Contribuição');
      ensure(['suggested', 'reserved'].includes(contribution.status), 'Contribuição já encerrada.');
      const income = record(state.operations, contribution.incomeId, 'Receita');
      ensure(command.date >= income.date, 'Liquidação anterior à receita.');
      if (command.action === 'cancel') {
        contribution.status = 'cancelled'; resultId = contribution.id;
      } else {
        ensure(command.categoryId, 'Informe uma categoria de contribuição.');
        category(command.categoryId, 'expense');
        addOperation('contributionPayment', command.date, 'Pagamento de contribuição');
        entry('expense', command.categoryId, 'debit', contribution.amount, command.categoryId);
        entry('cash', contribution.accountId, 'credit', contribution.amount);
        contribution.status = 'paid'; contribution.paymentId = command.key;
      }
      break;
    }
    default: resultId = advancedCommand(state, command, context, { op: addOperation, entry, income: postIncome, expense: postExpense, contributions: contribute });
  }
  state.receipts.push({ ...namedMeta(command.key), payload, resultId });
  assertState(state);
  return { state, resultId, replayed: false };
}

export type { Command };
