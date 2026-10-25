import { cloudMode } from '../../config/deployment';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Plus, ShieldCheck } from 'lucide-react';
import type { State } from '../../domain/model';
import { agendaItems, agendaCounts } from '../../application/agenda';
import { useToday } from './use-today';
import { dashboardData } from '../../application/dashboard';
import { displayDate, formatMoney } from '../../application/finance-view';
import { FinanceData } from './FinanceData';
import { today } from './finance-fields';
import styles from './Finance.module.css';

export function HomeDashboard({ children, onNavigate }: { children: ReactNode; onNavigate: (page: string) => void }) {
  return <FinanceData>{state => !state.accounts.length && !state.operations.length ? children : <Dashboard state={state} onNavigate={onNavigate} />}</FinanceData>;
}
function Dashboard({ state, onNavigate }: { state: State; onNavigate: (page: string) => void }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const reference = useToday();
  const pending = useMemo(() => agendaCounts(agendaItems(state, reference)), [state, reference]);
  const data = dashboardData(state, month);
  const values = data.trend.flatMap(item => [item.income, item.expenses]);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const y = (value: number) => 185 - (value - min) / Math.max(1, max - min) * 140;
  const categoryMax = Math.max(1, ...data.categories.map(item => Math.abs(item.amount)));
  const points = (key: 'income' | 'expenses') => data.trend.map((item, index) => `${40 + index * 100},${y(item[key])}`).join(' ');
  return <div className={styles.workspace}>
    <div className={styles.toolbar}><p className={styles.muted}><ShieldCheck size={14} /> {cloudMode ? 'Seus registros da conta, consultados na nuvem.' : 'Seus registros, com clareza. Tudo permanece neste navegador.'}</p><div className={styles.toolbarActions}><label className={styles.filterLabel}>Período analisado<input type="month" aria-label="Período do dashboard" required min="0002-01" value={month} onChange={event => { if (event.target.value && event.target.value >= '0002-01') setMonth(event.target.value); }} /></label><button className={styles.primary} onClick={() => onNavigate('movements')}><Plus size={15} />Registrar movimentação</button></div></div>
    <div className={`${styles.metrics} ${styles.fiveMetrics}`}>{[
      ['Saldo disponível', data.totals.available, 'Caixa atual menos reservas; faturas são mostradas separadamente.'],
      ['Receitas do período', data.totals.income, 'Valores efetivamente recebidos; sem transferências ou reembolsos.'],
      ['Despesas do período', data.totals.expenses, 'Consumo pessoal, incluindo compras no cartão; sem pagar a compra duas vezes.'],
      ['Faturas pendentes', data.totals.invoices, 'Obrigações atuais do cartão, incluindo parcelas futuras quando existentes.'],
      ['Dinheiro reservado', data.totals.reserved, 'Reservas próprias; não são uma nova despesa.'],
    ].map(([label, value, help]) => <div key={String(label)} title={String(help)}><span>{label}</span><strong>{formatMoney(Number(value))}</strong><small>{help}</small></div>)}</div>
    {pending.total > 0 && <section className={styles.accountCard} style={{ marginBottom: 20 }} aria-label="Resumo das pendências"><div className={styles.toolbar}><div><h2 className={styles.subheading}>O que precisa da sua atenção</h2><p className={styles.hint}>{pending.overdue} item(ns) com data ultrapassada · {pending.today} para hoje · {pending.undated} sem data. Inclui compromissos, entradas esperadas e metas de todos os meses; não soma esses valores como uma dívida única.</p></div><button className={styles.secondary} onClick={() => onNavigate('agenda')}>Ver agenda e pendências</button></div></section>}
    <div className={styles.gridTwo}><section className={styles.accountCard}><div className={styles.toolbar}><h3>Receitas e despesas</h3><span className={styles.muted}>Últimos 6 meses</span></div>
      {data.trend.every(item => item.income === 0 && item.expenses === 0) ? <p className={styles.hint}>Ainda não há receitas ou despesas nos meses selecionados.</p> : <><svg className={styles.chart} viewBox="0 0 580 230" role="img" aria-label="Evolução mensal de receitas e despesas; valores exatos na tabela abaixo"><line x1="30" y1={y(0)} x2="550" y2={y(0)} stroke="#ffffff19" /><line x1="30" y1="115" x2="550" y2="115" stroke="#ffffff09" /><polyline points={points('income')} fill="none" stroke="#b6ef86" strokeWidth="3" strokeLinejoin="round" /><polyline points={points('expenses')} fill="none" stroke="#d5a58b" strokeWidth="3" strokeLinejoin="round" />{data.trend.map((item, index) => <text key={item.month} x={40 + index * 100} y="214" textAnchor="middle" fill="#a7b59b" fontSize="11">{item.month.split('-').reverse().join('/')}</text>)}</svg><div className={styles.legend}><span><i className={styles.dot} />Receitas</span><span><i className={styles.dot} style={{ background: '#d5a58b' }} />Despesas</span></div></>}
      <details className={styles.hint}><summary>Ver valores mensais</summary><ul className={styles.detailList}>{data.trend.map(item => <li key={item.month}><span>{item.month.split('-').reverse().join('/')}</span><span>{formatMoney(item.income)} / {formatMoney(item.expenses)}</span></li>)}</ul></details>
    </section><section className={styles.accountCard}><h3>Despesas por categoria</h3>{data.categories.length ? data.categories.map(category => <div key={category.id}><div className={styles.detailLine}><span>{category.name}</span><strong>{formatMoney(category.amount)}</strong></div><div className={styles.bar}><span style={{ width: `${Math.abs(category.amount) / categoryMax * 100}%`, ...(category.amount < 0 ? { background: '#d5a58b' } : {}) }} /></div></div>) : <p className={styles.hint}>Nenhuma despesa pessoal neste período.</p>}</section></div>
    <div className={styles.gridTwo}><section className={styles.accountCard}><div className={styles.toolbar}><h3><CalendarDays size={17} /> Próximas faturas</h3><button className={styles.iconButton} aria-label="Ver cartões" onClick={() => onNavigate('cards')}><ArrowRight size={16} /></button></div>{data.invoices.length ? <ul className={styles.detailList}>{data.invoices.slice(0, 6).map(invoice => <li key={invoice.id}><span>{invoice.name}<small>{displayDate(invoice.dueDate)}{invoice.dueDate < today() ? ' · Vencida' : ''}</small></span><strong>{formatMoney(invoice.pending)}</strong></li>)}</ul> : <p className={styles.hint}>Nenhuma fatura pendente.</p>}</section><section className={styles.accountCard}><div className={styles.toolbar}><h3>Pessoas e valores a receber</h3><button className={styles.iconButton} aria-label="Ver recebíveis" onClick={() => onNavigate('people')}><ArrowRight size={16} /></button></div>{data.people.length ? <ul className={styles.detailList}>{data.people.map(person => <li key={person.id}><span>{person.name}</span><strong>{formatMoney(person.pending)}</strong></li>)}</ul> : <p className={styles.hint}>Nenhum valor pendente de terceiros.</p>}</section></div>
    {(data.totals.cardCredit > 0 || data.totals.personPayable > 0) && <p className={styles.notice}>Crédito no cartão: {formatMoney(data.totals.cardCredit)} (sem compor caixa). A devolver a pessoas: {formatMoney(data.totals.personPayable)} (não descontado do indicador disponível). Confira esses compromissos antes de gastar.</p>}
    {data.invoices.some(item => item.dueDate < today()) && <p className={styles.error}>Há faturas vencidas. Confira os pagamentos registrados antes de assumir novos compromissos.</p>}
    <p className={styles.hint}>Despesas e categorias mostram consumo líquido: devoluções podem deixar o período negativo. O período filtra receitas, despesas e categorias. Disponível, faturas e reservas representam o estado atual. Limite do cartão não compõe seu saldo.</p>
  </div>;
}
