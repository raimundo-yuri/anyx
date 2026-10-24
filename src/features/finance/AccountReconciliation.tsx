import { useMemo, useState, type FormEvent } from 'react';
import type { State } from '../../domain/model';
import { FinanceError } from '../../domain/errors';
import { parseBRL } from '../../domain/money';
import { appConfig } from '../../config/app';
import { accountReconciliation } from '../../application/reconciliation';
import { displayDate, formatMoney, localToday } from '../../application/finance-view';
import { userError } from '../../application/user-error';
import { FinanceDialog } from './FinanceDialog';
import { Field } from './Forms';
import styles from './Finance.module.css';

const today = () => localToday(appConfig.timeZone);

export function AccountReconciliation({ state, account, onClose }: { state: State; account: State['accounts'][number]; onClose: () => void }) {
  const [cutoff, setCutoff] = useState(today), [statementText, setStatementText] = useState('');
  const [request, setRequest] = useState<{ cutoff: string; balance: number } | null>(null);
  const [error, setError] = useState('');
  const comparison = useMemo(() => {
    if (!request) return null;
    try { return { result: accountReconciliation(state, account.id, request.cutoff, request.balance), error: '' }; }
    catch (reason) { return { result: null, error: userError(reason) }; }
  }, [state, account.id, request]);
  function compare(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (cutoff > today()) throw new FinanceError('Compare com um extrato de uma data até hoje.');
      const balance = parseBRL(statementText);
      accountReconciliation(state, account.id, cutoff, balance);
      setRequest({ cutoff, balance });
    } catch (reason) { setRequest(null); setError(userError(reason)); }
  }
  const result = comparison?.result;
  return <FinanceDialog title="Conferir saldo com extrato" busy={false} onClose={onClose}>
    <p className={styles.formIntro}>Compare o saldo de {account.name} com o saldo final do extrato na mesma data. Use o saldo da conta, sem limite de crédito ou aplicações separadas. Esta conferência não altera os registros.</p>
    <form onSubmit={compare}>
      <fieldset className={styles.fields}>
        <Field label="Data de corte do extrato"><input type="date" required min={account.openedOn} max={today()} value={cutoff} onChange={event => { setCutoff(event.target.value); setRequest(null); setError(''); }} /></Field>
        <Field label="Saldo final no extrato (R$)"><input autoFocus required inputMode="decimal" placeholder="Ex.: 1.234,56 ou -50,00" value={statementText} onChange={event => { setStatementText(event.target.value); setRequest(null); setError(''); }} /></Field>
      </fieldset>
      {(error || comparison?.error) && <p className={styles.error} role="alert">{error || comparison?.error}</p>}
      <div className={styles.formActions}><button className={styles.secondary} type="button" onClick={onClose}>Fechar</button><button className={styles.primary} type="submit">Comparar saldos</button></div>
    </form>
    {result && <section style={{ marginTop: 24 }} aria-label="Resultado da conferência">
      <h3 className={styles.subheading}>Até o fim de {displayDate(result.cutoff)}</h3>
      <div className={styles.metrics} style={{ marginTop: 18 }}>
        <div><span>Saldo calculado</span><strong>{formatMoney(result.calculatedBalance)}</strong><small>Lançamentos desta conta até a data de corte.</small></div>
        <div><span>Saldo no extrato</span><strong>{formatMoney(result.statementBalance)}</strong><small>Valor informado por você.</small></div>
        <div><span>Diferença</span><strong>{formatMoney(result.difference)}</strong><small>Extrato menos saldo calculado.</small></div>
      </div>
      <p className={result.difference === 0 ? styles.success : styles.notice} role="status">{result.difference === 0 ? 'Os saldos coincidem na data escolhida. Confira também os lançamentos: saldos iguais podem esconder diferenças que se compensam.' : `O extrato mostra ${formatMoney(Math.abs(result.difference))} ${result.difference > 0 ? 'a mais' : 'a menos'} que o saldo calculado. Confira o saldo inicial e procure lançamentos faltantes, duplicados ou com data/valor diferente.`}</p>
      <p className={styles.hint}>Para corrigir um registro incorreto, use Movimentações e revise o lançamento. A diferença não é classificada automaticamente como receita ou despesa. O extrato não foi acessado pelo aplicativo; esta comparação e os valores digitados não são salvos ao fechar.</p>
      <h3 className={styles.sectionTitle}>Movimentações para conferir · {result.movements.length}</h3>
      {!result.movements.length ? <p className={styles.hint}>Não há lançamentos de caixa nesta conta até a data escolhida.</p> : <ul className={styles.detailList} aria-label="Movimentações da conta até o corte">{result.movements.map(movement => <li key={movement.id}>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{movement.description}<small>{displayDate(movement.date)} · {movement.label}{movement.reversed ? ' · Estornada' : ''}</small>{movement.originalDescription && <small>Original: {movement.originalDescription}</small>}</span>
        <span style={{ flexShrink: 1, textAlign: 'right', overflowWrap: 'anywhere' }}>{movement.cashChange > 0 ? '+' : ''}{formatMoney(movement.cashChange)}</span>
      </li>)}</ul>}
    </section>}
  </FinanceDialog>;
}
