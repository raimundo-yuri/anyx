import type { State } from '../domain/model';

/** A command and every related write must commit or roll back together. */
export interface FinanceRepository {
  read(): Promise<State>;
  execute(command: unknown): Promise<{ resultId: string; replayed: boolean }>;
}
