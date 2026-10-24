import { z } from 'zod';
import { commandSchema, type Command, type State } from '../domain/model';
import { execute } from '../domain/engine';
import { FinanceError } from '../domain/errors';
import { validDate } from '../domain/dates';
import { localToday } from '../application/finance-view';
import { appConfig } from '../config/app';
import { MAX_FILE_SIZE } from './backup';
import { requireWebCrypto } from './crypto';

export interface OfxTransaction {
  fitId: string;
  date: string;
  amount: number;
  description: string;
  bankType: string;
  requiresReview: boolean;
}
export interface OfxStatement {
  bankId: string;
  branchId: string;
  accountNumber: string;
  accountType: string;
  currency: 'BRL';
  transactions: OfxTransaction[];
}
export interface OfxClassification {
  action: 'pending' | 'income' | 'expense' | 'ignore';
  categoryId?: string;
  sourceId?: string;
}
interface Node { tag: string; text: string; children: Node[] }

const aggregates = new Set(['OFX', 'SIGNONMSGSRSV1', 'SONRS', 'STATUS', 'FI', 'BANKMSGSRSV1', 'STMTTRNRS', 'STMTRS', 'BANKACCTFROM', 'BANKTRANLIST', 'STMTTRN', 'LEDGERBAL', 'AVAILBAL', 'BANKACCTTO', 'CCACCTTO', 'CURRENCY', 'ORIGCURRENCY', 'PAYEE', 'IMAGEDATA', 'CREDITCARDMSGSRSV1', 'CCSTMTTRNRS', 'CCSTMTRS', 'CCACCTFROM', 'INVSTMTMSGSRSV1', 'INVSTMTTRNRS', 'INVSTMTRS', 'INVACCTFROM']);
const commonTypes = new Set(['CREDIT', 'DEBIT', 'INT', 'DIV', 'FEE', 'SRVCHG', 'DEP', 'ATM', 'POS', 'CHECK', 'DIRECTDEP', 'DIRECTDEBIT']);
function fail(message: string): never { throw new FinanceError(message); }

/** File headers are inspected before decoding; a guessed encoding must not silently alter identifiers. */
export function decodeOfx(bytes: ArrayBuffer): string {
  if (bytes.byteLength > MAX_FILE_SIZE) fail('O arquivo OFX precisa ter no máximo 20 MiB.');
  const data = new Uint8Array(bytes);
  const header = Array.from(data.slice(0, 4096), byte => String.fromCharCode(byte)).join('');
  if (header.includes('\0')) fail('OFX em UTF-16 não é suportado. Exporte em UTF-8 ou Windows-1252.');
  const xmlEncoding = header.match(/<\?xml\b[^>]*\bencoding\s*=\s*["']([^"']+)["']/i)?.[1];
  const charset = header.match(/^CHARSET\s*:\s*([^\r\n]+)/im)?.[1]?.trim();
  const declared = xmlEncoding ?? (charset && charset !== 'NONE' ? charset : header.match(/^ENCODING\s*:\s*([^\r\n]+)/im)?.[1]?.trim());
  const normalized = declared?.toUpperCase().replaceAll('_', '-');
  let encoding = 'utf-8';
  if (normalized && ['1252', 'WINDOWS-1252', 'CP1252', 'ISO-8859-1', '8859-1', 'LATIN1'].includes(normalized)) encoding = 'windows-1252';
  else if (normalized && !['UTF-8', 'UTF8', '65001', 'USASCII', 'US-ASCII', 'ASCII', 'UNICODE'].includes(normalized)) fail('Codificação OFX não suportada. Exporte em UTF-8 ou Windows-1252.');
  if (normalized && ['USASCII', 'US-ASCII', 'ASCII'].includes(normalized) && data.some(byte => byte > 127)) fail('O OFX declara ASCII, mas contém outros caracteres. Exporte com a codificação correta.');
  try { return new TextDecoder(encoding, { fatal: true }).decode(data); }
  catch { return fail('Não foi possível ler a codificação do OFX. Exporte em UTF-8 ou Windows-1252.'); }
}

