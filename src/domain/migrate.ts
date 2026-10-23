import { stateSchema, type State } from './model';
/** Add v2 tables to a valid v1 snapshot without discarding history or changing IDs. */
export function upgradeSnapshot(input: unknown): State {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return stateSchema.parse(input);
  const data = { ...input } as Record<string, unknown>;
  for (const name of ['receivableSchedules', 'goals', 'budgets', 'forecasts', 'recurrings', 'investments', 'loans']) if (!(name in data)) data[name] = [];
  if (!('installments' in data)) {
    data.installments = Array.isArray(data.purchases) ? data.purchases.map(purchase => ({ id: purchase.id, createdAt: purchase.createdAt, purchaseId: purchase.id, invoiceId: purchase.invoiceId, index: 1, amount: purchase.amount })) : [];
  }
  return stateSchema.parse(data);
}
