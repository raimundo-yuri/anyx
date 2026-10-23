import { useEffect, useState } from 'react';
import { localRepository } from '../../infrastructure/database';

export function StorageStatus() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    localRepository.read().then(
      () => { if (active) setStatus('ready'); },
      () => { if (active) setStatus('error'); },
    );
    return () => { active = false; };
  }, [attempt]);
  return <div role="status" aria-label="Estado do armazenamento" aria-live="polite">
    {status === 'loading' ? 'Verificando armazenamento local…' : status === 'ready' ?
      'IndexedDB disponível · dados mantidos neste navegador' :
      <>Não foi possível acessar os dados locais. Não limpe o navegador; tente novamente. Se o problema persistir, procure suporte antes de alterar os dados do navegador. <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></>}
  </div>;
}
