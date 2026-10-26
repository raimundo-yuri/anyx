import type { Command, Entry, State } from './model.js';
import type { Context } from './engine.js';
import { ensure, requireRecord } from './integrity.js';
import { balance } from './queries.js';
import { allocate, sum } from './money.js';
import { daysInMonth, nextMonth } from './dates.js';

type Income = { accountId: string; categoryId: string; sourceId: string; amount: number; date: string; description: string };
export interface Posting {
  op: (kind: State['operations'][number]['kind'], date: string, description: string, relatedId?: string) => void;
  entry: (ledger: Entry['ledger'], id: string, side: Entry['side'], amount: number, categoryId?: string) => void;
  income: (data: Income) => void; expense: (data: Omit<Income, 'sourceId'>) => void;
  contributions: (data: Pick<Income, 'accountId' | 'sourceId' | 'amount'>) => void;
}
export function advancedCommand(state: State, command: Command, context: Context, p: Posting): string {
  const meta = (id = context.newId()) => ({ id, createdAt: context.now });
  const get = requireRecord;
  function account(id: string) { const record = get(state.accounts, id, 'Conta'); ensure(!record.archived, 'Conta arquivada.'); return record; }
  function category(id: string, kind: 'income' | 'expense') { const record = get(state.categories, id, 'Categoria'); ensure(!record.archived && record.kind === kind, 'Categoria incompatível ou arquivada.'); }
  function forecastLinks(data: { accountId: string; categoryId: string; sourceId?: string; kind: 'income' | 'expense' }) {
    account(data.accountId); category(data.categoryId, data.kind);
    if (data.kind === 'income') { ensure(data.sourceId, 'Escolha a fonte da receita prevista.'); ensure(!get(state.sources, data.sourceId, 'Fonte').archived, 'Fonte arquivada.'); }
  }
  switch (command.type) {
    case 'createGoal':
      account(command.accountId); state.goals.push({ ...meta(command.id), name: command.name, accountId: command.accountId, target: command.target, deadline: command.deadline }); return command.id;
    case 'fundGoal': {
      const goal = get(state.goals, command.id, 'Meta'); account(goal.accountId); ensure(command.amount <= goal.target, 'A reserva não pode ultrapassar o alvo da meta.');
      const reserve = state.reserves.find(item => item.goalId === goal.id);
      if (reserve) reserve.amount = command.amount;
      else state.reserves.push({ ...meta(), goalId: goal.id, accountId: goal.accountId, amount: command.amount });
      return goal.id;
    }
    case 'setBudget': {
      category(command.categoryId, 'expense'); const existing = state.budgets.find(item => item.categoryId === command.categoryId && item.month === command.month);
      if (existing) { existing.amount = command.amount; return existing.id; }
      state.budgets.push({ ...meta(command.id), categoryId: command.categoryId, month: command.month, amount: command.amount }); return command.id;
    }
    case 'createForecast':
      forecastLinks(command); state.forecasts.push({ ...meta(command.id), name: command.name, kind: command.kind, accountId: command.accountId, categoryId: command.categoryId, ...(command.sourceId ? { sourceId: command.sourceId } : {}), amount: command.amount, date: command.date }); return command.id;
    case 'settleForecast': {
      const item = get(state.forecasts, command.id, 'Previsão'); ensure(!item.cancelled && !item.operationId, 'Previsão já encerrada.');
      if (command.action === 'cancel') { item.cancelled = true; return item.id; }
      const data = { accountId: item.accountId, categoryId: item.categoryId, amount: item.amount, date: command.date, description: item.name };
      if (item.kind === 'income') { ensure(item.sourceId, 'Fonte ausente.'); p.income({ ...data, sourceId: item.sourceId }); }
      else p.expense(data);
      item.operationId = command.key; return command.key;
    }
    case 'createRecurring':
      forecastLinks(command); state.recurrings.push({ ...meta(command.id), name: command.name, kind: command.kind, accountId: command.accountId, categoryId: command.categoryId, ...(command.sourceId ? { sourceId: command.sourceId } : {}), amount: command.amount, day: command.day, active: command.active }); return command.id;
    case 'toggleRecurring': {
      const item = get(state.recurrings, command.id, 'Recorrência'); item.active = command.active; return item.id;
    }
    case 'generateForecasts': {
      const recurring = state.recurrings.filter(item => item.active); ensure(recurring.length, 'Nenhuma recorrência ativa.');
      const [year, month] = command.month.split('-').map(Number);
      for (const item of recurring) {
        if (state.forecasts.some(forecast => forecast.recurringId === item.id && forecast.date.startsWith(command.month))) continue;
        const date = `${command.month}-${String(Math.min(item.day, daysInMonth(year, month))).padStart(2, '0')}`;
        state.forecasts.push({ ...meta(), name: item.name, kind: item.kind, accountId: item.accountId, categoryId: item.categoryId, ...(item.sourceId ? { sourceId: item.sourceId } : {}), amount: item.amount, date, recurringId: item.id });
      }
      return recurring[0].id;
    }
    case 'createInvestment':
      state.investments.push({ ...meta(command.id), name: command.name }); return command.id;
    case 'investmentFlow': {
      get(state.investments, command.investmentId, 'Investimento'); account(command.accountId);
      if (command.direction === 'withdraw') ensure(command.amount <= balance(state, 'investment', command.investmentId), 'Resgate maior que o valor contábil do investimento.');
      p.op(command.direction === 'deposit' ? 'investmentDeposit' : 'investmentWithdrawal', command.date, command.description);
      p.entry('investment', command.investmentId, command.direction === 'deposit' ? 'debit' : 'credit', command.amount);
      p.entry('cash', command.accountId, command.direction === 'deposit' ? 'credit' : 'debit', command.amount); return command.key;
    }
    case 'valueInvestment': {
      const item = get(state.investments, command.investmentId, 'Investimento');
      const dates = state.entries.filter(entry => entry.ledger === 'investment' && entry.referenceId === item.id).map(entry => get(state.operations, entry.operationId, 'Operação').date);
      ensure(dates.every(date => date <= command.date), 'Atualize o valor em data igual ou posterior ao último movimento do investimento.');
      const delta = command.value - balance(state, 'investment', item.id); item.lastValuedOn = command.date;
      if (delta === 0) return item.id;
      p.op('valuation', command.date, `Avaliação: ${item.name}`);
      p.entry('investment', item.id, delta > 0 ? 'debit' : 'credit', Math.abs(delta));
      p.entry('valuation', item.id, delta > 0 ? 'credit' : 'debit', Math.abs(delta)); return command.key;
    }
    case 'createLoan': {
      account(command.accountId); get(state.people, command.personId, 'Pessoa'); ensure(command.dueDate >= command.date, 'Vencimento anterior ao empréstimo.');
      p.op(command.direction === 'lent' ? 'loanLent' : 'loanBorrowed', command.date, command.description);
      state.loans.push({ ...meta(command.id), name: command.description, personId: command.personId, direction: command.direction, principal: command.amount, date: command.date, dueDate: command.dueDate, operationId: command.key });
      p.entry(command.direction === 'lent' ? 'loanAsset' : 'loanDebt', command.id, command.direction === 'lent' ? 'debit' : 'credit', command.amount);
      p.entry('cash', command.accountId, command.direction === 'lent' ? 'credit' : 'debit', command.amount); return command.id;
    }
    case 'repayLoan': {
      const loan = get(state.loans, command.id, 'Empréstimo'); account(command.accountId); ensure(command.date >= loan.date, 'Pagamento anterior ao empréstimo.');
      const ledger = loan.direction === 'lent' ? 'loanAsset' : 'loanDebt';
      ensure(command.principalAmount <= balance(state, ledger, loan.id), 'Principal maior que o saldo devedor.');
      const amount = sum([command.principalAmount, command.interestAmount]); ensure(amount > 0, 'Informe principal ou juros pagos.');
      if (command.interestAmount > 0) {
        ensure(command.categoryId, 'Escolha a categoria dos juros.'); category(command.categoryId, loan.direction === 'lent' ? 'income' : 'expense');
        if (loan.direction === 'lent') { ensure(command.sourceId, 'Escolha a fonte dos juros.'); ensure(!get(state.sources, command.sourceId, 'Fonte').archived, 'Fonte arquivada.'); }
      }
      p.op('loanRepayment', command.date, `Pagamento: ${loan.name}`, loan.id);
      if (command.principalAmount > 0) p.entry(ledger, loan.id, loan.direction === 'lent' ? 'credit' : 'debit', command.principalAmount);
      p.entry('cash', command.accountId, loan.direction === 'lent' ? 'debit' : 'credit', amount);
      if (command.interestAmount > 0) {
        p.entry(loan.direction === 'lent' ? 'income' : 'expense', loan.direction === 'lent' ? command.sourceId! : command.categoryId!, loan.direction === 'lent' ? 'credit' : 'debit', command.interestAmount, command.categoryId);
        if (loan.direction === 'lent') p.contributions({ accountId: command.accountId, sourceId: command.sourceId!, amount: command.interestAmount });
      }
      return command.key;
    }
    case 'scheduleReceivable': {
      const item = get(state.receivables, command.receivableId, 'Recebível');
      ensure(!state.receivableSchedules.some(schedule => schedule.receivableId === item.id), 'Este recebível já possui um plano.');
      ensure(balance(state, 'receivable', item.id) === item.amount, 'Crie o plano antes de registrar reembolsos.');
      const split = get(state.splits, item.splitId, 'Divisão'), purchase = get(state.purchases, split.purchaseId, 'Compra');
      ensure(command.firstDueDate >= get(state.operations, purchase.operationId, 'Compra').date, 'Vencimento anterior à compra.');
      let cycle = command.firstDueDate.slice(0, 7); const day = Number(command.firstDueDate.slice(8));
      for (const [index, amount] of allocate(item.amount, command.count).entries()) {
        const [year, month] = cycle.split('-').map(Number);
        state.receivableSchedules.push({ ...meta(), receivableId: item.id, index: index + 1, amount, dueDate: `${cycle}-${String(Math.min(day, daysInMonth(year, month))).padStart(2, '0')}` }); cycle = nextMonth(cycle);
      }
      return item.id;
    }
    default: throw new Error('Comando não tratado.');
  }
}
