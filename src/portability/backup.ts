import { z } from 'zod';
import { stateSchema, type State } from '../domain/model';
import { upgradeRefundSnapshot, upgradeSnapshot } from '../domain/migrate';
import { assertState } from '../domain/integrity';
import { FinanceError } from '../domain/errors';
import { requireWebCrypto } from './crypto';

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
const envelope = z.strictObject({ format: z.literal('dexfin'), version: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), exportedAt: z.iso.datetime(), state: z.unknown() });
const encryptedEnvelope = z.strictObject({ format: z.literal('dexfin-encrypted'), version: z.literal(1), iterations: z.literal(310000), salt: z.string(), iv: z.string(), data: z.string() });
export function plainBackup(state: State, now = new Date().toISOString()): string {
  assertState(state);
  const text = JSON.stringify({ format: 'dexfin', version: 6, exportedAt: now, state }, null, 2);
  if (new TextEncoder().encode(text).length > MAX_FILE_SIZE) throw new FinanceError('Backup maior que o limite suportado de 20 MiB. Nenhum arquivo incompleto foi criado.');
  return text;
}
function encode(bytes: Uint8Array): string {
  let text = ''; for (const value of bytes) text += String.fromCharCode(value);
  return btoa(text);
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  try { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
  catch { throw new FinanceError('Backup criptografado inválido.'); }
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const api = requireWebCrypto();
  const material = await api.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return api.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptedBackup(state: State, password: string): Promise<string> {
  if (password.length < 8) throw new FinanceError('Use uma senha de backup com pelo menos 8 caracteres.');
  const api = requireWebCrypto();
  const salt = api.getRandomValues(new Uint8Array(16)), iv = api.getRandomValues(new Uint8Array(12));
  const data = await api.subtle.encrypt({ name: 'AES-GCM', iv }, await key(password, salt), new TextEncoder().encode(plainBackup(state)));
  const text = JSON.stringify({ format: 'dexfin-encrypted', version: 1, iterations: 310000, salt: encode(salt), iv: encode(iv), data: encode(new Uint8Array(data)) });
  if (new TextEncoder().encode(text).length > MAX_FILE_SIZE) throw new FinanceError('Backup criptografado maior que o limite suportado de 20 MiB.');
  return text;
}
export async function readBackup(text: string, password = ''): Promise<State> {
  if (new TextEncoder().encode(text).length > MAX_FILE_SIZE) throw new FinanceError('Arquivo maior que o limite de 20 MiB.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new FinanceError('O arquivo não contém JSON válido.'); }
  if (typeof raw === 'object' && raw !== null && 'format' in raw && raw.format === 'dexfin-encrypted') {
    const encrypted = encryptedEnvelope.parse(raw);
    const salt = decode(encrypted.salt), iv = decode(encrypted.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new FinanceError('Parâmetros de criptografia inválidos.');
    const api = requireWebCrypto();
    try {
      const decrypted = await api.subtle.decrypt({ name: 'AES-GCM', iv }, await key(password, salt), decode(encrypted.data));
      raw = JSON.parse(new TextDecoder().decode(decrypted));
    } catch { throw new FinanceError('Senha incorreta ou backup criptografado danificado.'); }
  }
  const data = envelope.parse(raw);
  const state = data.version === 2 ? upgradeSnapshot(data.state) : data.version < 5 ? upgradeRefundSnapshot(data.state) : stateSchema.parse(data.state);
  if (data.version === 2 && state.operations.some(item => item.kind === 'reversal')) throw new FinanceError('Backups com estornos de correção precisam usar o formato versão 3.');
  if (data.version < 4 && state.categories.some(item => item.parentId)) throw new FinanceError('Backups com subcategorias precisam usar o formato versão 4.');
  if (data.version < 5 && (state.purchaseRefunds.length || state.refundAllocations.length || state.operations.some(item => ['purchaseRefund', 'cardCreditUse', 'personRefund'].includes(item.kind)) || state.entries.some(item => ['cardCredit', 'personPayable'].includes(item.ledger)))) throw new FinanceError('Backups com devoluções comerciais precisam usar o formato versão 5.');
  if (data.version < 6 && state.operations.some(item => item.kind === 'reversal' && !['income', 'expense', 'transfer'].includes(state.operations.find(original => original.id === item.relatedId)?.kind ?? ''))) throw new FinanceError('Backups com correções de pagamentos e devoluções precisam usar o formato versão 6.');
  assertState(state);
  return state;
}
