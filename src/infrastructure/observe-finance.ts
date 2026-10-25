import { cloudMode } from '../config/deployment';
import { remoteRepository } from './remote-repository';
import { liveQuery } from 'dexie';
import { localRepository } from './database';
import type { State } from '../domain/model';
export function observeFinance(next: (state: State) => void, error: () => void) {
  if (cloudMode) return remoteRepository.observe(next, error);
  const subscription = liveQuery(() => localRepository.read()).subscribe({ next, error });
  return () => subscription.unsubscribe();
}
