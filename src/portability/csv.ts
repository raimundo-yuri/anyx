import { z } from 'zod';
import { commandSchema, stateSchema, type Command, type State } from '../domain/model';
import { execute } from '../domain/engine';
import { FinanceError } from '../domain/errors';
import { localToday } from '../application/finance-view';
import { appConfig } from '../config/app';
import { assertState } from '../domain/integrity';
import { requireWebCrypto } from './crypto';

/** Formula protection applies only to text. Numeric cents remain numeric, including negatives. */
function cell(value: unknown): string {
  if (value === undefined || value === null) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function exportCsv(state: State, table: keyof State): string {
  assertState(state);
  const columns = Object.keys(stateSchema.shape[table].element.shape);
  return '\uFEFF' + [columns.join(';'), ...state[table].map(row => columns.map(column => cell((row as Record<string, unknown>)[column])).join(';'))].join('\r\n');
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, afterQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
    } else if (char === '"') {
      if (field.length || afterQuote) throw new FinanceError('CSV com aspas fora de posição.');
      quoted = true;
    } else if (char === ';') { row.push(field); field = ''; afterQuote = false; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field); if (row.some(value => value !== '')) rows.push(row);
      row = []; field = ''; afterQuote = false;
    } else {
      if (afterQuote) throw new FinanceError('CSV com caracteres após fechamento de aspas.');
      field += char;
    }
  }
  if (quoted) throw new FinanceError('CSV com aspas não fechadas.');
  if (field || row.length || afterQuote) { row.push(field); rows.push(row); }
  return rows;
}
export const statementColumns = ['externalId', 'date', 'type', 'description', 'amount', 'accountId', 'categoryId', 'sourceId'] as const;
export const statementTemplate = '\uFEFF' + statementColumns.join(';') + '\r\n';
async function importKey(accountId: string, externalId: string): Promise<string> {
  const bytes = new Uint8Array(await requireWebCrypto().subtle.digest('SHA-256', new TextEncoder().encode(`dexfin-csv-v1:${accountId}:${externalId}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function previewStatement(text: string, state: State, mapping?: Record<string, string>) {
  const rows = parseCsv(text);
  if (rows.length < 2 || rows.length > 5001) throw new FinanceError('O CSV deve conter de 1 a 5.000 registros.');
  const headers = rows[0];
  if (new Set(headers).size !== headers.length) throw new FinanceError('CSV com cabeçalhos duplicados.');
  const required = statementColumns.filter(column => column !== 'sourceId');
  if (required.some(column => !headers.includes(mapping?.[column] ?? column))) throw new FinanceError('Mapeie todas as colunas exigidas ou utilize o modelo CSV DexFin. Valores são centavos inteiros positivos.');
  const commands: Command[] = []; let duplicates = 0, simulated = state;
  for (const [index, values] of rows.slice(1).entries()) {
    if (values.length !== headers.length) throw new FinanceError(`Linha ${index + 2}: número de colunas diferente do cabeçalho.`);
    const data = Object.fromEntries(statementColumns.map(column => [column, values[headers.indexOf(mapping?.[column] ?? column)] ?? '']));
    const externalId = z.string().trim().min(1).max(120).parse(data.externalId);
    if (!/^\d+$/.test(data.amount)) throw new FinanceError(`Linha ${index + 2}: valor precisa ser centavos inteiros positivos.`);
    const key = await importKey(data.accountId, externalId);
    if (data.date > localToday(appConfig.timeZone)) throw new FinanceError(`Linha ${index + 2}: este adaptador aceita somente datas realizadas até hoje.`);
    const command = commandSchema.parse({ key, type: data.type, date: data.date, description: data.description, amount: Number(data.amount), accountId: data.accountId, categoryId: data.categoryId, ...(data.type === 'income' ? { sourceId: data.sourceId } : {}) });
    if (command.type !== 'income' && command.type !== 'expense') throw new FinanceError('Este adaptador importa somente receitas e despesas realizadas.');
    const result = execute(simulated, command, { now: new Date().toISOString(), newId: () => crypto.randomUUID() });
    if (result.replayed) duplicates++;
    else { commands.push(command); simulated = result.state; }
  }
  return { commands, duplicates, rows: rows.length - 1 };
}
