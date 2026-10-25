import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Download, ListChecks } from 'lucide-react';
import type { State } from '../../domain/model';
import { agendaCounts, agendaItems, agendaKinds, agendaMonth, agendaStatuses, filterAgenda, type AgendaKind, type AgendaStatus } from '../../application/agenda';
import { displayDate, formatMoney } from '../../application/finance-view';
import { userError } from '../../application/user-error';
import { repository } from '../../infrastructure/repository';
import { exportCalendar } from '../../portability/calendar';
import { downloadFile } from '../../portability/download';
import { FinanceData } from './FinanceData';
import { today } from './finance-fields';
import { useToday } from './use-today';
import styles from './Finance.module.css';
import agendaStyles from './Agenda.module.css';

const pageLabels = { cards: 'Cartões e faturas', people: 'Pessoas e recebíveis', loans: 'Dívidas e empréstimos', planning: 'Planejamento e metas', contributions: 'Contribuições' };
const flowLabels = { outgoing: 'A pagar / devolver', incoming: 'A receber, sem garantia', goal: 'Meta de reserva', decision: 'Contribuição a decidir' };
const weekdays = [['Seg', 'Segunda-feira'], ['Ter', 'Terça-feira'], ['Qua', 'Quarta-feira'], ['Qui', 'Quinta-feira'], ['Sex', 'Sexta-feira'], ['Sáb', 'Sábado'], ['Dom', 'Domingo']];
const pageSize = 20;
export function Agenda({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <FinanceData>{state => <AgendaContent state={state} onNavigate={onNavigate} />}</FinanceData>;
}
function AgendaContent({ state, onNavigate }: { state: State; onNavigate: (page: string) => void }) {
  const reference = useToday();
  const [mode, setMode] = useState<'pending' | 'month'>('pending'), [month, setMonth] = useState(() => reference.slice(0, 7));
  const [day, setDay] = useState(''), [kind, setKind] = useState<AgendaKind | ''>(''), [status, setStatus] = useState<AgendaStatus | ''>('');
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [reminder, setReminder] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const items = useMemo(() => agendaItems(state, reference), [state, reference]);
  const counts = agendaCounts(items);
  const filters = { ...(mode === 'month' ? { month, ...(day ? { date: day } : {}) } : {}), ...(kind ? { kind } : {}), ...(status ? { status } : {}), query };
  const visible = filterAgenda(items, filters), dated = visible.filter(item => item.date !== null);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize)), index = Math.min(page, pageCount - 1);
  const gridItems = filterAgenda(items, { ...filters, month, date: undefined });
  const byDay = new Map<string, number>();
  for (const item of gridItems) if (item.date) byDay.set(item.date, (byDay.get(item.date) ?? 0) + 1);
  function change(work: () => void) { work(); setPage(0); setError(''); setNotice(''); }
  function chooseStatus(next: AgendaStatus | '') {
    change(() => { setMode('pending'); setDay(''); setKind(''); setQuery(''); setStatus(next); });
  }
  async function download() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const reference = today(), current = await repository.read();
      const selection = filterAgenda(agendaItems(current, reference), filters);
      const result = exportCalendar(selection, { today: reference, reminder });
      downloadFile(`DexFin-agenda-${mode === 'month' ? month : reference}.ics`, result.text, 'text/calendar;charset=utf-8');
      setNotice(`Download da agenda solicitado: ${result.events} evento(s). ${result.undated} item(ns) sem data ficaram fora do arquivo. Importar o arquivo não confirma pagamentos nem sincroniza alterações posteriores.`);
    } catch (reason) { setError(userError(reason)); }
    finally { setBusy(false); lock.current = false; }
  }
  const grid = mode === 'month' ? agendaMonth(month) : [];
  return <div className={styles.workspace}>
    <div className={styles.toolbar}><div><span className={styles.eyebrow}>O QUE PRECISA DA SUA ATENÇÃO</span><h2>Seus próximos passos</h2><p className={styles.hint}>Referência: {displayDate(reference)}. Valores pendentes atuais, nas datas cadastradas; escolher outro mês não reconstrói o saldo histórico.</p></div></div>
    <div className={agendaStyles.counts} role="group" aria-label="Resumo de todas as pendências">{[
      ['Todos os itens', counts.total, ''], ['Datas ultrapassadas', counts.overdue, 'overdue'], ['Para hoje', counts.today, 'today'], ['Sem data', counts.undated, 'undated'],
    ].map(([label, count, value]) => <button type="button" key={String(label)} className={agendaStyles.count} onClick={() => chooseStatus(value as AgendaStatus | '')}><span>{label}</span><strong>{count}</strong><small>Ver pendências</small></button>)}</div>
    <p className={styles.hint}>Os contadores acima incluem todos os meses. A agenda não soma valores de naturezas diferentes: uma meta não é uma despesa, e um reembolso não é renda. Evite registrar o mesmo compromisso como fatura e previsão.</p>
    <fieldset disabled={busy} className={agendaStyles.controls}>
      <legend className={styles.srOnly}>Visualização e filtros da agenda</legend>
      <div className={styles.toolbarActions} role="group" aria-label="Visualização da agenda"><button type="button" className={mode === 'pending' ? styles.primary : styles.secondary} aria-pressed={mode === 'pending'} onClick={() => change(() => { setMode('pending'); setDay(''); })}><ListChecks size={16} />Todas as pendências</button><button type="button" className={mode === 'month' ? styles.primary : styles.secondary} aria-pressed={mode === 'month'} onClick={() => change(() => { setMode('month'); setDay(''); })}><CalendarDays size={16} />Calendário mensal</button></div>
      <div className={agendaStyles.filters}>
        {mode === 'month' && <label className={styles.filterLabel}>Mês da agenda<input type="month" required value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && Number(event.target.value.slice(0, 4)) > 0) change(() => { setMonth(event.target.value); setDay(''); }); }} /></label>}
        <label className={styles.filterLabel}>Tipo de pendência<select value={kind} onChange={event => change(() => { setKind(event.target.value as AgendaKind | ''); setDay(''); })}><option value="">Todos os tipos</option>{Object.entries(agendaKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={styles.filterLabel}>Situação da pendência<select value={status} onChange={event => change(() => { setStatus(event.target.value as AgendaStatus | ''); setDay(''); })}><option value="">Todas as situações</option>{Object.entries(agendaStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={`${styles.filterLabel} ${agendaStyles.search}`}>Buscar na agenda<input type="search" maxLength={120} value={query} onChange={event => change(() => setQuery(event.target.value))} placeholder="Descrição, pessoa ou conta" /></label>
        <button type="button" className={styles.secondary} onClick={() => change(() => { setQuery(''); setKind(''); setStatus(''); setDay(''); })}>Limpar filtros</button>
      </div>
    </fieldset>
    {mode === 'month' && <section className={`${styles.accountCard} ${agendaStyles.calendar}`} aria-label="Calendário financeiro mensal">
      <h3>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))}</h3>
      <p className={styles.hint}>Selecione um dia para ver os itens. Os números pequenos contam pendências, não valores. Itens sem data continuam na lista quando nenhum dia está selecionado.</p>
      <table className={agendaStyles.month} aria-label={`Dias e pendências de ${month}`}><thead><tr>{weekdays.map(([short, full]) => <th key={short} scope="col"><abbr title={full}>{short}</abbr></th>)}</tr></thead><tbody>{Array.from({ length: grid.length / 7 }, (_, week) => <tr key={week}>{grid.slice(week * 7, week * 7 + 7).map((date, column) => <td key={date ?? `empty-${column}`}>{date && <button type="button" aria-pressed={day === date} aria-current={date === reference ? 'date' : undefined} aria-label={`${displayDate(date)}: ${byDay.get(date) ?? 0} pendência(s)`} className={`${agendaStyles.day} ${day === date ? agendaStyles.selectedDay : ''}`} onClick={() => change(() => setDay(current => current === date ? '' : date))}><span>{Number(date.slice(8))}</span>{byDay.has(date) && <small>{byDay.get(date)}</small>}</button>}</td>)}</tr>)}</tbody></table>
      {day && <button type="button" className={styles.secondary} onClick={() => change(() => setDay(''))}>Mostrar o mês inteiro</button>}
    </section>}
    <section className={`${styles.accountCard} ${agendaStyles.export}`} aria-label="Exportar agenda para calendário">
      <h3>Levar os vencimentos para seu calendário</h3><p className={styles.hint}>Baixe um arquivo .ics com os itens com data desta seleção, incluindo todas as páginas da lista. Abra ou importe no calendário de sua preferência. O arquivo contém descrições e valores: escolha onde guardá-lo.</p>
      <label className={styles.checkbox}><input type="checkbox" disabled={busy} checked={reminder} onChange={event => setReminder(event.target.checked)} />Pedir lembrete um dia antes dos eventos futuros</label>
      <p className={styles.hint}>A importação e os lembretes dependem do seu calendário. Eventos já importados não são removidos quando você paga ou altera algo no DexFin; confira e atualize-os manualmente. Itens sem data ficam fora do arquivo.</p>
      <button type="button" className={styles.secondary} disabled={busy || dated.length === 0} onClick={() => void download()}><Download size={16} />{busy ? 'Preparando agenda…' : 'Baixar agenda (.ics)'}</button>
    </section>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    <section aria-label="Lista de pendências" aria-live="polite">
      <div className={styles.toolbar}><h3>{day ? `Pendências de ${displayDate(day)}` : mode === 'month' ? 'Pendências do mês e itens sem data' : 'Pendências de todos os meses'}</h3><p className={styles.hint}>{visible.length} item(ns) nesta seleção.</p></div>
      {!visible.length ? <div className={styles.empty}><CalendarDays size={32} /><h3>Nenhuma pendência nesta seleção</h3><p>Faturas, previsões, reembolsos, empréstimos e metas aparecem a partir dos seus registros. Ajuste os filtros ou abra a seção correspondente para cadastrar.</p></div> : <div className={styles.stack}>{visible.slice(index * pageSize, (index + 1) * pageSize).map(item => <article key={item.id} className={`${styles.accountCard} ${agendaStyles.item}`} aria-label={item.title}>
        <div><span className={item.status === 'overdue' ? agendaStyles.overdue : agendaStyles.badge}>{item.date ? `${displayDate(item.date)} · ${agendaStatuses[item.status]}` : 'Sem data cadastrada'}</span><h4>{item.title}</h4><p>{agendaKinds[item.kind]} · {flowLabels[item.flow]}</p><p className={styles.hint}>{item.detail}</p></div>
        <div className={agendaStyles.itemAction}><strong>{formatMoney(item.amount)}</strong><button type="button" className={styles.secondary} onClick={() => onNavigate(item.page)}>Abrir em {pageLabels[item.page]}</button></div>
      </article>)}</div>}
      {pageCount > 1 && <div className={agendaStyles.pagination} aria-label="Páginas da lista de pendências"><button type="button" className={styles.secondary} disabled={index === 0} onClick={() => setPage(index - 1)}>Página anterior</button><span>Página {index + 1} de {pageCount}</span><button type="button" className={styles.secondary} disabled={index + 1 >= pageCount} onClick={() => setPage(index + 1)}>Próxima página</button></div>}
    </section>
  </div>;
}
