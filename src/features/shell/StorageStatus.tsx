import { cloudMode } from '../../config/deployment';
import { remoteRepository } from '../../infrastructure/remote-repository';
import { useEffect, useState } from 'react';
import { repository } from '../../infrastructure/repository';

export function StorageStatus() { return cloudMode ? <CloudStorageStatus /> : <LocalStorageStatus />; }
function LocalStorageStatus() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    repository.read().then(
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

function CloudStorageStatus() {
  const [status, setStatus] = useState(remoteRepository.status), [busy, setBusy] = useState(false);
  useEffect(() => remoteRepository.watchStatus(() => setStatus(remoteRepository.status)), []);
  return <div role="status" aria-label="Estado da sincronização">{status.connected ? `Conferido na nuvem às ${new Date(status.checkedAt).toLocaleTimeString('pt-BR')}.` : 'Reconecte para consultar e salvar na nuvem.'} <button type="button" disabled={busy} onClick={() => { setBusy(true); void remoteRepository.read().catch(() => undefined).finally(() => setBusy(false)); }}>Atualizar dados</button></div>;
}
