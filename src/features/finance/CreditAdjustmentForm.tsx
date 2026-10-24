import { useEffect, useRef, useState, type FormEvent } from 'react';
import { commandSchema, type Command, type State } from '../../domain/model';
import { execute } from '../../domain/engine';
import { refundedSplit } from '../../domain/card-refunds';
import { balance, summary } from '../../domain/queries';
import { parseBRL, sum } from '../../domain/money';
import { FinanceError } from '../../domain/errors';
import { userError } from '../../application/user-error';
import { displayDate, formatMoney } from '../../application/finance-view';
import { localRepository } from '../../infrastructure/database';
import { FinanceDialog } from './FinanceDialog';
import { Field } from './Forms';
import { today } from './finance-fields';
import styles from './Finance.module.css';

export type CreditAdjustment = { mode: 'purchaseRefund' | 'cardCreditUse' | 'personRefund'; targetId?: string };
type Preview = { command: Command; snapshot: string; after: State };
export function CreditAdjustmentForm({ state, mode, targetId, onClose, onSaved }: CreditAdjustment & { state: State; onClose: () => void; onSaved: () => void }) {
  const [key] = useState(() => crypto.randomUUID());
  const [purchaseId, setPurchaseId] = useState(targetId ?? ''), [invoiceId, setInvoiceId] = useState('');
  const [date, setDate] = useState(today), [description, setDescription] = useState('');
  const [amount, setAmount] = useState(''), [accountId, setAccountId] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (preview) { previewHeading.current?.focus(); previewHeading.current?.scrollIntoView({ block: 'start' }); } }, [preview]);
  const title = mode === 'purchaseRefund' ? 'Registrar devolução de compra' : mode === 'cardCreditUse' ? 'Aplicar crédito em fatura' : 'Devolver dinheiro à pessoa';
  const purchase = state.purchases.find(item => item.id === purchaseId);
  const owner = (personId?: string) => personId ? state.people.find(item => item.id === personId)?.name ?? '' : '';
  const splits = state.splits.filter(item => item.purchaseId === purchase?.id).sort((a, b) => Number(!!a.personId) - Number(!!b.personId) || owner(a.personId).localeCompare(owner(b.personId), 'pt-BR') || a.id.localeCompare(b.id));
  const cardId = state.invoices.find(item => item.id === purchase?.invoiceId)?.cardId;
  const invoice = state.invoices.find(item => item.id === targetId);
  const receivable = state.receivables.find(item => item.id === targetId);
  const stale = !!preview && preview.snapshot !== JSON.stringify(state);
  function change(work: () => void) { work(); setPreview(null); setConfirmed(false); setError(''); }
  function review(event: FormEvent) {
    event.preventDefault(); setError(''); setPreview(null); setConfirmed(false);
    try {
      if (date > today()) throw new FinanceError('Informe a data efetiva até hoje.');
      let data: Record<string, unknown> = { key, type: mode, date, description };
      if (mode === 'purchaseRefund') {
        const parts = splits.map(item => ({ splitId: item.id, amount: parseBRL(allocations[item.id] || '0,00') }));
        if (parts.some(item => item.amount < 0)) throw new FinanceError('Valores devolvidos não podem ser negativos.');
        data = { ...data, purchaseId, invoiceId, amount: sum(parts.map(item => item.amount)), allocations: parts.filter(item => item.amount > 0) };
      } else data = { ...data, amount: parseBRL(amount), ...(mode === 'cardCreditUse' ? { invoiceId: targetId } : { receivableId: targetId, accountId }) };
      const command = commandSchema.parse(data);
      const result = execute(state, command, { now: new Date().toISOString(), newId: () => crypto.randomUUID() });
      setPreview({ command, snapshot: JSON.stringify(state), after: result.state });
    } catch (reason) { setError(userError(reason)); }
  }
  async function save() {
    if (!preview || !confirmed || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await localRepository.executeReviewed(preview.command, preview.snapshot); onSaved(); }
    catch (reason) { setError(userError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  const totals = preview ? summary(preview.after) : null;
  const creditedInvoice = state.invoices.find(item => item.id === (mode === 'purchaseRefund' ? invoiceId : targetId));
  return <FinanceDialog title={title} busy={busy} onClose={onClose}>
    <p className={styles.formIntro}>{mode === 'purchaseRefund' ? 'Registre somente uma devolução comercial já creditada pelo emissor. A compra e as parcelas originais ficam preservadas. O crédito reduz a fatura escolhida até zero; o excedente fica no cartão. Não use este fluxo para parcelas simplesmente canceladas, crédito direto em conta ou contestação em análise.' : mode === 'cardCreditUse' ? `Use somente o crédito efetivamente compensado nesta fatura. Crédito disponível neste cartão: ${formatMoney(balance(state, 'cardCredit', invoice?.cardId))}. Isso não cria despesa nem pagamento em dinheiro.` : `Registre somente o dinheiro efetivamente devolvido a ${state.people.find(item => item.id === receivable?.personId)?.name ?? 'esta pessoa'}. A devolver nesta compra: ${formatMoney(balance(state, 'personPayable', targetId))}. Isso liquida uma obrigação, sem nova despesa.`}</p>
    <form onSubmit={review}>
      <fieldset className={styles.fields} disabled={busy}>
        {mode === 'purchaseRefund' ? <>
          <Field label="Compra devolvida"><select required value={purchaseId} onChange={event => change(() => {
            const selected = state.purchases.find(item => item.id === event.target.value);
            setPurchaseId(event.target.value); setInvoiceId(selected?.invoiceId ?? ''); setAllocations({});
          })}><option value="">Selecione a compra</option>{state.purchases.map(item => <option key={item.id} value={item.id}>{state.operations.find(operation => operation.id === item.operationId)?.description} · {displayDate(state.operations.find(operation => operation.id === item.operationId)!.date)} · {state.cards.find(card => card.id === state.invoices.find(invoice => invoice.id === item.invoiceId)?.cardId)?.name} · {formatMoney(item.amount)}</option>)}</select></Field>
          {purchase && <><Field label="Fatura que recebeu o crédito"><select required value={invoiceId} onChange={event => change(() => setInvoiceId(event.target.value))}><option value="">Selecione a fatura</option>{state.invoices.filter(item => item.cardId === cardId).map(item => <option key={item.id} value={item.id}>{state.cards.find(card => card.id === item.cardId)?.name} · {item.cycle}</option>)}</select></Field>
            <p className={styles.hint}>Informe quanto foi devolvido de cada divisão. Use zero nas partes que não receberam devolução. O app não presume rateio proporcional.</p>
            {splits.map((split, index) => <div key={split.id}><Field label={`Devolução da divisão ${index + 1} (R$)`}><input required inputMode="decimal" value={allocations[split.id] ?? '0,00'} onChange={event => change(() => setAllocations(old => ({ ...old, [split.id]: event.target.value })))} /></Field><p className={styles.hint}>{split.personId ? state.people.find(item => item.id === split.personId)?.name : 'Minha parte'} · restante devolvível: {formatMoney(split.amount - refundedSplit(state, split.id))}</p></div>)}
          </>}
        </> : <Field label="Valor (R$)"><input required inputMode="decimal" value={amount} onChange={event => change(() => setAmount(event.target.value))} /></Field>}
        {mode === 'personRefund' && <Field label="Conta da devolução"><select required value={accountId} onChange={event => change(() => setAccountId(event.target.value))}><option value="">Selecione a conta</option>{state.accounts.filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
        <Field label="Data efetiva"><input required type="date" max={today()} value={date} onChange={event => change(() => setDate(event.target.value))} /></Field>
        <Field label="Motivo ou descrição"><input required maxLength={120} value={description} onChange={event => change(() => setDescription(event.target.value))} /></Field>
        <button className={styles.secondary} type="submit">Calcular prévia</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {preview && totals && <section aria-label="Prévia da devolução ou crédito">
      <h3 ref={previewHeading} tabIndex={-1} className={styles.sectionTitle}>Depois de confirmar</h3>{mode !== 'personRefund' && creditedInvoice && <p className={styles.hint}>Fatura escolhida: {state.cards.find(item => item.id === creditedInvoice.cardId)?.name} · {creditedInvoice.cycle}. Saldo após o registro: {formatMoney(balance(preview.after, 'card', creditedInvoice.id))}.</p>}
      <ul className={styles.detailList}>{[
        ['Valor do registro', 'amount' in preview.command ? Number(preview.command.amount) : 0],
        ['Saldo em contas', totals.cash], ['Faturas pendentes', totals.invoices], ['Crédito no cartão', mode === 'personRefund' ? totals.cardCredit : balance(preview.after, 'cardCredit', creditedInvoice?.cardId)],
        ['A receber de pessoas', totals.receivables], ['A devolver a pessoas', totals.personPayable],
        ['Variação no consumo pessoal', sum([totals.expenses, -summary(state).expenses])],
      ].map(([label, value]) => <li key={String(label)}><span>{label}</span><strong>{formatMoney(Number(value))}</strong></li>)}</ul>
      {mode === 'purchaseRefund' && state.receivables.filter(item => splits.some(split => split.id === item.splitId)).map(item => <p className={styles.hint} key={item.id}>{state.people.find(person => person.id === item.personId)?.name}: a receber {formatMoney(balance(preview.after, 'receivable', item.id))}; a devolver {formatMoney(balance(preview.after, 'personPayable', item.id))}.</p>)}
      <p className={styles.notice}>Crédito no cartão não é saldo em conta. Valores a devolver às pessoas são obrigações separadas. Nenhuma receita ou contribuição é criada. {mode === 'purchaseRefund' ? 'As parcelas originais continuam devidas até a compensação/pagamento registrado. A despesa diminui na data efetiva do crédito.' : ''}</p>
      {stale && <p className={styles.error} role="alert">Os dados mudaram. Calcule e revise a prévia novamente.</p>}
      <label className={styles.checkbox}><input type="checkbox" disabled={busy || stale} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi o fato realizado, a data e todos os valores da prévia.</label>
      <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className={styles.primary} disabled={busy || !confirmed || stale} onClick={() => void save()}>{busy ? 'Salvando…' : 'Confirmar registro'}</button></div>
    </section>}
  </FinanceDialog>;
}
