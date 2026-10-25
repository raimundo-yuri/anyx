import { agendaKinds, type AgendaItem } from '../application/agenda';
import { formatMoney } from '../application/finance-view';
import { validDate } from '../domain/dates';
import { FinanceError } from '../domain/errors';

const encoder = new TextEncoder();
function escaped(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
}
/** RFC 5545 limits physical lines to 75 UTF-8 octets, including continuation spaces. */
export function foldCalendarLine(line: string): string {
  let result = '', current = '', bytes = 0;
  for (const character of line) {
    const count = encoder.encode(character).length;
    if (bytes + count > 75) { result += current + '\r\n'; current = ' '; bytes = 1; }
    current += character; bytes += count;
  }
  return result + current;
}
function nextDay(date: string) {
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const result = next.toISOString().slice(0, 10);
  if (!validDate(result)) throw new FinanceError('O último dia do ano 9999 não pode ser exportado para o calendário.');
  return result.replaceAll('-', '');
}

/** Creates a local snapshot only: no calendar account, network request or financial mutation. */
export function exportCalendar(items: readonly AgendaItem[], options: { now?: string; today: string; reminder?: boolean }): { text: string; events: number; undated: number } {
  if (!validDate(options.today)) throw new FinanceError('Data de referência inválida.');
  const now = options.now ?? new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(now) || !validDate(now.slice(0, 10)) || !Number.isFinite(Date.parse(now))) throw new FinanceError('Instante de exportação inválido.');
  const dated = items.filter(item => item.date !== null);
  if (!dated.length) throw new FinanceError('Não há pendências com data para exportar nesta seleção.');
  if (dated.length > 5000) throw new FinanceError('Selecione até 5.000 pendências com data para exportar.');
  if (new Set(dated.map(item => item.id)).size !== dated.length) throw new FinanceError('Identificador de agenda repetido.');
  const stamp = now.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DexFin//Agenda financeira//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:DexFin'];
  for (const item of dated) {
    if (!validDate(item.date!) || !/^[a-zA-Z]+-[0-9a-f-]{36}$/.test(item.id)) throw new FinanceError('Pendência com data ou identificação inválida.');
    lines.push('BEGIN:VEVENT', `UID:dexfin-${item.id}@dexfin.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${item.date!.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${nextDay(item.date!)}`,
      `SUMMARY:${escaped(`${item.title} · ${formatMoney(item.amount)}`)}`,
      `DESCRIPTION:${escaped(`${agendaKinds[item.kind]}. ${item.detail}\nValor pendente na exportação: ${formatMoney(item.amount)}.\nCópia da agenda do DexFin, sem confirmação de pagamento ou recebimento. Alterações posteriores não são sincronizadas; confira o aplicativo antes de agir.`)}`, 'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT');
    if (options.reminder && item.date! > options.today) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', 'DESCRIPTION:Lembrete de compromisso no DexFin', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(foldCalendarLine).join('\r\n') + '\r\n', events: dated.length, undated: items.length - dated.length };
}
