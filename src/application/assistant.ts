import type { State } from '../domain/model';
import { balance, summary } from '../domain/queries';
import { parseBRL, sum } from '../domain/money';
import { dashboardData, monthRange } from './dashboard';
import { formatMoney } from './finance-view';
import { planningData } from './planning';
import { categoryPath } from '../domain/categories';

export interface AssistantAnswer { text: string; command?: Record<string, unknown> }
export interface AssistantProvider { answer(state: State, question: string, today: string): AssistantAnswer }
const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
function matchName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const matches = items.filter(item => normalize(item.name) === normalize(name));
  return matches.length === 1 ? matches[0] : undefined;
}
export const localAssistant: AssistantProvider = {
  answer(state, question, today) {
    const text = normalize(question), totals = summary(state), month = today.slice(0, 7);
    const expense = question.trim().match(/^(?:gastei|paguei)\s+(?:r\$\s*)?([\d.,]+)\s+em\s+(.+?)\s+na conta\s+(.+)$/i);
    const income = question.trim().match(/^recebi\s+(?:r\$\s*)?([\d.,]+)\s+de\s+(.+?)\s+na conta\s+(.+?)\s+categoria\s+(.+)$/i);
    if (expense || income) {
      const account = matchName(state.accounts.filter(item => !item.archived), expense ? expense[3] : income![3]);
      if (!account) return { text: 'Qual é o nome exato da conta? Há uma conta ausente ou mais de uma com esse nome. Use Contas e saldos para conferir.' };
      const kind = expense ? 'expense' : 'income';
      const categoryName = expense ? expense[2] : income![4];
      const activeCategories = state.categories.filter(item => item.kind === kind && !item.archived);
      const pathMatches = activeCategories.map(item => ({ ...item, name: categoryPath(state.categories, item.id) })).filter(item => normalize(item.name) === normalize(categoryName));
      const category = pathMatches.length === 1 ? pathMatches[0] : pathMatches.length === 0 ? matchName(activeCategories, categoryName) : undefined;
      if (!category) return { text: 'Qual categoria ativa devo usar? Informe seu nome exato; se houver nomes iguais, personalize-os antes de registrar.' };
      const source = income ? matchName(state.sources.filter(item => !item.archived), income[2]) : undefined;
      if (income && !source) return { text: 'Qual é a fonte exata da receita? Confira as fontes cadastradas em Categorias e fontes.' };
      let amount: number;
      try { amount = parseBRL((expense ?? income)![1]); if (amount <= 0) throw new Error(); }
      catch { return { text: 'Qual é o valor positivo em formato brasileiro? Exemplo: 12,50.' }; }
      return { text: `Prévia: ${kind === 'expense' ? 'despesa' : 'receita'} de ${formatMoney(amount)} em ${account.name}, categoria ${category.name}, na data ${today.split('-').reverse().join('/')}. Revise e confirme antes de salvar.`, command: { type: kind, amount, date: today, description: question.trim().slice(0, 120), accountId: account.id, categoryId: category.id, ...(source ? { sourceId: source.id } : {}) } };
    }
    if (text.includes('devolver')) return { text: `Há ${formatMoney(totals.personPayable)} a devolver a pessoas por compras estornadas. Isso é uma obrigação, sem nova despesa; confira cada compra em Pessoas e recebíveis.` };
    if (text.includes('pessoas') || text.includes('devem') || text.includes('receber')) return { text: `Terceiros devem ${formatMoney(sum([totals.receivables, balance(state, 'loanAsset')]))}: ${formatMoney(totals.receivables)} de compras compartilhadas e ${formatMoney(balance(state, 'loanAsset'))} de principal emprestado. Origem: lançamentos de recebíveis e empréstimos, menos pagamentos registrados. Isso não é dinheiro disponível em conta.` };
    if (text.includes('fatura') || text.includes('cartao')) return { text: `Há ${formatMoney(totals.invoices)} em faturas pendentes, incluindo parcelas futuras. Origem: compras no cartão menos pagamentos, devoluções e créditos aplicados. Há ${formatMoney(totals.cardCredit)} de crédito com o emissor, separado do dinheiro em conta. Confira as datas em Cartões e faturas; o limite do cartão não entra no saldo.` };
    if (text.includes('aument') || text.includes('mes passado')) {
      const [year, number] = month.split('-').map(Number); const previous = new Date(Date.UTC(year, number - 2, 1));
      const prev = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
      const before = dashboardData(state, prev), current = dashboardData(state, month);
      const increases = current.categories.map(item => ({ ...item, delta: item.amount - (before.categories.find(other => other.id === item.id)?.amount ?? 0) })).filter(item => item.delta > 0);
      return { text: increases.length ? `Aumentos no mês ${month}, comparando os registros com ${prev}:\n${increases.map(item => `${item.name}: +${formatMoney(item.delta)}`).join('\n')}\nO mês atual pode estar incompleto.` : 'Não encontrei aumento de despesas por categoria entre os dois meses nos registros disponíveis. O mês atual pode estar incompleto.' };
    }
    if (text.includes('assinatura') || text.includes('venc')) {
      const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 7); const end = date.toISOString().slice(0, 10);
      const due = state.forecasts.filter(item => !item.operationId && !item.cancelled && item.date >= today && item.date <= end);
      return { text: due.length ? `Previsões pendentes nos próximos 7 dias:\n${due.map(item => `${item.date.split('-').reverse().join('/')} · ${item.name}: ${formatMoney(item.amount)}`).join('\n')}\nOrigem: calendário de previsões; isso não confirma recebimento ou pagamento.` : 'Não há previsões pendentes registradas para os próximos 7 dias. Para assinaturas, gere as ocorrências do mês em Planejamento.' };
    }
    if (text.includes('patrimonio') || text.includes('investimento')) return { text: `Patrimônio líquido registrado: ${formatMoney(totals.netWorth)}. Cálculo: caixa + recebíveis + crédito no cartão + principal emprestado + investimentos − faturas − valores a devolver às pessoas − principal devido. Investimentos são valores manuais e podem estar defasados; avaliações não são receitas recebidas.` };
    const purchase = question.match(/posso.*?(?:r\$\s*)?(\d[\d.,]*)/i);
    if (purchase) {
      try { const amount = parseBRL(purchase[1]); const forecast = planningData(state, month); const remaining = sum([forecast.conservative, -amount]); return { text: `No cenário conservador registrado, uma compra à vista de ${formatMoney(amount)} deixaria ${formatMoney(remaining)} até o fim do mês. Origem: saldo livre de reservas menos faturas, dívidas, devoluções a pessoas e despesas previstas; não incluí receitas incertas. ${remaining < 0 ? 'Sugestão: revise o valor ou o prazo antes de assumir esse compromisso.' : 'Confira também despesas que ainda não registrou. Você decide se esse compromisso faz sentido.'}` }; } catch { return { text: 'Qual valor você quer simular? Use um valor como 150,00.' }; }
    }
    if (text.includes('disponivel') || text.includes('saldo') || text.includes('quanto tenho')) {
      const flows = summary(state, monthRange(month));
      return { text: `Você tem ${formatMoney(totals.available)} livres de reservas: caixa atual ${formatMoney(totals.cash)} menos reservas ${formatMoney(totals.reserved)}. Faturas de ${formatMoney(totals.invoices)} e valores a devolver às pessoas de ${formatMoney(totals.personPayable)} são mostrados separadamente e não foram descontadas deste indicador. Neste mês, receitas recebidas: ${formatMoney(flows.income)}; despesas pessoais: ${formatMoney(flows.expenses)}. Origem: lançamentos financeiros e reservas ativas.` };
    }
    return { text: 'Posso consultar saldo disponível, valores que pessoas devem, faturas, aumentos de despesas, vencimentos e patrimônio. Para lançar com prévia, use “gastei 12,50 em Alimentação na conta Nubank” ou “recebi 100,00 de Estágio na conta Nubank categoria Trabalho”. Uso nomes exatos dos seus cadastros; nenhuma informação é enviada para uma IA externa.' };
  },
};
