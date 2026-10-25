import { stateSchema, type State } from '../domain/model';
import { assertState } from '../domain/integrity';
import { FinanceError } from '../domain/errors';
import { CLOUD_FORMAT, MAX_CLOUD_BATCH } from '../application/cloud-contract';
import { authGeneration, cloudRequest, onCloudClear } from './cloud-session';

export class RemoteFinanceRepository {
  private state: State | null = null;
  private revision: number | undefined;
  private flight: Promise<State> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private observers = new Set<{ next: (state: State) => void; error: () => void }>();
  private timer: number | undefined;
  private statusObservers = new Set<() => void>();
  status = { connected: false, checkedAt: '' };
  constructor() { onCloudClear(() => this.clear()); }
  clear() { this.state = null; this.revision = undefined; this.flight = null; this.status = { connected: false, checkedAt: '' }; this.statusObservers.forEach(next => next()); }
  watchStatus(next: () => void) { this.statusObservers.add(next); return () => { this.statusObservers.delete(next); }; }
  private connected(connected: boolean) { this.status = { connected, checkedAt: connected ? new Date().toISOString() : this.status.checkedAt }; this.statusObservers.forEach(next => next()); }
  private accept(data: { format: number; revision: number; state: unknown }, started: number): State {
    if (started !== authGeneration()) throw new FinanceError('A sessão mudou. Entre novamente antes de continuar.');
    if (data.format !== CLOUD_FORMAT || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new FinanceError('Atualize o aplicativo antes de acessar este formato de dados.');
    const next = stateSchema.parse(data.state); assertState(next);
    if (this.revision === undefined || data.revision >= this.revision) { this.state = next; this.revision = data.revision; this.observers.forEach(observer => observer.next(next)); }
    this.connected(true); return this.state!;
  }
  async read(): Promise<State> {
    if (this.flight) return this.flight;
    const started = authGeneration();
    const work = (async () => {
      try {
        const response = await cloudRequest(`/api/finance${this.revision === undefined ? '' : `?since=${this.revision}`}`);
        if (response.status === 304 && this.state && started === authGeneration()) { if (!this.status.connected) this.observers.forEach(item => item.next(this.state!)); this.connected(true); return this.state; }
        return this.accept(await response.json(), started);
      } catch (reason) { if (started === authGeneration()) this.connected(false); throw reason; }
    })();
    this.flight = work;
    try { return await work; } finally { if (this.flight === work) this.flight = null; }
  }
  observe(next: (state: State) => void, error: () => void) {
    const observer = { next, error }; this.observers.add(observer);
    const refresh = () => {
      const started = authGeneration();
      if (document.visibilityState !== 'hidden') void this.read().then(value => { if (started === authGeneration() && this.observers.has(observer)) next(value); }).catch(() => { if (started === authGeneration() && this.observers.has(observer)) this.observers.forEach(item => item.error()); });
    };
    refresh();
    if (this.timer === undefined) {
      this.timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') this.focus(); }, 20000);
      window.addEventListener('focus', this.focus); window.addEventListener('online', this.focus); window.addEventListener('offline', this.offline);
    }
    return () => { this.observers.delete(observer); if (!this.observers.size && this.timer !== undefined) { window.clearInterval(this.timer); this.timer = undefined; window.removeEventListener('focus', this.focus); window.removeEventListener('online', this.focus); window.removeEventListener('offline', this.offline); } };
  }
  private focus = () => { const started = authGeneration(); void this.read().catch(() => { if (started === authGeneration()) this.observers.forEach(item => item.error()); }); };
  private offline = () => { this.connected(false); this.observers.forEach(item => item.error()); };
  private write(data: unknown) {
    const started = authGeneration();
    const work = async () => { if (started !== authGeneration()) throw new FinanceError('Sua sessão mudou. Revise os dados novamente.'); const response = await cloudRequest('/api/finance', data); const result = await response.json(); this.accept(result, started); return result; };
    const result = this.queue.then(work); this.queue = result.catch(() => undefined); return result;
  }
  async execute(command: unknown): Promise<{ resultId: string; replayed: boolean }> { const result = await this.write({ action: 'commands', format: CLOUD_FORMAT, commands: [command] }); return result.results[0]; }
  async executeBatch(commands: readonly unknown[]) {
    if (commands.length > MAX_CLOUD_BATCH) throw new FinanceError(`Na nuvem, importe no máximo ${MAX_CLOUD_BATCH} lançamentos por lote. Nada foi gravado.`);
    await this.write({ action: 'commands', format: CLOUD_FORMAT, commands });
  }
  private async hash(snapshot: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot)))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
  async executeReviewed(command: unknown, expectedState: string): Promise<{ resultId: string; replayed: boolean }> { const started = authGeneration(); const expectedHash = await this.hash(expectedState); if (started !== authGeneration()) throw new FinanceError('Sua sessão mudou. Revise a prévia novamente.'); const result = await this.write({ action: 'commands', format: CLOUD_FORMAT, commands: [command], expectedHash }); return result.results[0]; }
  async replace(input: unknown, expectedState: string) { const started = authGeneration(); const expectedHash = await this.hash(expectedState); if (started !== authGeneration()) throw new FinanceError('Sua sessão mudou. Revise a prévia novamente.'); const state = stateSchema.parse(input); assertState(state); await this.write({ action: 'replace', format: CLOUD_FORMAT, state, expectedHash }); }
}
export const remoteRepository = new RemoteFinanceRepository();
