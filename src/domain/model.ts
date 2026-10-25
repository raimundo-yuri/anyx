import { z } from 'zod';
import { validDate } from './dates';

export const idSchema = z.uuid();
export const dateSchema = z.string().refine(validDate, 'Data civil inválida.');
export const moneySchema = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const amountSchema = moneySchema.refine(n => n > 0, 'O valor deve ser positivo.');
const name = z.string().trim().min(1).max(120);
const base = { id: idSchema, createdAt: z.iso.datetime() };
const editable = { archived: z.boolean().optional(), updatedAt: z.iso.datetime().optional() };
const accountFields = { institution: z.string().trim().max(120).optional(), kind: z.enum(['checking', 'savings', 'payment', 'cash']).optional() };
const account = z.strictObject({ ...base, ...editable, ...accountFields, name, currency: z.literal('BRL'), openedOn: dateSchema });
const category = z.strictObject({ ...base, ...editable, name, kind: z.enum(['income', 'expense']), parentId: idSchema.optional() });
const person = z.strictObject({ ...base, ...editable, name });
const source = z.strictObject({ ...base, ...editable, name });
const card = z.strictObject({ ...base, ...editable, institution: z.string().trim().max(120).optional(), name, limit: amountSchema, closingDay: z.number().int().min(1).max(31), dueDay: z.number().int().min(1).max(31) });
const invoice = z.strictObject({ ...base, cardId: idSchema, cycle: z.string().regex(/^\d{4}-\d{2}$/), closingDate: dateSchema, dueDate: dateSchema });
const operation = z.strictObject({ ...base, relatedId: idSchema.optional(), date: dateSchema, description: name, kind: z.enum(['opening', 'income', 'expense', 'transfer', 'reversal', 'purchaseRefund', 'cardCreditUse', 'personRefund', 'purchase', 'reimbursement', 'invoicePayment', 'contributionPayment', 'investmentDeposit', 'investmentWithdrawal', 'valuation', 'loanLent', 'loanBorrowed', 'loanRepayment']) });
export const ledgerKinds = ['cash', 'receivable', 'card', 'income', 'expense', 'equity', 'investment', 'valuation', 'loanAsset', 'loanDebt', 'cardCredit', 'personPayable'] as const;
const entry = z.strictObject({ ...base, operationId: idSchema, ledger: z.enum(ledgerKinds), referenceId: idSchema, side: z.enum(['debit', 'credit']), amount: amountSchema, categoryId: idSchema.optional() });
const purchase = z.strictObject({ ...base, operationId: idSchema, invoiceId: idSchema, amount: amountSchema, buyerId: idSchema.optional() });
const split = z.strictObject({ ...base, purchaseId: idSchema, amount: amountSchema, personId: idSchema.optional(), categoryId: idSchema.optional(), dueDate: dateSchema.optional() });
const receivable = z.strictObject({ ...base, splitId: idSchema, personId: idSchema, amount: amountSchema, dueDate: dateSchema.optional() });
const reserve = z.strictObject({ ...base, accountId: idSchema, amount: moneySchema.refine(value => value >= 0), contributionId: idSchema.optional(), goalId: idSchema.optional() });
const rule = z.strictObject({ ...base, name, enabled: z.boolean(), basisPoints: z.number().int().min(0).max(10_000), sourceIds: z.array(idSchema).min(1), mode: z.enum(['suggest', 'reserve']) });
const contribution = z.strictObject({ ...base, incomeId: idSchema, ruleId: idSchema, accountId: idSchema, amount: amountSchema, basisPoints: z.number().int().min(0).max(10_000), status: z.enum(['suggested', 'reserved', 'paid', 'cancelled']), paymentId: idSchema.optional(), cancelledById: idSchema.optional() });
const receipt = z.strictObject({ ...base, payload: z.string(), resultId: idSchema });
const purchaseRefund = z.strictObject({ ...base, operationId: idSchema, purchaseId: idSchema, invoiceId: idSchema, amount: amountSchema });
const refundAllocation = z.strictObject({ ...base, refundId: idSchema, splitId: idSchema, amount: amountSchema });

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value => validDate(value + '-01'));
const installment = z.strictObject({ ...base, purchaseId: idSchema, invoiceId: idSchema, index: z.number().int().min(1).max(120), amount: amountSchema });
const receivableSchedule = z.strictObject({ ...base, receivableId: idSchema, index: z.number().int().min(1).max(120), amount: amountSchema, dueDate: dateSchema });
const goal = z.strictObject({ ...base, name, accountId: idSchema, target: amountSchema, deadline: dateSchema });
const budget = z.strictObject({ ...base, categoryId: idSchema, month: monthSchema, amount: amountSchema });
const forecastFields = { name, kind: z.enum(['income', 'expense']), accountId: idSchema, categoryId: idSchema, sourceId: idSchema.optional(), amount: amountSchema };
const forecast = z.strictObject({ ...base, ...forecastFields, date: dateSchema, recurringId: idSchema.optional(), operationId: idSchema.optional(), cancelled: z.boolean().optional() });
const recurring = z.strictObject({ ...base, ...forecastFields, day: z.number().int().min(1).max(31), active: z.boolean() });
const investment = z.strictObject({ ...base, name, lastValuedOn: dateSchema.optional() });
const loan = z.strictObject({ ...base, name, personId: idSchema, direction: z.enum(['lent', 'borrowed']), principal: amountSchema, date: dateSchema, dueDate: dateSchema, operationId: idSchema });