function entities(text: string): string {
  return text.replace(/&([^;\s<&]+);/g, (_, entity: string) => {
    const known: Record<string, string> = { amp: '&', lt: '<', gt: '>', apos: "'", quot: '"' };
    if (Object.hasOwn(known, entity)) return known[entity];
    let code: number;
    if (/^#\d{1,7}$/.test(entity)) code = Number(entity.slice(1));
    else if (/^#x[\da-f]{1,6}$/i.test(entity)) code = parseInt(entity.slice(2), 16);
    else return fail('Entidade OFX desconhecida. DTD e entidades personalizadas não são aceitas.');
    if (code < 32 && ![9, 10, 13].includes(code) || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) fail('Entidade OFX inválida.');
    return String.fromCodePoint(code);
  });
}

/** Strict OFX subset: SGML may omit leaf closings, but aggregate structure is always checked. */
function tree(text: string): Node {
  if (new TextEncoder().encode(text).length > MAX_FILE_SIZE) fail('O arquivo OFX precisa ter no máximo 20 MiB.');
  if (/<!\s*(?:DOCTYPE|ENTITY)|<!\[CDATA\[/i.test(text)) fail('OFX com DTD, entidades personalizadas ou CDATA não é aceito.');
  text = text.replace(/^\uFEFF/, '');
  const start = text.search(/<OFX(?:\s|>)/i);
  if (start < 0) fail('O arquivo não contém um documento OFX suportado.');
  if (start > 4096) fail('Cabeçalho OFX maior que o limite suportado de 4 KiB.');
  const header = text.slice(0, start);
  const seenPrologs = new Set<string>();
  const plainHeader = header.replace(/<\?(xml|ofx)\b([\s\S]*?)\?>/gi, (_, kind: string, content: string) => {
    const name = kind.toLowerCase();
    if (seenPrologs.has(name) || /[<>]/.test(content)) fail('Prólogo OFX inválido ou repetido.');
    seenPrologs.add(name); return '';
  }).trim();
  const sgml = /^OFXHEADER\s*:\s*100\s*$/im.test(plainHeader);
  if (plainHeader && !plainHeader.split(/\r?\n/).every(line => !line.trim() || /^[A-Z][A-Z0-9]*\s*:\s*[^<>]*$/i.test(line.trim()))) fail('Cabeçalho OFX inválido ou formato não suportado.');
  if (plainHeader && !sgml) fail('Cabeçalho OFX não suportado. Utilize OFX SGML 1.x ou XML 2.x.');
  for (const field of ['SECURITY', 'COMPRESSION']) {
    const value = plainHeader.match(new RegExp(`^${field}\\s*:\\s*([^\\r\\n]+)`, 'im'))?.[1]?.trim();
    if (value && value.toUpperCase() !== 'NONE') fail('OFX protegido ou comprimido não é suportado. Exporte um extrato OFX comum.');
  }
  const stack: Node[] = [];
  let root: Node | undefined, cursor = start, count = 0, transactionCount = 0;
  function append(value: string) {
    if (!value.trim()) return;
    if (!stack.length || aggregates.has(stack[stack.length - 1].tag)) fail('Texto fora de posição no OFX.');
    const current = stack[stack.length - 1]; current.text += value;
    if (current.text.length > 20000) fail('Campo OFX maior que o limite suportado.');
  }
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open < 0) { append(text.slice(cursor)); break; }
    append(text.slice(cursor, open));
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4); if (end < 0) fail('Comentário OFX não fechado.');
      cursor = end + 3; continue;
    }
    const end = text.indexOf('>', open + 1); if (end < 0) fail('Tag OFX não fechada.');
    let token = text.slice(open + 1, end).trim(); cursor = end + 1;
    if (token.includes('<') || token.length > 2000 || !token) fail('Tag OFX inválida.');
    if (token.startsWith('!') || token.startsWith('?')) fail('Declaração OFX não suportada dentro do documento.');
    if (token.startsWith('/')) {
      const tag = token.slice(1).trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9]*$/.test(tag)) fail('Fechamento OFX inválido.');
      if (sgml && stack.length && stack[stack.length - 1].tag !== tag && !aggregates.has(stack[stack.length - 1].tag)) stack.pop();
      if (!stack.length || stack[stack.length - 1].tag !== tag) fail('Estrutura OFX inconsistente.');
      stack.pop(); continue;
    }
    const selfClosing = token.endsWith('/'); if (selfClosing) token = token.slice(0, -1).trim();
    const match = token.match(/^([A-Za-z][A-Za-z0-9]*)([\s\S]*)$/);
    if (!match || !/^(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*\s*$/.test(match[2])) fail('Tag ou atributo OFX não suportado.');
    const tag = match[1].toUpperCase();
    if (tag === 'STMTTRN' && ++transactionCount > 5000) fail('O OFX deve conter de 1 a 5.000 lançamentos.');
    if (sgml && stack.length && !aggregates.has(stack[stack.length - 1].tag)) stack.pop();
    const node: Node = { tag, text: '', children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (!root && tag === 'OFX') root = node;
    else fail('O arquivo precisa conter um único documento OFX.');
    if (++count > 200000 || stack.length >= 64) fail('OFX excede o limite de estrutura suportado.');
    if (!selfClosing) stack.push(node);
  }
  if (!root || stack.length) fail('Documento OFX incompleto.');
  return root;
}
function descendants(node: Node, tag: string): Node[] {
  const result: Node[] = [], remaining = [node];
  while (remaining.length) for (const child of remaining.pop()!.children) { if (child.tag === tag) result.push(child); remaining.push(child); }
  return result;
}
function one(node: Node, tag: string, required = true): Node | undefined {
  const found = node.children.filter(child => child.tag === tag);
  if (found.length > 1 || required && found.length !== 1) fail(`Campo OFX ${tag} ausente ou duplicado.`);
  return found[0];
}
function value(node: Node, tag: string, required = true, max = 120): string {
  const found = one(node, tag, required);
  if (!found) return '';
  const text = entities(found.text).trim();
  if (found.children.length || required && !text || text.length > max) fail(`Campo OFX ${tag} inválido ou maior que o limite suportado.`);
  return text;
}
function amount(text: string): number {
  if (!/^[+-]?\d{1,14}(?:\.\d{1,2})?$/.test(text)) fail('Valor OFX inválido: use valores decimais com ponto e até dois centavos.');
  const sign = text.startsWith('-') ? -1n : 1n;
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * sign;
  if (!cents || cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) fail('Valor OFX zerado ou fora do intervalo seguro de centavos.');
  return Number(cents);
}
function date(text: string): string {
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})(?:\.\d{1,6})?)?(?:\[[+-]?\d{1,2}(?:\.\d{1,2})?(?::[A-Za-z]{1,10})?\])?$/);
  if (!match || match[4] && (+match[4] > 23 || +match[5] > 59 || +match[6] > 59)) fail('Data OFX inválida.');
  const civil = `${match[1]}-${match[2]}-${match[3]}`;
  if (!validDate(civil)) fail('Data OFX inválida.');
  return civil;
}

