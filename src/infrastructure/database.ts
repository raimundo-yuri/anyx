import Dexie, { type Table } from 'dexie';
import { type State, stateSchema, tableNames } from '../domain/model';
import { execute } from '../domain/engine';
import { assertState } from '../domain/integrity';
import { FinanceError } from '../domain/errors';
import type { FinanceRepository } from '../application/finance-repository';

export class FinanceDatabase extends Dexie {
  constructor(name = 'dexfin') {
    super(name);
    this.version(1).stores({
      accounts: 'id', categories: 'id, kind', people: 'id', sources: 'id', cards: 'id',
      invoices: 'id, cardId, &[cardId+cycle]', operations: 'id, date, kind',
      entries: 'id, operationId, [ledger+referenceId]', purchases: 'id, operationId, invoiceId',
      splits: 'id, purchaseId, personId', receivables: 'id, &splitId, personId',
      reserves: 'id, accountId, &contributionId', rules: 'id',
      contributions: 'id, &[incomeId+ruleId], status', receipts: 'id',
    });
    this.version(2).stores({
      installments: 'id, purchaseId, invoiceId, &[purchaseId+index]',
      receivableSchedules: 'id, receivableId, &[receivableId+index]', goals: 'id, accountId',
      budgets: 'id, &[categoryId+month]', forecasts: 'id, date, recurringId',
      recurrings: 'id', investments: 'id', loans: 'id, personId',
    }).upgrade(async transaction => {
      const purchases = await transaction.table('purchases').toArray();
      if (purchases.length) await transaction.table('installments').bulkPut(purchases.map(purchase => ({ id: purchase.id, createdAt: purchase.createdAt, purchaseId: purchase.id, invoiceId: purchase.invoiceId, index: 1, amount: purchase.amount })));
    });
    this.version(3).stores({ operations: 'id, date, kind, relatedId' });
    this.version(4).stores({ categories: 'id, kind, parentId' });
    this.version(5).stores({ purchaseRefunds: 'id, &operationId, purchaseId, invoiceId', refundAllocations: 'id, refundId, splitId, &[refundId+splitId]' });
    // Do not silently close a stale tab and let it keep pretending writes are available.
    this.on('versionchange', () => { this.close(); });
  }
  rows<K extends keyof State>(name: K): Table<State[K][number], string> { return this.table<State[K][number], string>(name); }
}

export class IndexedDbFinanceRepository implements FinanceRepository {
  constructor(readonly database: FinanceDatabase = new FinanceDatabase()) {}

  private raw(): Promise<unknown> {
    // Keep the transaction context through the shared read used by load/recovery.
    return Dexie.Promise.all(tableNames.map(key => this.database.rows(key).toArray().then(rows => [key, rows] as const)))
      .then(rows => Object.fromEntries(rows));
  }
  private async load(): Promise<State> {
    const state = stateSchema.parse(await this.raw());
    assertState(state);
    return state;
  }
  read(): Promise<State> {
    return this.database.transaction('r', this.database.tables, () => this.load());
  }
  /** A diagnostic snapshot never bypasses validation of a replacement backup. */
  captureRecovery(): Promise<string> {
    return this.database.transaction('r', this.database.tables, async () => JSON.stringify(await this.raw()));
  }
  async recover(input: unknown, expectedSnapshot: string): Promise<void> {
    const replacement = stateSchema.parse(input); assertState(replacement);
    await this.database.transaction('rw', this.database.tables, async () => {
      const current = await this.raw();
      if (JSON.stringify(current) !== expectedSnapshot) throw new FinanceError('Os dados mudaram. Valide o backup e revise a prévia novamente.');
      let invalid = false;
      try { assertState(stateSchema.parse(current)); } catch { invalid = true; }
      if (!invalid) throw new FinanceError('Os dados locais estão válidos. Tente carregar novamente e use a restauração em Relatórios e backup.');
      await this.writeReplacement(replacement);
    });
  }
  private async writeReplacement(replacement: State): Promise<void> {
    for (const name of tableNames) { await this.database.rows(name).clear(); if (replacement[name].length) await this.database.rows(name).bulkPut(replacement[name]); }
  }
  async replace(input: unknown, expectedState: string): Promise<void> {
    const replacement = stateSchema.parse(input); assertState(replacement);
    await this.database.transaction('rw', this.database.tables, async () => {
      if (JSON.stringify(await this.load()) !== expectedState) throw new FinanceError('Os dados mudaram em outra aba. Revise a prévia novamente antes de restaurar.');
      await this.writeReplacement(replacement);
    });
  }
  async executeBatch(commands: readonly unknown[]): Promise<void> {
    await this.database.transaction('rw', this.database.tables, async () => {
      for (const command of commands) await this.execute(command);
    });
  }
  async executeReviewed(command: unknown, expectedState: string): Promise<{ resultId: string; replayed: boolean }> {
    return this.database.transaction('rw', this.database.tables, async () => {
      if (JSON.stringify(await this.load()) !== expectedState) throw new FinanceError('Os dados mudaram em outra aba. Recalcule e revise a prévia antes de confirmar.');
      return this.execute(command);
    });
  }
  execute(command: unknown): Promise<{ resultId: string; replayed: boolean }> {
    return this.database.transaction('rw', this.database.tables, async () => {
      const previous = await this.load();
      const result = execute(previous, command, { now: new Date().toISOString(), newId: () => crypto.randomUUID() });
      if (!result.replayed) {
        // Append financial history; update only mutable records such as contribution status.
        await Promise.all(tableNames.map(async name => {
          const existing = new Map(previous[name].map(row => [row.id, JSON.stringify(row)]));
          const changed = result.state[name].filter(row => existing.get(row.id) !== JSON.stringify(row));
          if (changed.length) await this.database.rows(name).bulkPut(changed);
        }));
      }
      return { resultId: result.resultId, replayed: result.replayed };
    });
  }
}

export const localRepository = new IndexedDbFinanceRepository();
