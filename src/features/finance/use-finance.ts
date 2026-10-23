import { useEffect, useRef, useState } from 'react';
import { commandSchema, type State } from '../../domain/model';
import { FinanceService } from '../../application/finance-service';
import { localRepository } from '../../infrastructure/database';
import { observeFinance } from '../../infrastructure/observe-finance';
import { userError } from '../../application/user-error';

const service = new FinanceService(localRepository);

export function useFinance() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => observeFinance(value => { setState(value); setError(''); }, () => {
    setError('Não foi possível carregar os dados. Não limpe o navegador; tente novamente.');
  }), [attempt]);
  return { state, error, retry: () => { setError(''); setState(null); setAttempt(value => value + 1); } };
}

/** Keep the same operation key after an uncertain failure, provided the payload is unchanged. */
export function useCommand(onSuccess: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const previous = useRef<{ payload: string; key: string } | null>(null);
  async function submit(build: () => Record<string, unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const data = build(), payload = JSON.stringify(data);
      if (previous.current?.payload !== payload) previous.current = { payload, key: crypto.randomUUID() };
      await service.submit(commandSchema.parse({ ...data, key: previous.current!.key }));
      onSuccess();
    } catch (reason) { setError(userError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  return { submit, busy, error, clearError: () => setError('') };
}
