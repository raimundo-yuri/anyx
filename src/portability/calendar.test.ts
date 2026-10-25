import { describe, expect, it } from 'vitest';
import { fixture, purchaseCommand, uid } from '../test/finance-fixture';
import { agendaItems, type AgendaItem } from '../application/agenda';
import { exportCalendar, foldCalendarLine } from './calendar';

const now = '2026-01-10T12:34:56.789Z', today = '2026-01-10';
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '');
function item(date = '2026-01-11'): AgendaItem {
  return { id: `forecast-${uid()}`, title: 'Salário previsto', detail: 'Ainda não recebido.', kind: 'forecastIncome', page: 'planning', flow: 'incoming', status: 'upcoming', amount: 10001, date };
}
describe('Exportação local iCalendar', () => {
  it('usa datas civis de dia inteiro e centavos exatos, com UID estável entre exportações', () => {
    const event = item(), first = exportCalendar([event], { now, today });
    const second = exportCalendar([event], { now: '2026-01-12T09:00:00Z', today });
    const text = unfold(first.text);
    expect(text).toContain(`UID:dexfin-${event.id}@dexfin.local\r\n`);
    expect(text).toContain('DTSTAMP:20260110T123456Z\r\n');
    expect(text).toContain('DTSTART;VALUE=DATE:20260111\r\nDTEND;VALUE=DATE:20260112\r\n');
    expect(text).toContain('R$ 100\\,01'); expect(text).toContain('STATUS:TENTATIVE');
    expect(text).not.toContain('TZID'); expect(text).not.toContain('VALARM');
    expect(second.text.match(/UID:.*/)?.[0]).toBe(first.text.match(/UID:.*/)?.[0]);
    expect(first).toMatchObject({ events: 1, undated: 0 });
  });
  it('não inventa data para itens sem prazo nem os exporta silenciosamente como eventos de hoje', () => {
    const undated = { ...item(), id: `personPayable-${uid()}`, date: null };
    const result = exportCalendar([item(), undated], { now, today });
    expect(result).toMatchObject({ events: 1, undated: 1 }); expect(result.text).not.toContain(undated.id);
    expect(() => exportCalendar([undated], { now, today })).toThrow(/com data/);
  });
  it('alarme é opcional e somente para eventos futuros, sem calendário externo ou confirmação financeira', () => {
    const result = exportCalendar([item('2026-01-09'), item('2026-01-10'), item('2026-01-11')], { now, today, reminder: true });
    expect(result.text.match(/BEGIN:VALARM/g)).toHaveLength(1); expect(result.text).toContain('TRIGGER:-P1D');
    expect(unfold(result.text)).toContain('sem confirmação de pagamento ou recebimento');
    expect(result.text).not.toContain('ATTENDEE'); expect(result.text).not.toContain('ORGANIZER'); expect(result.text).not.toContain('METHOD:REQUEST');
  });
  it('escapa quebras de linha e delimitadores sem permitir injeção de eventos/propriedades', () => {
    const event = { ...item(), title: 'Texto; vírgula, barra\\\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nATTENDEE:malicioso', detail: 'Detalhe\u0000\u0001\n<script>texto</script>' };
    const text = unfold(exportCalendar([event], { now, today }).text);
    expect(text.split('\r\n').filter(line => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(text.split('\r\n').filter(line => line === 'END:VEVENT')).toHaveLength(1);
    expect(text).toContain('SUMMARY:Texto\\; vírgula\\, barra\\\\\\nEND:VEVENT\\nBEGIN:VEVENT\\nATTENDEE:malicioso');
    expect(text).not.toContain('\u0000'); expect(text).not.toContain('\u0001');
  });
  it('dobra linhas por bytes UTF-8 sem quebrar acentos ou emojis', () => {
    const original = 'SUMMARY:' + 'ação café 😄 família 👩‍👩‍👦 '.repeat(15), folded = foldCalendarLine(original);
    expect(unfold(folded)).toBe(original);
    expect(folded.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(folded).not.toContain('\ufffd');
    const exported = exportCalendar([{ ...item(), title: original }], { now, today }).text;
    expect(exported.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(exported.replaceAll('\r\n', '')).not.toContain('\n'); expect(exported.endsWith('\r\n')).toBe(true);
  });
  it.each([['2024-02-28', '20240229'], ['2024-02-29', '20240301'], ['2026-12-31', '20270101'], ['0001-01-01', '00010102']])('encerra o dia %s em %s sem conversão de fuso', (date, end) => {
    expect(exportCalendar([item(date)], { now, today }).text).toContain(`DTEND;VALUE=DATE:${end}\r\n`);
  });
  it('recusa datas, IDs, seleção duplicada e volumes incompatíveis sem gerar arquivo parcial', () => {
    expect(() => exportCalendar([item('2026-02-30')], { now, today })).toThrow(/inválida/);
    expect(() => exportCalendar([item('9999-12-31')], { now, today })).toThrow(/9999/);
    expect(() => exportCalendar([{ ...item(), id: 'x\nBEGIN:VEVENT' }], { now, today })).toThrow(/inválida/);
    const event = item(); expect(() => exportCalendar([event, event], { now, today })).toThrow(/repetido/);
    expect(() => exportCalendar([event], { now: 'inexistente', today })).toThrow(/Instante/);
    expect(() => exportCalendar(Array.from({ length: 5001 }, () => item()), { now, today })).toThrow(/5.000/);
  });
  it('exportar pendências reais não altera operações, reservas, recibos ou saldos', () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), installmentCount: 3 }); const before = structuredClone(f.state);
    const result = exportCalendar(agendaItems(f.state, today), { now, today });
    expect(result.events).toBe(3); expect(result.undated).toBe(2); expect(f.state).toEqual(before);
  });
});
