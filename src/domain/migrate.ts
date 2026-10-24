import { stateSchema, type State } from './model';
/** Add v2 tables to a valid v1 snapshot without discarding history or changing IDs. */
export function upgradeSnapshot(input: unknown): State {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return stateSchema.parse(input);
  const data = { ...input } as Record<string, unknown>;
  for (const name of ['purchaseRefunds', 'refundAllocations', 'receivableSchedules', 'goals', 'budgets', 'forecasts', 'recurrings', 'investments', 'loans']) if (!(name in data)) data[name] = [];
  if (!('installments' in data)) {
    const purchases = stateSchema.shape.purchases.parse(data.purchases);
    data.installments = purchases.map(purchase => ({ id: purchase.id, createdAt: purchase.createdAt, purchaseId: purchase.id, invoiceId: purchase.invoiceId, index: 1, amount: purchase.amount }));
  }
  return stateSchema.parse(data);
}

/** Older complete snapshots gain only the v5 tables; missing historical tables still fail. */
export function upgradeRefundSnapshot(input: unknown): State {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return stateSchema.parse(input);
  const data = { ...input } as Record<string, unknown>;
  for (const name of ['purchaseRefunds', 'refundAllocations']) if (!(name in data)) data[name] = [];
  return stateSchema.parse(data);
}
