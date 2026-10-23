import { useState } from 'react';
import { CreditCard, Pencil, Plus, Users } from 'lucide-react';
import type { State } from '../../domain/model';
import { balance, receivablePlan } from '../../domain/queries';
import { sum } from '../../domain/money';
import { displayDate, formatMoney } from '../../application/finance-view';
import { dateField, inputMoney, options, today, type DialogSpec } from './finance-fields';
import { CommandDialog } from './CommandDialog';
import { FinanceData } from './FinanceData';
import { PurchaseForm } from './PurchaseForm';
import styles from './Finance.module.css';

export function CreditWorkspace({ page }: { page: 'cards' | 'people' }) {
  return <FinanceData>{state => <CreditContent state={state} page={page} />}</FinanceData>;
}
function CreditContent({ state, page }: { state: State; page: 'cards' | 'people' }) {
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [purchase, setPurchase] = useState(false);
  const [personId, setPersonId] = useState('');
  const [notice, setNotice] = useState('');
  const close = () => { setDialog(null); setPurchase(false); };
  const saved = () => { close(); setNotice('Registro salvo. Os saldos foram atualizados.'); };
  function cardForm(card?: State['cards'][number]) {
    setDialog({ title: card ? 'Editar cartão' : 'Novo cartão', help: 'O limite é crédito disponível, nunca dinheiro em conta. Alterações de dias não reescrevem faturas existentes.', fields: [
      { name: 'name', label: 'Nome do cartão', value: card?.name }, { name: 'institution', label: 'Instituição (opcional)', optional: true, value: card?.institution },
      { name: 'limit', label: 'Limite (R$)', type: 'money', value: card ? inputMoney(card.limit) : '' },
      { name: 'closingDay', label: 'Dia de fechamento', type: 'number', min: 1, max: 31, value: String(card?.closingDay ?? 20) },
      { name: 'dueDay', label: 'Dia de vencimento', type: 'number', min: 1, max: 31, value: String(card?.dueDay ?? 28) },
    ], build: (data, id) => ({ ...data, type: card ? 'updateCard' : 'createCard', id: card?.id ?? id }) });
  }
  function personForm(person?: State['people'][number]) {
    setDialog({ title: person ? 'Editar pessoa' : 'Nova pessoa', help: 'Cadastre somente o nome necessário para identificar a responsabilidade pelas compras.', fields: [{ name: 'name', label: 'Nome da pessoa', value: person?.name }], build: (data, id) => ({ ...data, type: person ? 'renamePerson' : 'createPerson', id: person?.id ?? id }) });
  }
  function payment(type: 'invoicePayment' | 'reimbursement', id: string, pending: number) {
    setDialog({ title: type === 'invoicePayment' ? 'Pagar fatura' : 'Registrar reembolso', help: `Pendente: ${formatMoney(pending)}. Pagamentos parciais são aceitos. Não será criada nova ${type === 'invoicePayment' ? 'despesa' : 'receita'}.`, fields: [
      { name: 'accountId', label: type === 'invoicePayment' ? 'Conta de pagamento' : 'Conta de recebimento', type: 'select', options: options(state.accounts.filter(item => !item.archived)) },
      { name: 'amount', label: 'Valor (R$)', type: 'money', value: inputMoney(pending) }, dateField(),
      { name: 'description', label: 'Descrição', value: type === 'invoicePayment' ? 'Pagamento de fatura' : 'Reembolso' },
    ], build: data => ({ ...data, type, [type === 'invoicePayment' ? 'invoiceId' : 'receivableId']: id }) });
  }
  const receivables = state.receivables.filter(item => !personId || item.personId === personId);
  return <div className={styles.workspace}>
    {notice && <p className={styles.success} role="status">{notice}</p>}
    <div className={styles.toolbar}><div><span className={styles.eyebrow}>{page === 'cards' ? 'CRÉDITO COM CLAREZA' : 'CADA RESPONSABILIDADE NO SEU LUGAR'}</span><h2>{page === 'cards' ? 'Cartões e faturas' : 'Pessoas e valores a receber'}</h2></div><div className={styles.toolbarActions}>{page === 'cards' ? <><button className={styles.secondary} onClick={() => cardForm()}><Plus size={15} />Novo cartão</button><button disabled={!state.cards.length} className={styles.primary} onClick={() => setPurchase(true)}><Plus size={15} />Nova compra</button></> : <button className={styles.primary} onClick={() => personForm()}><Plus size={15} />Nova pessoa</button>}</div></div>
    {page === 'cards' ? <>
      {!state.cards.length && <div className={styles.empty}><CreditCard size={35} /><h3>Seu cartão, sem confundir com saldo</h3><p>Cadastre o cartão e registre as compras. O limite nunca será somado ao dinheiro disponível.</p><button className={styles.primary} onClick={() => cardForm()}>Cadastrar cartão</button></div>}
      <div className={styles.accountGrid}>{state.cards.map(card => {
        const invoiceIds = new Set(state.invoices.filter(item => item.cardId === card.id).map(item => item.id));
        const used = sum(state.entries.filter(item => item.ledger === 'card' && invoiceIds.has(item.referenceId)).map(item => item.side === 'credit' ? item.amount : -item.amount));
        return <article className={styles.accountCard} key={card.id}><div className={styles.accountTop}><CreditCard size={23} /><button className={styles.iconButton} aria-label={`Editar cartão ${card.name}`} onClick={() => cardForm(card)}><Pencil size={16} /></button></div><h3>{card.name}</h3><p>{card.institution || 'Cartão pessoal'} · fecha dia {card.closingDay} · vence dia {card.dueDay}</p><span className={styles.smallLabel}>OBRIGAÇÕES PENDENTES</span><strong className={styles.accountBalance}>{formatMoney(used)}</strong><p>Limite: {formatMoney(card.limit)} · disponível: {formatMoney(card.limit - used)}</p></article>;
      })}</div>
      <h2 className={styles.sectionTitle}>Faturas e histórico de pagamentos</h2>
      {!state.invoices.length && <p className={styles.hint}>As faturas serão criadas quando você registrar compras.</p>}
      <div className={styles.stack}>{[...state.invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(invoice => {
        const pending = balance(state, 'card', invoice.id);
        const card = state.cards.find(item => item.id === invoice.cardId)!;
        const payments = state.entries.filter(item => item.ledger === 'card' && item.referenceId === invoice.id && item.side === 'debit');
        const installments = state.installments.filter(item => item.invoiceId === invoice.id);
        return <section className={styles.accountCard} key={invoice.id}><div className={styles.toolbar}><div><h3>{card.name} · {invoice.cycle.split('-').reverse().join('/')}</h3><p>Fechamento {displayDate(invoice.closingDate)} · vencimento {displayDate(invoice.dueDate)} · {pending === 0 ? 'Quitada' : invoice.dueDate < today() ? 'Vencida' : 'Pendente'}</p></div><div><strong>{formatMoney(pending)}</strong>{pending > 0 && <button className={styles.primary} onClick={() => payment('invoicePayment', invoice.id, pending)}>Pagar fatura</button>}</div></div><ul className={styles.detailList}>{installments.map(item => { const purchase = state.purchases.find(purchase => purchase.id === item.purchaseId)!; const count = state.installments.filter(part => part.purchaseId === purchase.id).length; return <li key={item.id}><span>{state.operations.find(op => op.id === purchase.operationId)?.description} · {item.index}/{count}<small>Comprador: {purchase.buyerId ? state.people.find(person => person.id === purchase.buyerId)?.name : 'Eu'}</small></span><span>{formatMoney(item.amount)}</span></li>; })}{payments.map(item => <li key={item.id}><span>Pagamento · {displayDate(state.operations.find(op => op.id === item.operationId)!.date)}</span><span>− {formatMoney(item.amount)}</span></li>)}</ul></section>;
      })}</div>
    </> : <>
      <div className={styles.toolbar}><label className={styles.filterLabel}>Extrato da pessoa<select aria-label="Filtrar pessoa" value={personId} onChange={event => setPersonId(event.target.value)}><option value="">Todas as pessoas</option>{state.people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><strong>Total a receber: {formatMoney(sum(receivables.map(item => balance(state, 'receivable', item.id))))}</strong></div>
      <div className={styles.personChips}>{state.people.map(person => <button key={person.id} className={styles.secondary} onClick={() => personForm(person)}><Users size={14} />{person.name}<Pencil size={12} /></button>)}</div>
      {!receivables.length && <div className={styles.empty}><Users size={35} /><h3>Nenhum valor a receber</h3><p>Cadastre pessoas e atribua divisões a elas em Nova compra, na seção de cartões.</p></div>}
      <div className={styles.stack}>{receivables.map(item => {
        const split = state.splits.find(split => split.id === item.splitId)!;
        const purchase = state.purchases.find(purchase => purchase.id === split.purchaseId)!;
        const operation = state.operations.find(op => op.id === purchase.operationId)!;
        const pending = balance(state, 'receivable', item.id);
        const plan = receivablePlan(state, item.id);
        const due = plan.find(part => part.pending > 0)?.dueDate ?? item.dueDate;
        const reimbursements = state.entries.filter(entry => entry.ledger === 'receivable' && entry.referenceId === item.id && entry.side === 'credit');
        return <article className={styles.accountCard} key={item.id}><div className={styles.toolbar}><div><h3>{state.people.find(person => person.id === item.personId)!.name} · {operation.description}</h3><p>{displayDate(operation.date)} · original {formatMoney(item.amount)}{item.dueDate ? ` · prometido para ${displayDate(item.dueDate)}` : ' · sem data prometida'}</p></div><div><strong>{formatMoney(pending)}</strong><p>{pending === 0 ? 'Quitado' : due && due < today() ? 'Vencido' : 'Pendente'}</p>{pending > 0 && <button className={styles.primary} onClick={() => payment('reimbursement', item.id, pending)}>Registrar reembolso</button>}{!plan.length && pending === item.amount && <button className={styles.secondary} onClick={() => setDialog({ title: 'Parcelar reembolso', help: 'Plano independente das parcelas do cartão. Os pagamentos serão alocados primeiro às parcelas mais antigas. O principal a receber não será duplicado.', fields: [{ name: 'count', label: 'Número de parcelas do reembolso', type: 'number', min: 1, max: 120, value: '1' }, { name: 'firstDueDate', label: 'Primeiro vencimento', type: 'date', value: today() }], build: values => ({ ...values, receivableId: item.id, type: 'scheduleReceivable' }) })}>Parcelar reembolso</button>}</div></div><ul className={styles.detailList}>{plan.map(part => <li key={part.id}><span>Parcela {part.index} · {displayDate(part.dueDate)} · {part.pending === 0 ? 'Quitada' : part.dueDate < today() ? 'Vencida' : 'Pendente'}</span><span>{formatMoney(part.pending)} / {formatMoney(part.amount)}</span></li>)}{reimbursements.map(entry => <li key={entry.id}><span>Recebido em {displayDate(state.operations.find(op => op.id === entry.operationId)!.date)}</span><span>{formatMoney(entry.amount)}</span></li>)}</ul></article>;
      })}</div>
    </>}
    {dialog && <CommandDialog {...dialog} onClose={close} onSaved={saved} />}{purchase && <PurchaseForm state={state} onClose={close} onSaved={saved} />}
  </div>;
}
