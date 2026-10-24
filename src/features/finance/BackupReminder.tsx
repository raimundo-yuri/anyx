import { useEffect, useRef, useState } from 'react';
import type { State } from '../../domain/model';
import { appConfig } from '../../config/app';
import { observeFinance } from '../../infrastructure/observe-finance';
import { BACKUP_STATUS_EVENT, BACKUP_STATUS_KEY, backupReminderStatus, backupSignature, postponeBackupReminder, readBackupStatus, updateBackupPreferences, type BackupInterval, type BackupStatus } from '../../application/backup-status';
import { FinanceDialog } from './FinanceDialog';
import { Field } from './Forms';
import styles from './Finance.module.css';

function dateTime(value: string) {
  return new Intl.DateTimeFormat(appConfig.locale, { dateStyle: 'short', timeStyle: 'short', timeZone: appConfig.timeZone }).format(new Date(value));
}

export function BackupReminder({ mode = 'banner', onOpenBackup }: { mode?: 'banner' | 'settings'; onOpenBackup?: () => void }) {
  const [status, setStatus] = useState<BackupStatus>(readBackupStatus);
  const [state, setState] = useState<State | null>(null), [signature, setSignature] = useState<string | null>(null);
  const [signatureReady, setSignatureReady] = useState(false);
  const [now, setNow] = useState(Date.now), [configure, setConfigure] = useState(false), [message, setMessage] = useState('');
  const revision = useRef(0);

  useEffect(() => {
    const changed = () => { setStatus(readBackupStatus()); setNow(Date.now()); };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === BACKUP_STATUS_KEY) setStatus(readBackupStatus()); };
    window.addEventListener(BACKUP_STATUS_EVENT, changed); window.addEventListener('storage', storage);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.removeEventListener(BACKUP_STATUS_EVENT, changed); window.removeEventListener('storage', storage); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (mode === 'settings') return;
    let active = true;
    const unsubscribe = observeFinance(value => {
      const current = ++revision.current;
      setState(value); setSignature(null); setSignatureReady(false);
      void backupSignature(value).then(valueSignature => { if (active && current === revision.current) { setSignature(valueSignature); setSignatureReady(true); } });
    }, () => { if (active) { revision.current++; setState(null); setSignature(null); setSignatureReady(false); } });
    return () => { active = false; revision.current++; unsubscribe(); };
  }, [mode]);

  function preferences(next: { enabled?: boolean; intervalDays?: BackupInterval }) {
    const saved = updateBackupPreferences(next);
    setMessage(saved ? 'Preferência salva neste navegador.' : 'A preferência vale nesta sessão. O navegador não permitiu guardá-la para a próxima abertura.');
  }
  const settings = <>
    <p className={styles.hint}>O lembrete compara os registros atuais com a última solicitação de download. Não há cópia automática nem confirmação de que o arquivo foi guardado.</p>
    {status.lastRequested ? <p className={styles.hint}>Último download solicitado em {dateTime(status.lastRequested.at)}. Confira o arquivo na pasta de downloads e guarde-o em local protegido.</p> : <p className={styles.hint}>Ainda não há uma solicitação de download de backup registrada para os dados atuais.</p>}
    {status.restoredAt && <p className={styles.hint}>Última restauração em {dateTime(status.restoredAt)}. Ela não conta como uma nova exportação; mantenha o arquivo usado na restauração.</p>}
    <div className={styles.fields} style={{ marginTop: 16 }}>
      <label className={styles.checkbox}><input type="checkbox" checked={status.enabled} onChange={event => preferences({ enabled: event.target.checked })} />Ativar lembretes de backup neste navegador</label>
      <Field label="Intervalo do lembrete de backup"><select value={status.intervalDays} onChange={event => preferences({ intervalDays: Number(event.target.value) as BackupInterval })}><option value={7}>7 dias</option><option value={14}>14 dias</option><option value={30}>30 dias</option></select></Field>
    </div>
    <p className={styles.hint}>O aviso aparece quando há dados sem uma solicitação registrada, ou alterações posteriores a uma solicitação antiga. Sem alterações, o lembrete não insiste para gerar o mesmo arquivo.</p>
    <details className={styles.hint}><summary>Backup antes de atualizar o aplicativo</summary><p>Antes de aplicar uma nova versão, solicite um backup e confira o arquivo salvo. Feche ou salve os formulários antes de atualizar. O cache offline e a publicação do site não guardam uma cópia dos seus registros.</p></details>
    {message && <p className={styles.hint} role="status">{message}</p>}
  </>;
  if (mode === 'settings') return <section className={styles.accountCard} aria-label="Preferências de backup" style={{ marginTop: 20 }}><h3>Lembretes de backup</h3>{settings}</section>;
  const reminder = state && signatureReady ? backupReminderStatus(state, status, signature, now) : null;
  return <>
    {reminder?.shouldShow && <aside aria-label="Lembrete de backup" className={`${styles.notice} ${styles.backupReminder}`} style={{ marginTop: 20 }}><div>
      <strong>{reminder.reason === 'never' ? 'Guarde uma cópia dos seus registros' : reminder.hasChanges ? 'Há alterações para guardar em um novo backup' : 'Revise sua cópia de backup'}</strong>
      <p>{status.lastRequested ? `O último download foi solicitado há ${reminder.daysSinceRequest} dias. ${reminder.hasChanges ? 'Seus dados mudaram desde então.' : 'Não foi possível comparar os registros com a última solicitação; confira se precisa guardar uma cópia atual.'}` : 'Solicite um backup com senha em Relatórios e backup. Depois confira e guarde o arquivo; os registros do navegador podem ser perdidos ao limpar o site ou trocar de dispositivo.'}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {onOpenBackup && <button className={styles.secondary} onClick={onOpenBackup}>Abrir backup</button>}
        <button className={styles.secondary} onClick={() => { postponeBackupReminder(); setStatus(readBackupStatus()); }}>Adiar por 24 horas</button>
        <button className={styles.secondary} onClick={() => { setMessage(''); setConfigure(true); }}>Preferências</button>
      </div>
    </div></aside>}
    {configure && <FinanceDialog title="Lembretes de backup" busy={false} onClose={() => setConfigure(false)}>{settings}<button className={styles.secondary} onClick={() => setConfigure(false)}>Fechar</button></FinanceDialog>}
  </>;
}
