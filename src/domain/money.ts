import { FinanceError } from './errors';
/** Money is stored as safe integer cents. Text conversion never uses float multiplication. */
export function cents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new FinanceError('Valor monetário fora do intervalo seguro de centavos.');
  return value;
}
export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => cents(total + cents(value)), 0);
}
export function parseBRL(text: string): number {
  const input = text.trim();
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(input)) {
    throw new FinanceError('Informe um valor brasileiro válido, como 1.234,56.');
  }
  const negative = input.startsWith('-');
  const [whole, fraction = ''] = input.replace('-', '').replaceAll('.', '').split(',');
  const result = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new FinanceError('Valor monetário fora do intervalo seguro de centavos.');
  }
  return Number(result);
}
export function percentage(amount: number, basisPoints: number): number {
  cents(amount);
  if (amount < 0 || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new FinanceError('Base ou percentual inválido.');
  }
  return cents(Number((BigInt(amount) * BigInt(basisPoints) + 5_000n) / 10_000n));
}
/** Future installment helper: preserve every cent, assigning remainders to the earliest parts. */
export function allocate(amount: number, count: number): number[] {
  cents(amount);
  if (!Number.isInteger(count) || count < 1 || count > 600 || amount < count) throw new FinanceError('Divisão inválida.');
  const base = Math.floor(amount / count);
  const rest = amount % count;
  return Array.from({ length: count }, (_, index) => base + (index < rest ? 1 : 0));
}