export const stateSchema = z.strictObject({
  accounts: z.array(account), categories: z.array(category), people: z.array(person), sources: z.array(source),
  cards: z.array(card), invoices: z.array(invoice), operations: z.array(operation), entries: z.array(entry),
  purchaseRefunds: z.array(purchaseRefund), refundAllocations: z.array(refundAllocation),
  purchases: z.array(purchase), splits: z.array(split), receivables: z.array(receivable),
  installments: z.array(installment), receivableSchedules: z.array(receivableSchedule), goals: z.array(goal), budgets: z.array(budget), forecasts: z.array(forecast), recurrings: z.array(recurring), investments: z.array(investment), loans: z.array(loan),
  reserves: z.array(reserve), rules: z.array(rule), contributions: z.array(contribution), receipts: z.array(receipt),
});
export type State = z.infer<typeof stateSchema>;
export type Entry = State['entries'][number];
export type Operation = State['operations'][number];
export function isReversibleMovement(kind: Operation['kind']): boolean { return ['income', 'expense', 'transfer', 'invoicePayment', 'reimbursement', 'purchaseRefund', 'cardCreditUse', 'personRefund'].includes(kind); }
export const tableNames = Object.keys(stateSchema.shape) as (keyof State)[];
export function emptyState(): State {
  return stateSchema.parse(Object.fromEntries(tableNames.map(key => [key, []])));
}

