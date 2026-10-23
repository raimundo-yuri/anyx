import { liveQuery } from 'dexie';
import { localRepository } from './database';
import type { State } from '../domain/model';
export function observeFinance(next: (state: State) => void, error: () => void) {
  const subscription = liveQuery(() => localRepository.read()).subscribe({ next, error });
  return () => subscription.unsubscribe();
}