export function parseOfx(text: string): OfxStatement {
  const root = tree(text);
  if (descendants(root, 'CCSTMTRS').length || descendants(root, 'CREDITCARDMSGSRSV1').length || descendants(root, 'INVSTMTRS').length) fail('Este adaptador aceita extrato de conta bancária, não faturas de cartão ou investimentos.');
  const statements = descendants(root, 'STMTRS');
  if (statements.length !== 1) fail('Importe um extrato OFX de uma única conta bancária por vez.');
  for (const status of descendants(root, 'STATUS')) if (value(status, 'CODE') !== '0') fail('O OFX informa erro ou aviso do banco. Gere outro extrato concluído com sucesso.');
  const statement = statements[0], currency = value(statement, 'CURDEF');
  if (currency !== 'BRL') fail('Este adaptador aceita somente extratos em BRL, sem conversão de moeda.');
  const account = one(statement, 'BANKACCTFROM')!, accountType = value(account, 'ACCTTYPE');
  if (!['CHECKING', 'SAVINGS', 'CASHMGMT'].includes(accountType)) fail('Tipo de conta OFX não suportado. Utilize conta corrente, poupança ou conta de pagamento.');
  const list = one(statement, 'BANKTRANLIST')!;
  const rows = list.children.filter(child => child.tag === 'STMTTRN');
  if (rows.length < 1 || rows.length > 5000) fail('O OFX deve conter de 1 a 5.000 lançamentos.');
  if (descendants(root, 'STMTTRN').length !== rows.length) fail('Lançamentos OFX fora da lista bancária suportada.');
  const transactions = rows.map((row, index) => {
    if (['CORRECTFITID', 'CORRECTACTION', 'CURRENCY', 'ORIGCURRENCY'].some(tag => row.children.some(child => child.tag === tag))) fail(`Lançamento ${index + 1}: correções bancárias ou moedas por lançamento exigem tratamento específico e não são importadas.`);
    const bankType = value(row, 'TRNTYPE', true, 30).toUpperCase();
    const memo = value(row, 'MEMO', false, 1000), name = value(row, 'NAME', false, 1000);
    const description = (memo || name || `Lançamento bancário ${bankType}`).replace(/\s+/g, ' ').slice(0, 120);
    const requiresReview = !commonTypes.has(bankType) || row.children.some(child => ['BANKACCTTO', 'CCACCTTO'].includes(child.tag)) || /transfer|\bpix\b|reembols|ressarc|fatura|cart[aã]o|estorno|devolu/i.test(`${name} ${memo}`);
    return { fitId: value(row, 'FITID'), date: date(value(row, 'DTPOSTED', true, 80)), amount: amount(value(row, 'TRNAMT', true, 40)), bankType, description, requiresReview };
  });
  return { bankId: value(account, 'BANKID'), branchId: value(account, 'BRANCHID', false), accountNumber: value(account, 'ACCTID'), accountType, currency: 'BRL', transactions };
}

