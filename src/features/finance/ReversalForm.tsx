import { useState, type FormEvent } from 'react';
import type { State } from '../../domain/model';
import { FinanceError } from '../../domain/errors';
import { sum } from '../../domain/money';
import { reversalPreview } from '../../application/reversal-preview';
import { displayDate, formatMoney, operationLabels } from '../../application/finance-view';
import { userError } from '../../application/user-error';
import { appConfig } from '../../config/app';
import { FinanceDialog } from './FinanceDialog';
import { Field } from './Forms';
import { useCommand } from './use-finance';
import styles from './Finance.module.css';

export function ReversalForm({ state, operationId, onClose, onSaved }: { state: State; operationId: string; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const { submit, busy, error } = useCommand(onSaved);
  let preview: ReturnType<typeof reversalPreview>;
  try { preview = reversalPreview(state, operationId); }
  catch (reason) { return <FinanceDialog title="Estornar lançamento" busy={false} onClose={onClose}><p role="alert" className={styles.error}>{userError(reason)}</p><button className={styles.secondary} onClick={onClose}>Fechar</button></FinanceDialog>; }
  const { original, reversal, changes, pending, paid, blockedReason, amount } = preview;
  function save(event: FormEvent) {
    event.preventDefault();
    void submit(() => {
      if (!confirmed) throw new FinanceError('Confirme que o lançamento foi registrado por engano.');
      if (blockedReason) throw new FinanceError(blockedReason);
      return { type: 'reverseMovement', operationId: original.id, reason };
    });
  }
  return <FinanceDialog title={reversal ? 'Detalhes do estorno' : 'Estornar lançamento'} busy={busy} onClose={onClose}>
    <p className={styles.formIntro}>O estorno de correção anula integralmente um registro feito por engano e preserva o original no histórico. O ajuste usa a data original para corrigir os indicadores daquele período.</p>
    <section className={styles.accountCard} aria-label="Lançamento original"><h3>{original.description}</h3><p>{operationLabels[original.kind]} · {displayDate(original.date)} · {formatMoney(amount)}</p></section>
    <ul className={styles.detailList} aria-label="Efeito do estorno nas contas">{changes.map(item => <li key={item.account.id}><span>{item.account.name}<small>{reversal ? 'Ajuste registrado' : 'Ajuste a registrar'}: {item.delta > 0 ? '+' : ''}{formatMoney(item.delta)}</small></span><span className={styles.reversalBalance}><small>{reversal ? 'Saldo atual' : 'Saldo após estorno'}</small><strong>{formatMoney(item.after)}</strong></span></li>)}</ul>
    {reversal ? <>
      <div className={styles.notice}><div><strong>Motivo: {reversal.description}</strong><p className={styles.hint}>Registrado em {new Intl.DateTimeFormat(appConfig.locale, { dateStyle: 'short', timeStyle: 'short', timeZone: appConfig.timeZone }).format(new Date(reversal.createdAt))}. Data financeira: {displayDate(reversal.date)}.</p></div></div>
      {state.contributions.some(item => item.cancelledById === reversal.id) && <p className={styles.hint}>Contribuições pendentes da receita foram canceladas e suas reservas liberadas. Pagamentos já realizados permanecem registrados.</p>}
      <button className={styles.secondary} onClick={onClose}>Fechar</button>
    </> : <form onSubmit={save}>
      {pending.length > 0 && <p className={styles.notice}>{pending.length} contribuição(ões) ainda não paga(s) desta receita será(ão) cancelada(s), liberando as reservas correspondentes.</p>}
      {paid.length > 0 && <p className={styles.notice}>Contribuições já pagas, no total de {formatMoney(sum(paid.map(item => item.amount)))}, permanecem como despesa. O estorno da receita não devolve esses pagamentos.</p>}
      {state.forecasts.some(item => item.operationId === original.id) && <p className={styles.hint}>A previsão ligada a este lançamento ficará identificada como realização estornada e permanecerá encerrada. Você pode criar uma nova previsão quando necessário.</p>}
      {blockedReason && <p role="alert" className={styles.error}>{blockedReason}</p>}
      <fieldset className={styles.fields} disabled={busy}>
        <Field label="Motivo do estorno"><textarea autoFocus required maxLength={120} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: lançamento duplicado" /></Field>
        <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo que este lançamento foi registrado por engano e revisei os efeitos do estorno.</label>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.formActions}><button className={styles.secondary} type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className={styles.primary} type="submit" disabled={busy || !confirmed || !reason.trim() || !!blockedReason}>{busy ? 'Salvando…' : 'Confirmar estorno'}</button></div>
    </form>}
  </FinanceDialog>;
}