const commandBase = { key: idSchema };
const financial = { ...commandBase, date: dateSchema, description: name, amount: amountSchema };
const splitInput = z.strictObject({ amount: amountSchema, personId: idSchema.optional(), categoryId: idSchema.optional(), dueDate: dateSchema.optional() });
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...financial, type: z.literal('purchaseRefund'), purchaseId: idSchema, invoiceId: idSchema, allocations: z.array(z.strictObject({ splitId: idSchema, amount: amountSchema })).min(1).max(100) }),
  z.strictObject({ ...financial, type: z.literal('cardCreditUse'), invoiceId: idSchema }),
  z.strictObject({ ...financial, type: z.literal('personRefund'), receivableId: idSchema, accountId: idSchema }),
  z.strictObject({ ...commandBase, type: z.literal('setCategoryParent'), id: idSchema, parentId: idSchema.nullable() }),
  z.strictObject({ ...commandBase, type: z.literal('reverseMovement'), operationId: idSchema, reason: name }),
  z.strictObject({ ...commandBase, type: z.literal('createGoal'), id: idSchema, name, accountId: idSchema, target: amountSchema, deadline: dateSchema }),
  z.strictObject({ ...commandBase, type: z.literal('fundGoal'), id: idSchema, amount: moneySchema.refine(value => value >= 0) }),
  z.strictObject({ ...commandBase, type: z.literal('setBudget'), id: idSchema, categoryId: idSchema, month: monthSchema, amount: amountSchema }),
  z.strictObject({ ...commandBase, type: z.literal('createForecast'), id: idSchema, ...forecastFields, date: dateSchema }),
  z.strictObject({ ...commandBase, type: z.literal('settleForecast'), id: idSchema, date: dateSchema, action: z.enum(['confirm', 'cancel']) }),
  z.strictObject({ ...commandBase, type: z.literal('createRecurring'), id: idSchema, ...forecastFields, day: z.number().int().min(1).max(31), active: z.boolean() }),
  z.strictObject({ ...commandBase, type: z.literal('toggleRecurring'), id: idSchema, active: z.boolean() }),
  z.strictObject({ ...commandBase, type: z.literal('generateForecasts'), month: monthSchema }),
  z.strictObject({ ...commandBase, type: z.literal('createInvestment'), id: idSchema, name }),
  z.strictObject({ ...financial, type: z.literal('investmentFlow'), investmentId: idSchema, accountId: idSchema, direction: z.enum(['deposit', 'withdraw']) }),
  z.strictObject({ ...commandBase, type: z.literal('valueInvestment'), investmentId: idSchema, value: moneySchema.refine(value => value >= 0), date: dateSchema }),
  z.strictObject({ ...financial, type: z.literal('createLoan'), id: idSchema, personId: idSchema, accountId: idSchema, direction: z.enum(['lent', 'borrowed']), dueDate: dateSchema }),
  z.strictObject({ ...commandBase, type: z.literal('repayLoan'), id: idSchema, accountId: idSchema, principalAmount: moneySchema.refine(value => value >= 0), interestAmount: moneySchema.refine(value => value >= 0), date: dateSchema, categoryId: idSchema.optional(), sourceId: idSchema.optional() }),
  z.strictObject({ ...commandBase, type: z.literal('scheduleReceivable'), receivableId: idSchema, count: z.number().int().min(1).max(120), firstDueDate: dateSchema }),
  z.strictObject({ ...commandBase, type: z.literal('updateCard'), id: idSchema, name, institution: z.string().trim().max(120).optional(), limit: amountSchema, closingDay: z.number().int().min(1).max(31), dueDay: z.number().int().min(1).max(31) }),
  z.strictObject({ ...commandBase, type: z.literal('renamePerson'), id: idSchema, name }),
  z.strictObject({ ...commandBase, type: z.literal('adjustContribution'), id: idSchema, amount: amountSchema }),
  z.strictObject({ ...commandBase, type: z.literal('updateRule'), id: idSchema, name, enabled: z.boolean(), basisPoints: z.number().int().min(0).max(10_000), sourceIds: z.array(idSchema).min(1), mode: z.enum(['suggest', 'reserve']) }),
  z.strictObject({ ...commandBase, type: z.literal('installCatalog') }),
  z.strictObject({ ...commandBase, type: z.literal('updateAccount'), id: idSchema, name, ...accountFields }),
  z.strictObject({ ...commandBase, type: z.literal('renameCategory'), id: idSchema, name }),
  z.strictObject({ ...commandBase, type: z.literal('renameSource'), id: idSchema, name }),
  z.strictObject({ ...commandBase, type: z.literal('setArchived'), entity: z.enum(['account', 'category', 'source']), id: idSchema, archived: z.boolean() }),
  z.strictObject({ ...commandBase, type: z.literal('createAccount'), id: idSchema, name, ...accountFields, openingBalance: moneySchema, date: dateSchema }),
  z.strictObject({ ...commandBase, type: z.literal('createCategory'), id: idSchema, name, kind: z.enum(['income', 'expense']), parentId: idSchema.optional() }),
  z.strictObject({ ...commandBase, type: z.literal('createPerson'), id: idSchema, name }),
  z.strictObject({ ...commandBase, type: z.literal('createSource'), id: idSchema, name }),
  z.strictObject({ ...commandBase, type: z.literal('createCard'), id: idSchema, name, institution: z.string().trim().max(120).optional(), limit: amountSchema, closingDay: z.number().int().min(1).max(31), dueDay: z.number().int().min(1).max(31) }),
  z.strictObject({ ...financial, type: z.literal('income'), accountId: idSchema, categoryId: idSchema, sourceId: idSchema }),
  z.strictObject({ ...financial, type: z.literal('expense'), accountId: idSchema, categoryId: idSchema }),
  z.strictObject({ ...financial, type: z.literal('transfer'), fromId: idSchema, toId: idSchema }),
  z.strictObject({ ...financial, type: z.literal('purchase'), cardId: idSchema, buyerId: idSchema.optional(), installmentCount: z.number().int().min(1).max(120).optional(), cycle: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), splits: z.array(splitInput).min(1).max(100) }),
  z.strictObject({ ...financial, type: z.literal('reimbursement'), receivableId: idSchema, accountId: idSchema }),
  z.strictObject({ ...financial, type: z.literal('invoicePayment'), invoiceId: idSchema, accountId: idSchema }),
  z.strictObject({ ...commandBase, type: z.literal('createRule'), id: idSchema, name, enabled: z.boolean(), basisPoints: z.number().int().min(0).max(10_000), sourceIds: z.array(idSchema).min(1), mode: z.enum(['suggest', 'reserve']) }),
  z.strictObject({ ...commandBase, type: z.literal('settleContribution'), contributionId: idSchema, categoryId: idSchema.optional(), date: dateSchema, action: z.enum(['pay', 'cancel']) }),
]);
export type Command = z.infer<typeof commandSchema>;
