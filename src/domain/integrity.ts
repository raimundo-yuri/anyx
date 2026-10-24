import { FinanceError } from './errors';
import { isReversibleMovement, stateSchema, tableNames, type Entry, type State } from './model';
import { balance, reserved, reversalFor, summary } from './queries';
import { sum } from './money';
import { assertCategoryHierarchy } from './categories';

export function requireRecord<T extends { id: string }>(records: readonly T[], id: string, label: string): T {
  const record = records.find(item => item.id === id);
  if (!record) throw new FinanceError(`${label} não encontrado.`);
  return record;
}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new FinanceError(message);
}
/** Validate both data shapes and cross-table constraints before/after every unit of work. */
export function assertState(input: State): void {
  stateSchema.parse(input);
  assertCategoryHierarchy(input.categories);
  for (const table of tableNames) ensure(new Set(input[table].map(item => item.id)).size === input[table].length, `Identificador duplicado em ${table}.`);
  const reversedIds = new Set<string>();
  for (const operation of input.operations) {
    const entries = input.entries.filter(item => item.operationId === operation.id);
    ensure(entries.length >= 2, 'Operação sem lançamentos suficientes.');
    const signature = entries.map(item => `${item.ledger}:${item.side}`).sort().join(',');
    const signatures = {
      opening: ['cash:debit,equity:credit', 'cash:credit,equity:debit'],
      income: ['cash:debit,income:credit'], expense: ['cash:credit,expense:debit'],
      transfer: ['cash:credit,cash:debit'], reimbursement: ['cash:debit,receivable:credit'],
      invoicePayment: ['card:debit,cash:credit'], contributionPayment: ['cash:credit,expense:debit'],
      investmentDeposit: ['cash:credit,investment:debit'], investmentWithdrawal: ['cash:debit,investment:credit'],
      valuation: ['investment:debit,valuation:credit', 'investment:credit,valuation:debit'],
      loanLent: ['cash:credit,loanAsset:debit'], loanBorrowed: ['cash:debit,loanDebt:credit'],
    };
    if (operation.kind === 'reversal') {
      ensure(operation.relatedId, 'Estorno sem lançamento original.');
      const original = requireRecord(input.operations, operation.relatedId, 'Lançamento original');
      ensure(isReversibleMovement(original.kind), 'Tipo de lançamento incompatível com o estorno de correção.');
      ensure(!reversedIds.has(original.id), 'Lançamento estornado mais de uma vez.'); reversedIds.add(original.id);
      ensure(operation.date === original.date, 'O estorno de correção precisa preservar a data original.');
      const fingerprint = (item: Entry, reverse = false) => JSON.stringify([item.ledger, item.referenceId, reverse ? (item.side === 'debit' ? 'credit' : 'debit') : item.side, item.amount, item.categoryId ?? null]);
      const expected = input.entries.filter(item => item.operationId === original.id).map(item => fingerprint(item, true)).sort();
      ensure(JSON.stringify(entries.map(item => fingerprint(item)).sort()) === JSON.stringify(expected), 'Estorno incompatível com os lançamentos originais.');
    } else if (operation.kind === 'purchase') {
      ensure(entries.filter(item => item.ledger === 'card' && item.side === 'credit').length >= 1 &&
        entries.every(item => (item.ledger === 'card' && item.side === 'credit') ||
          (['expense', 'receivable'].includes(item.ledger) && item.side === 'debit')), 'Lançamento de compra inválido.');
    } else if (operation.kind === 'loanRepayment') {
      ensure(operation.relatedId, 'Empréstimo do pagamento ausente.');
      const loan = requireRecord(input.loans, operation.relatedId, 'Empréstimo');
      const allowed = loan.direction === 'lent' ? ['cash:debit', 'loanAsset:credit', 'income:credit'] : ['cash:credit', 'loanDebt:debit', 'expense:debit'];
      ensure(entries.every(item => allowed.includes(`${item.ledger}:${item.side}`)), 'Lançamento de pagamento de empréstimo inválido.');
      for (const entry of entries.filter(item => item.ledger === 'loanAsset' || item.ledger === 'loanDebt')) ensure(entry.referenceId === loan.id, 'Pagamento de outro empréstimo.');
    } else ensure(signatures[operation.kind].includes(signature), 'Lançamentos incompatíveis com a operação.');
    if (operation.kind === 'transfer') ensure(entries[0].referenceId !== entries[1].referenceId, 'Transferência para a mesma conta.');
    if (operation.kind === 'opening') ensure(entries[0].referenceId === entries[1].referenceId, 'Saldo inicial de contas diferentes.');
    ensure(input.receipts.some(item => item.id === operation.id), 'Operação sem registro de comando.');
    ensure(sum(entries.filter(item => item.side === 'debit').map(item => item.amount)) ===
      sum(entries.filter(item => item.side === 'credit').map(item => item.amount)), 'Operação desequilibrada.');
  }
  for (const entry of input.entries) {
    requireRecord(input.operations, entry.operationId, 'Operação');
    if (entry.ledger === 'cash' || entry.ledger === 'equity') {
      const account = requireRecord(input.accounts, entry.referenceId, 'Conta');
      ensure(requireRecord(input.operations, entry.operationId, 'Operação').date >= account.openedOn, 'Operação anterior à abertura da conta.');
    }
    if (entry.ledger === 'receivable') requireRecord(input.receivables, entry.referenceId, 'Recebível');
    if (entry.ledger === 'card') requireRecord(input.invoices, entry.referenceId, 'Fatura');
    if (entry.ledger === 'investment' || entry.ledger === 'valuation') requireRecord(input.investments, entry.referenceId, 'Investimento');
    if (entry.ledger === 'loanAsset' || entry.ledger === 'loanDebt') { const loan = requireRecord(input.loans, entry.referenceId, 'Empréstimo'); ensure((entry.ledger === 'loanAsset') === (loan.direction === 'lent'), 'Natureza de empréstimo inválida.'); }
    if (entry.ledger === 'income') requireRecord(input.sources, entry.referenceId, 'Fonte de receita');
    if (entry.ledger === 'expense') ensure(requireRecord(input.categories, entry.referenceId, 'Categoria').kind === 'expense', 'Categoria de despesa inválida.');
    if (entry.categoryId) {
      const category = requireRecord(input.categories, entry.categoryId, 'Categoria');
      ensure(category.kind === entry.ledger && (entry.ledger !== 'expense' || entry.referenceId === category.id), 'Categoria incompatível com o lançamento.');
    }
  }
  const cycles = new Set<string>();
  for (const invoice of input.invoices) {
    requireRecord(input.cards, invoice.cardId, 'Cartão');
    ensure(invoice.cycle === invoice.closingDate.slice(0, 7) && invoice.dueDate > invoice.closingDate, 'Ciclo de fatura inválido.');
    const key = `${invoice.cardId}:${invoice.cycle}`;
    ensure(!cycles.has(key), 'Ciclo de fatura duplicado.'); cycles.add(key);
    ensure(balance(input, 'card', invoice.id) >= 0, 'Pagamento de fatura excessivo.');
  }
  for (const purchase of input.purchases) {
    ensure(requireRecord(input.operations, purchase.operationId, 'Operação').kind === 'purchase', 'Operação da compra inválida.');
    requireRecord(input.invoices, purchase.invoiceId, 'Fatura');
    const splits = input.splits.filter(item => item.purchaseId === purchase.id);
    ensure(splits.length > 0 && sum(splits.map(item => item.amount)) === purchase.amount, 'Soma das divisões diferente da compra.');
    const entries = input.entries.filter(item => item.operationId === purchase.operationId);
    const installments = input.installments.filter(item => item.purchaseId === purchase.id).sort((a, b) => a.index - b.index);
    ensure(installments.length > 0 && sum(installments.map(item => item.amount)) === purchase.amount && installments[0].invoiceId === purchase.invoiceId, 'Parcelas incompatíveis com a compra.');
    ensure(installments.every((item, index) => item.index === index + 1), 'Índices de parcelas inválidos.');
    const credits = entries.filter(item => item.ledger === 'card').map(item => `${item.referenceId}:${item.amount}`).sort();
    ensure(JSON.stringify(credits) === JSON.stringify(installments.map(item => `${item.invoiceId}:${item.amount}`).sort()) && entries.length === splits.length + installments.length, 'Lançamentos incompatíveis com as parcelas.');
    if (purchase.buyerId) requireRecord(input.people, purchase.buyerId, 'Comprador');
    const expected = splits.map(split => split.personId ?
      `receivable:${input.receivables.find(item => item.splitId === split.id)?.id}:${split.amount}` :
      `expense:${split.categoryId}:${split.amount}`).sort();
    const actual = entries.filter(item => item.side === 'debit').map(item => `${item.ledger}:${item.referenceId}:${item.amount}`).sort();
    ensure(JSON.stringify(expected) === JSON.stringify(actual), 'Lançamentos incompatíveis com as divisões.');
  }
  for (const split of input.splits) {
    requireRecord(input.purchases, split.purchaseId, 'Compra');
    if (split.personId) requireRecord(input.people, split.personId, 'Pessoa');
    else ensure(split.categoryId, 'A divisão pessoal precisa de categoria.');
    if (split.categoryId) ensure(requireRecord(input.categories, split.categoryId, 'Categoria').kind === 'expense', 'Categoria de despesa inválida.');
    const receivables = input.receivables.filter(item => item.splitId === split.id);
    ensure(split.personId ? receivables.length === 1 : receivables.length === 0, 'Recebível incompatível com a divisão.');
  }
  for (const receivable of input.receivables) {
    const split = requireRecord(input.splits, receivable.splitId, 'Divisão');
    ensure(split.personId === receivable.personId && split.amount === receivable.amount && split.dueDate === receivable.dueDate, 'Recebível incompatível com a divisão.');
    const pending = balance(input, 'receivable', receivable.id);
    ensure(pending >= 0 && pending <= receivable.amount, 'Saldo do recebível inválido.');
  }
  for (const rule of input.rules) {
    ensure(new Set(rule.sourceIds).size === rule.sourceIds.length, 'Fonte de receita duplicada.');
    for (const sourceId of rule.sourceIds) requireRecord(input.sources, sourceId, 'Fonte de receita');
  }
  const contributionKeys = new Set<string>();
  for (const contribution of input.contributions) {
    if (reversalFor(input, contribution.incomeId)) ensure(['paid', 'cancelled'].includes(contribution.status), 'Contribuição pendente vinculada a receita estornada.');
    if (contribution.cancelledById) {
      const reversal = requireRecord(input.operations, contribution.cancelledById, 'Estorno da contribuição');
      ensure(contribution.status === 'cancelled' && reversal.kind === 'reversal' && reversal.relatedId === contribution.incomeId, 'Cancelamento de contribuição incompatível com o estorno.');
    }
    ensure(requireRecord(input.operations, contribution.incomeId, 'Receita').kind === 'income' || (requireRecord(input.operations, contribution.incomeId, 'Receita').kind === 'loanRepayment' && input.entries.some(entry => entry.operationId === contribution.incomeId && entry.ledger === 'income')), 'Base de contribuição inválida.');
    requireRecord(input.rules, contribution.ruleId, 'Regra');
    requireRecord(input.accounts, contribution.accountId, 'Conta');
    const key = `${contribution.incomeId}:${contribution.ruleId}`;
    ensure(!contributionKeys.has(key), 'Contribuição duplicada.'); contributionKeys.add(key);
    const holds = input.reserves.filter(item => item.contributionId === contribution.id);
    ensure(holds.length <= 1 && (contribution.status !== 'reserved' || holds.length === 1), 'Reserva de contribuição inválida.');
    ensure((contribution.status === 'paid') === !!contribution.paymentId, 'Pagamento de contribuição inválido.');
    if (contribution.paymentId) ensure(requireRecord(input.operations, contribution.paymentId, 'Pagamento').kind === 'contributionPayment', 'Operação de contribuição inválida.');
  }
  for (const reserve of input.reserves) {
    requireRecord(input.accounts, reserve.accountId, 'Conta');
    ensure(!!reserve.contributionId !== !!reserve.goalId, 'Finalidade de reserva inválida.');
    if (reserve.contributionId) {
      const contribution = requireRecord(input.contributions, reserve.contributionId, 'Contribuição');
      ensure(contribution.accountId === reserve.accountId && contribution.amount === reserve.amount, 'Reserva incompatível com a contribuição.');
    } else {
      const goal = requireRecord(input.goals, reserve.goalId!, 'Meta');
      ensure(reserve.accountId === goal.accountId && reserve.amount <= goal.target, 'Reserva incompatível com a meta.');
      ensure(input.reserves.filter(item => item.goalId === goal.id).length === 1, 'Reserva de meta duplicada.');
    }
  }
  for (const account of input.accounts) {
    const hold = reserved(input, account.id);
    if (hold > 0) ensure(balance(input, 'cash', account.id) >= hold, 'Operação consumiria dinheiro reservado.');
  }
  for (const installment of input.installments) {
    const purchase = requireRecord(input.purchases, installment.purchaseId, 'Compra');
    const invoice = requireRecord(input.invoices, installment.invoiceId, 'Fatura');
    ensure(invoice.cardId === requireRecord(input.invoices, purchase.invoiceId, 'Fatura').cardId, 'Parcela em cartão diferente.');
  }
  for (const item of input.goals) requireRecord(input.accounts, item.accountId, 'Conta da meta');
  const budgetKeys = new Set<string>();
  for (const item of input.budgets) {
    ensure(requireRecord(input.categories, item.categoryId, 'Categoria').kind === 'expense', 'Categoria de orçamento inválida.');
    const key = `${item.categoryId}:${item.month}`; ensure(!budgetKeys.has(key), 'Orçamento duplicado.'); budgetKeys.add(key);
  }
  const recurrenceKeys = new Set<string>();
  for (const item of [...input.forecasts, ...input.recurrings]) {
    requireRecord(input.accounts, item.accountId, 'Conta de previsão');
    ensure(requireRecord(input.categories, item.categoryId, 'Categoria').kind === item.kind, 'Natureza de previsão inválida.');
    if (item.kind === 'income') { ensure(item.sourceId, 'Fonte da previsão ausente.'); requireRecord(input.sources, item.sourceId, 'Fonte'); }
    if ('recurringId' in item && item.recurringId) {
      requireRecord(input.recurrings, item.recurringId, 'Recorrência');
      const key = `${item.recurringId}:${item.date.slice(0, 7)}`; ensure(!recurrenceKeys.has(key), 'Previsão recorrente duplicada.'); recurrenceKeys.add(key);
    }
    if ('operationId' in item && item.operationId) ensure(requireRecord(input.operations, item.operationId, 'Operação prevista').kind === item.kind && !item.cancelled, 'Liquidação de previsão inválida.');
  }
  for (const item of input.loans) {
    requireRecord(input.people, item.personId, 'Pessoa');
    ensure(item.dueDate >= item.date, 'Vencimento de empréstimo inválido.');
    const operation = requireRecord(input.operations, item.operationId, 'Empréstimo');
    ensure(operation.kind === (item.direction === 'lent' ? 'loanLent' : 'loanBorrowed'), 'Operação de empréstimo inválida.');
    const ledger = item.direction === 'lent' ? 'loanAsset' : 'loanDebt';
    const opening = input.entries.filter(entry => entry.operationId === operation.id && entry.ledger === ledger && entry.referenceId === item.id);
    ensure(opening.length === 1 && opening[0].amount === item.principal && operation.date === item.date, 'Principal de empréstimo inconsistente.');
  }
  for (const id of new Set(input.receivableSchedules.map(item => item.receivableId))) {
    const receivable = requireRecord(input.receivables, id, 'Recebível');
    const plan = input.receivableSchedules.filter(item => item.receivableId === id).sort((a, b) => a.index - b.index);
    ensure(sum(plan.map(item => item.amount)) === receivable.amount && plan.every((item, index) => item.index === index + 1), 'Plano de reembolso inválido.');
  }
  // A backdated payment must not create an overpayment between two later purchases.
  const dates = new Map(input.operations.map(item => [item.id, item.date]));
  for (const ledger of ['card', 'receivable', 'investment', 'loanAsset', 'loanDebt'] as const) {
    for (const referenceId of new Set(input.entries.filter(item => item.ledger === ledger).map(item => item.referenceId))) {
      const daily = new Map<string, number[]>();
      for (const entry of input.entries.filter(item => item.ledger === ledger && item.referenceId === referenceId)) {
        const date = dates.get(entry.operationId)!;
        const amount = entry.amount * (entry.side === (['card', 'loanDebt'].includes(ledger) ? 'credit' : 'debit') ? 1 : -1);
        daily.set(date, [...(daily.get(date) ?? []), amount]);
      }
      let pending = 0;
      for (const date of [...daily.keys()].sort()) {
        pending = sum([pending, sum(daily.get(date)!)]);
        ensure(pending >= 0, 'Pagamento retroativo excederia o saldo pendente no histórico.');
      }
    }
  }
  summary(input); // Aggregate values must also remain within safe integer bounds.
  for (const receipt of input.receipts) ensure(tableNames.some(table => table !== 'receipts' && input[table].some(item => item.id === receipt.resultId)), 'Resultado idempotente ausente.');
}
