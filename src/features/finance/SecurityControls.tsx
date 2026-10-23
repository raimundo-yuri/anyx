import { useState } from 'react';
import { emptyState } from '../../domain/model';
import { localRepository } from '../../infrastructure/database';
import { userError } from '../../application/user-error';
import { Field } from './Forms';
import styles from './Finance.module.css';
export function SecurityControls() {
  const [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function requestPersistence() {
    if (!navigator.storage?.persist) { setMessage('Este navegador não oferece a solicitação de armazenamento persistente. Mantenha backups.'); return; }
    try {
      const granted = await navigator.storage.persist();
      setMessage(granted ? 'O navegador concedeu armazenamento persistente. Isso não substitui backup.' : 'O navegador não concedeu armazenamento persistente. Mantenha backups.');
    } catch { setMessage('Não foi possível solicitar armazenamento persistente neste navegador.'); }
  }
  async function erase() {
    if (confirm !== 'APAGAR' || busy) return;
    setBusy(true); setMessage('');
    try { const current = await localRepository.read(); await localRepository.replace(emptyState(), JSON.stringify(current)); setConfirm(''); setMessage('Registros financeiros locais excluídos. Cópias exportadas e dados de outros dispositivos não foram alterados.'); }
    catch (error) { setMessage(userError(error)); }
    finally { setBusy(false); }
  }
  return <section className={styles.accountCard} style={{ marginTop: 20 }}><h3>Controle dos seus dados</h3><p className={styles.hint}>Quem controla o perfil do navegador pode acessar os registros locais. O backup pode ser criptografado com uma senha sua. A publicação do ambiente de desenvolvimento não faz backup dos registros do navegador.</p><button className={styles.secondary} onClick={() => void requestPersistence()}>Solicitar armazenamento persistente</button><h3>Excluir dados locais</h3><p className={styles.hint}>Exclui contas, movimentações e cadastros deste perfil/origem. A ação é irreversível sem um backup. Cópias exportadas precisam ser removidas separadamente.</p><Field label="Digite APAGAR para excluir"><input autoComplete="off" disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)} /></Field><button className={styles.secondary} disabled={confirm !== 'APAGAR' || busy} onClick={() => void erase()}>Excluir todos os registros locais</button>{message && <p role="status" className={styles.notice}>{message}</p>}</section>;
}
