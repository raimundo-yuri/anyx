import type { FinanceRepository } from './finance-repository';
import type { Command } from '../domain/model';
import { summary } from '../domain/queries';

export class FinanceService {
  constructor(private readonly repository: FinanceRepository) {}

  // Callers keep the same key for retries of the same action, including after a reload.
  submit(command: Command) { return this.repository.execute(command); }
  async overview(period?: { from: string; to: string }) { return summary(await this.repository.read(), period); }
}
