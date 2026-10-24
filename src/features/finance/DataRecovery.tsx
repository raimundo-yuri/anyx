import { markBackupRestored } from '../../application/backup-status';
import { useRef, useState } from 'react';
import type { State } from '../../domain/model';
import { summary } from '../../domain/queries';
import { FinanceError } from '../../domain/errors';
import { userError } from '../../application/user-error';
import { formatMoney } from '../../application/finance-view';
import { localRepository } from '../../infrastructure/database';
import { MAX_FILE_SIZE, readBackup } from '../../portability/backup';
import { downloadFile } from '../../portability/download';
import { Field } from './Forms';
import styles from './Finance.module.css';

export function DataRecovery({ onRecovered }: { onRecovered: () => void }) {
  const [file, setFile] = useState<File | null>(null), [password, setPassword] = useState('');
  const [preview, setPreview] = useState<{ state: State; snapshot: string } | null>(null);
  const [confirm, setConfirm] = useState(false), [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  function reset() { setPreview(null); setConfirm(false); setCopied(false); }
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (reason) { setError(userError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.accountCard} style={{ marginTop: 20 }}>
    <h2 className={styles.sectionTitle}>Recuperar com um backup</h2>
    <p className={styles.hint}>Se os registros locais estiverem inconsistentes, você pode substituí-los por um backup válido. Não limpe os dados do navegador. Se o armazenamento estiver indisponível, esta recuperação também precisará aguardar o acesso voltar.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <fieldset disabled={busy} className={styles.fields}>
      <Field label="Backup para recuperação"><input type="file" accept=".json,application/json" onChange={event => { setFile(event.target.files?.[0] ?? null); reset(); }} /></Field>
      <Field label="Senha do backup para recuperação"><input type="password" autoComplete="off" value={password} onChange={event => { setPassword(event.target.value); reset(); }} /></Field>
      <button className={styles.secondary} onClick={() => void action(async () => {
        reset();
        if (!file) throw new FinanceError('Selecione um arquivo de backup.');
        if (file.size > MAX_FILE_SIZE) throw new FinanceError('O arquivo precisa ter no máximo 20 MiB.');
        const state = await readBackup(await file.text(), password);
        const snapshot = await localRepository.captureRecovery();
        setPreview({ state, snapshot });
      })}>Validar backup para recuperação</button>
      {preview && <>
        <p className={styles.notice}>Backup validado: {preview.state.accounts.length} contas, {preview.state.operations.length} operações. Caixa: {formatMoney(summary(preview.state).cash)}.</p>
        <p className={styles.hint}>Antes de substituir, baixe a cópia de diagnóstico dos registros atuais. Ela contém dados legíveis, pode conter inconsistências e serve para análise técnica; não é um backup restaurável. Guarde-a em local protegido.</p>
        <button className={styles.secondary} onClick={() => {
          downloadFile('dexfin-diagnostico.json', JSON.stringify({ format: 'dexfin-recovery', version: 1, exportedAt: new Date().toISOString(), tables: JSON.parse(preview.snapshot) }, null, 2));
          setCopied(true);
        }}>Baixar cópia de diagnóstico</button>
        <label className={styles.checkbox}><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} />Guardei a cópia de diagnóstico e entendo que o backup substituirá todos os dados locais.</label>
        <button className={styles.primary} disabled={!confirm || !copied} onClick={() => void action(async () => {
          await localRepository.recover(preview.state, preview.snapshot); markBackupRestored();
          setPassword(''); reset(); onRecovered();
        })}>Confirmar recuperação</button>
      </>}
    </fieldset>
  </section>;
}
