import type { State } from '../domain/model';
import { balance, receivablePlan } from '../domain/queries';
import { sum } from '../domain/money';
import { validDate, daysInMonth } from '../domain/dates';
import { FinanceError } from '../domain/errors';
import { monthRange } from './dashboard';

export const agendaKinds = {
  invoice: 'Faturas', forecastExpense: 'Despesas previstas', forecastIncome: 'Receitas previstas',
  receivable: 'Reembolsos de pessoas', loanDebt: 'Empréstimos a pagar', loanAsset: 'Empréstimos a receber',
  personPayable: 'Dinheiro a devolver', goal: 'Metas', contribution: 'Contribuições',
} as const;
export type AgendaKind = keyof typeof agendaKinds;
export type AgendaStatus = 'overdue' | 'today' | 'upcoming' | 'undated';
export const agendaStatuses: Record<AgendaStatus, string> = { overdue: 'Data ultrapassada', today: 'Hoje', upcoming: 'Próximos', undated: 'Sem data' };
export interface AgendaItem {
  id: string; kind: AgendaKind; title: string; detail: string; date: string | null; amount: number;
  flow: 'outgoing' | 'incoming' | 'goal' | 'decision'; status: AgendaStatus;
  page: 'cards' | 'planning' | 'people' | 'loans' | 'contributions';
}
export interface AgendaFilters { month?: string; date?: string; kind?: AgendaKind; status?: AgendaStatus; query?: string }

/** Current pending balances on their promised dates, never an as-of accounting snapshot. */
export function agendaItems(state: State, today: string): AgendaItem[] {
  if (!validDate(today)) throw new FinanceError('Data de referência inválida.');
  const items: AgendaItem[] = [];
  const add = (item: Omit<AgendaItem, 'status'>) => {
    if (item.amount <= 0) return;
    const status = item.date === null ? 'undated' : item.date < today ? 'overdue' : item.date === today ? 'today' : 'upcoming';
    items.push({ ...item, status });
  };
  const operations = new Map(state.operations.map(item => [item.id, item]));
  const people = new Map(state.people.map(item => [item.id, item.name]));
  for (const invoice of state.invoices) add({
    id: `invoice-${invoice.id}`, kind: 'invoice', title: `Fatura · ${state.cards.find(item => item.id === invoice.cardId)!.name}`,
    detail: `Ciclo ${invoice.cycle} · obrigação pendente, sem nova despesa ao pagar.`, date: invoice.dueDate,
    amount: balance(state, 'card', invoice.id), flow: 'outgoing', page: 'cards',
  });
  for (const forecast of state.forecasts.filter(item => !item.cancelled && !item.operationId)) add({
    id: `forecast-${forecast.id}`, kind: forecast.kind === 'income' ? 'forecastIncome' : 'forecastExpense', title: forecast.name,
    detail: `${forecast.kind === 'income' ? 'Recebimento' : 'Pagamento'} previsto · ${state.accounts.find(item => item.id === forecast.accountId)!.name}. Ainda não realizado.`,
    date: forecast.date, amount: forecast.amount, flow: forecast.kind === 'income' ? 'incoming' : 'outgoing', page: 'planning',
  });
  for (const receivable of state.receivables) {
    const split = state.splits.find(item => item.id === receivable.splitId)!;
    const purchase = state.purchases.find(item => item.id === split.purchaseId)!;
    const title = `${people.get(receivable.personId)} · ${operations.get(purchase.operationId)!.description}`;
    const plan = receivablePlan(state, receivable.id);
    if (plan.length) for (const part of plan) add({
      id: `receivablePart-${part.id}`, kind: 'receivable', title, detail: `Parcela prometida ${part.index}/${plan.length} · somente o restante a receber; sem renda nova.`,
      date: part.dueDate, amount: part.pending, flow: 'incoming', page: 'people',
    });
    else add({ id: `receivable-${receivable.id}`, kind: 'receivable', title, detail: 'Reembolso pendente da compra, sem renda nova.', date: receivable.dueDate ?? null, amount: balance(state, 'receivable', receivable.id), flow: 'incoming', page: 'people' });
    add({ id: `personPayable-${receivable.id}`, kind: 'personPayable', title: `Devolver a ${people.get(receivable.personId)}`, detail: `Compra: ${operations.get(purchase.operationId)!.description}. Excesso já recebido após devolução comercial; sem prazo prometido cadastrado.`, date: null, amount: balance(state, 'personPayable', receivable.id), flow: 'outgoing', page: 'people' });
  }
  for (const loan of state.loans) add({
    id: `loan-${loan.id}`, kind: loan.direction === 'borrowed' ? 'loanDebt' : 'loanAsset', title: loan.name,
    detail: `${people.get(loan.personId)} · principal ${loan.direction === 'borrowed' ? 'a pagar' : 'a receber'}, sem estimar juros.`,
    date: loan.dueDate, amount: balance(state, loan.direction === 'borrowed' ? 'loanDebt' : 'loanAsset', loan.id), flow: loan.direction === 'borrowed' ? 'outgoing' : 'incoming', page: 'loans',
  });
  for (const goal of state.goals) add({
    id: `goal-${goal.id}`, kind: 'goal', title: goal.name, detail: 'Valor que falta reservar para a meta; não é despesa nem obrigação de pagamento.',
    date: goal.deadline, amount: sum([goal.target, -sum(state.reserves.filter(item => item.goalId === goal.id).map(item => item.amount))]), flow: 'goal', page: 'planning',
  });
  for (const contribution of state.contributions.filter(item => item.status === 'suggested' || item.status === 'reserved')) add({
    id: `contribution-${contribution.id}`, kind: 'contribution', title: state.rules.find(item => item.id === contribution.ruleId)!.name,
    detail: `${contribution.status === 'reserved' ? 'Valor já reservado' : 'Somente sugestão, sem reserva'} · receita: ${operations.get(contribution.incomeId)!.description}. Sem vencimento cadastrado.`,
    date: null, amount: contribution.amount, flow: 'decision', page: 'contributions',
  });
  return items.sort((a, b) => (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99') || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

export function filterAgenda(items: readonly AgendaItem[], filters: AgendaFilters): AgendaItem[] {
  if (filters.month) monthRange(filters.month);
  if (filters.date && !validDate(filters.date)) throw new FinanceError('Dia da agenda inválido.');
  const query = (filters.query ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  return items.filter(item => (!filters.month || item.date === null || item.date.startsWith(filters.month)) &&
    (!filters.date || item.date === filters.date) && (!filters.kind || item.kind === filters.kind) && (!filters.status || item.status === filters.status) &&
    `${item.title} ${item.detail} ${agendaKinds[item.kind]}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(query));
}

export function agendaCounts(items: readonly AgendaItem[]) {
  return { total: items.length, overdue: items.filter(item => item.status === 'overdue').length, today: items.filter(item => item.status === 'today').length, undated: items.filter(item => item.status === 'undated').length };
}

/** Monday-first grid, without timezone shifts or synthetic events on empty days. */
export function agendaMonth(month: string) {
  monthRange(month);
  const [year, number] = month.split('-').map(Number);
  const first = new Date(`${month}-01T12:00:00Z`), offset = (first.getUTCDay() + 6) % 7;
  const days = daysInMonth(year, number), length = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length }, (_, index) => index < offset || index >= offset + days ? null : `${month}-${String(index - offset + 1).padStart(2, '0')}`);
}
