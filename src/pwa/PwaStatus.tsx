import { useEffect, useState } from 'react';
import styles from '../features/finance/Finance.module.css';
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [ready, setReady] = useState(false), [message, setMessage] = useState('');
  const [reloadPending, setReloadPending] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null), [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener('beforeinstallprompt', install);
    let disposed = false, controlled = !!navigator.serviceWorker?.controller;
    const change = () => {
      if (!controlled) { controlled = true; return; }
      if (document.querySelector('dialog[open]')) {
        setReloadPending(true);
        setMessage('Uma atualização está ativa. Salve ou feche o formulário e depois recarregue a aplicação.');
      } else window.location.reload();
    };
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', change);
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then(async registration => {
        const check = () => { if (!disposed) setWaiting(registration.waiting); };
        check(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check));
        await navigator.serviceWorker.ready; if (!disposed) setReady(true);
      }).catch(() => { if (!disposed) setMessage('O cache offline não pôde ser preparado. Verifique a conexão e recarregue.'); });
    }
    return () => {
      disposed = true; window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('beforeinstallprompt', install);
      navigator.serviceWorker?.removeEventListener('controllerchange', change);
    };
  }, []);
  return <div className={styles.pwaStatus}>
    {!online && <span>Offline · registros locais continuam disponíveis.</span>}
    {ready && <span>Disponível offline neste navegador.</span>}
    {message && <span role="status">{message}</span>}
    {reloadPending && <button className={styles.secondary} onClick={() => {
      if (document.querySelector('dialog[open]')) setMessage('Salve ou feche o formulário antes de recarregar a aplicação.');
      else window.location.reload();
    }}>Recarregar aplicação</button>}
    {prompt && <button className={styles.secondary} onClick={() => { void prompt.prompt().then(() => prompt.userChoice).then(choice => { if (choice.outcome === 'accepted') setPrompt(null); }); }}>Instalar aplicativo</button>}
    {waiting && <button className={styles.secondary} onClick={() => { if (document.querySelector('dialog[open]')) setMessage('Feche o formulário antes de atualizar para preservar o que está preenchendo.'); else waiting.postMessage('ACTIVATE_UPDATE'); }}>Aplicar atualização</button>}
  </div>;
}