/** Classification is deliberately absent from this key: a changed decision must conflict, not duplicate. */
export async function ofxTransactionKey(accountId: string, fitId: string): Promise<string> {
  const bytes = new Uint8Array(await requireWebCrypto().subtle.digest('SHA-256', new TextEncoder().encode(`dexfin-ofx-v1:${accountId}:${fitId}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function previewOfx(statement: OfxStatement, state: State, accountId: string, choices: readonly OfxClassification[]) {
  z.uuid().parse(accountId);
  if (!statement.transactions.length || statement.transactions.length > 5000 || choices.length !== statement.transactions.length) fail('Classificação OFX incompleta.');
  if (!state.accounts.some(account => account.id === accountId && !account.archived)) fail('Selecione uma conta ativa para o extrato OFX.');
  const commands: Command[] = []; let duplicates = 0, ignored = 0, simulated = state;
  const today = localToday(appConfig.timeZone);
  for (const [index, row] of statement.transactions.entries()) {
    const choice = choices[index];
    if (choice.action === 'ignore') { ignored++; continue; }
    if (choice.action === 'pending') fail(`Lançamento ${index + 1}: classifique como receita/despesa ou escolha ignorar.`);
    if (choice.action === 'income' && row.amount < 0 || choice.action === 'expense' && row.amount > 0) fail(`Lançamento ${index + 1}: classificação incompatível com a entrada/saída do extrato.`);
    if (row.date > today) fail(`Lançamento ${index + 1}: este adaptador aceita somente datas realizadas até hoje.`);
    const key = await ofxTransactionKey(accountId, row.fitId);
    const command = commandSchema.parse({ key, type: choice.action, date: row.date, description: row.description, amount: Math.abs(row.amount), accountId, categoryId: choice.categoryId, ...(choice.action === 'income' ? { sourceId: choice.sourceId } : {}) });
    try {
      const result = execute(simulated, command, { now: new Date().toISOString(), newId: () => crypto.randomUUID() });
      if (result.replayed) duplicates++;
      else { commands.push(command); simulated = result.state; }
    } catch (error) {
      if (error instanceof FinanceError && error.message.includes('idempotência')) fail(`Lançamento ${index + 1}: o FITID já foi usado nesta conta com dados ou classificação diferentes. Revise o histórico; nenhuma linha foi importada.`);
      throw error;
    }
  }
  return { commands, duplicates, ignored, rows: statement.transactions.length };
}
