import { FinanceError } from './errors';
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new FinanceError('Mês inválido.');
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  try { return day >= 1 && day <= daysInMonth(year, month); } catch { return false; }
}
export function nextMonth(cycle: string): string {
  const [year, month] = cycle.split('-').map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const next = month === 12 ? 1 : month + 1;
  daysInMonth(nextYear, next);
  return `${String(nextYear).padStart(4, '0')}-${String(next).padStart(2, '0')}`;
}
function dateInCycle(cycle: string, day: number): string {
  const [year, month] = cycle.split('-').map(Number);
  return `${cycle}-${String(Math.min(day, daysInMonth(year, month))).padStart(2, '0')}`;
}
export function invoiceDates(date: string, closingDay: number, dueDay: number, explicitCycle?: string) {
  if (!validDate(date) || ![closingDay, dueDay].every(day => Number.isInteger(day) && day >= 1 && day <= 31)) throw new FinanceError('Data ou dias do cartão inválidos.');
  let cycle = explicitCycle ?? date.slice(0, 7);
  // Purchases on closing day default to the following cycle; an explicit cycle can override this.
  if (!explicitCycle && date >= dateInCycle(cycle, closingDay)) cycle = nextMonth(cycle);
  const closingDate = dateInCycle(cycle, closingDay);
  if (closingDate < date) throw new FinanceError('A fatura não pode fechar antes da compra.');
  const candidateDue = dateInCycle(cycle, dueDay);
  const dueDate = candidateDue > closingDate ? candidateDue : dateInCycle(nextMonth(cycle), dueDay);
  return { cycle, closingDate, dueDate };
}
