import { categoryPath } from '../../domain/categories';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { State } from '../../domain/model';
import { parseBRL, sum } from '../../domain/money';
import { invoiceDates } from '../../domain/dates';
import { formatMoney, localToday } from '../../application/finance-view';
import { appConfig } from '../../config/app';
import { FinanceDialog } from './FinanceDialog';
import { Field, FormActions } from './Forms';
import { useCommand } from './use-finance';
import styles from './Finance.module.css';

export function PurchaseForm({ state, onClose, onSaved }: { state: State; onClose: () => void; onSaved: () => void }) {
  const blank = () => ({ id: crypto.randomUUID(), owner: 'self', amount: '', categoryId: '', dueDate: '' });
  const [cardId, setCardId] = useState(state.cards.length === 1 ? state.cards[0].id : '');
  const [date, setDate] = useState(() => localToday(appConfig.timeZone));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [cycle, setCycle] = useState('');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [parts, setParts] = useState([blank()]);
  const command = useCommand(onSaved);
  const update = (id: string, key: string, value: string) => setParts(old => old.map(part => part.id === id ? { ...part, [key]: value } : part));
  let preview = 'Selecione um cartão e uma data.', splitTotal: number | null = null;
  try {
    const card = state.cards.find(item => item.id === cardId);
    if (card) { const dates = invoiceDates(date, card.closingDay, card.dueDay, cycle || undefined); preview = `Primeira fatura: ${dates.cycle.split('-').reverse().join('/')} · vencimento ${dates.dueDate.split('-').reverse().join('/')}`; }
    splitTotal = sum(parts.map(part => part.amount ? parseBRL(part.amount) : 0));
  } catch { preview = 'Confira os valores e a primeira fatura.'; }
  function save(event: FormEvent) {
    event.preventDefault(); void command.submit(() => ({ type: 'purchase', installmentCount: Number(installmentCount), cardId, description, amount: parseBRL(amount), date,
      ...(buyerId ? { buyerId } : {}), ...(cycle ? { cycle } : {}),
      splits: parts.map(part => ({ amount: parseBRL(part.amount), ...(part.owner !== 'self' ? { personId: part.owner } : {}), ...(part.categoryId ? { categoryId: part.categoryId } : {}), ...(part.dueDate && part.owner !== 'self' ? { dueDate: part.dueDate } : {}) })),
    }));
  }
  return <FinanceDialog title="Compra no cartão" busy={command.busy} onClose={onClose}><form onSubmit={save}>
    <p className={styles.formIntro}>Uma compra original, com a responsabilidade de cada pessoa. A soma das divisões precisa ser igual ao total.</p><fieldset className={styles.fields} disabled={command.busy}>
      <Field label="Cartão"><select required value={cardId} onChange={event => setCardId(event.target.value)}><option value="">Selecione</option>{state.cards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field>
      <Field label="Descrição da compra"><input required maxLength={120} value={description} onChange={event => setDescription(event.target.value)} /></Field>
      <div className={styles.formGrid}><Field label="Valor total (R$)"><input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></Field><Field label="Data da compra"><input required type="date" max={localToday(appConfig.timeZone)} value={date} onChange={event => setDate(event.target.value)} /></Field></div>
      <div className={styles.formGrid}><Field label="Comprador"><select value={buyerId} onChange={event => setBuyerId(event.target.value)}><option value="">Eu</option>{state.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Primeira fatura (opcional)"><input type="month" value={cycle} onChange={event => setCycle(event.target.value)} /></Field></div><p className={styles.hint}>{preview}. Compras no fechamento vão, por padrão, para o ciclo seguinte.</p>
      <Field label="Número de parcelas no cartão"><input type="number" required min={1} max={120} step={1} value={installmentCount} onChange={event => setInstallmentCount(event.target.value)} /></Field><p className={styles.hint}>O total vira uma única obrigação, distribuída entre as faturas. O parcelamento do reembolso de terceiros é configurado separadamente.</p><h3 className={styles.subheading}>Quem é responsável?</h3>{parts.map((part, index) => <fieldset className={styles.splitBox} key={part.id}><legend>Divisão {index + 1}</legend><div className={styles.formGrid}><Field label={`Responsável ${index + 1}`}><select value={part.owner} onChange={event => update(part.id, 'owner', event.target.value)}><option value="self">Eu</option>{state.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label={`Valor da divisão ${index + 1} (R$)`}><input required inputMode="decimal" value={part.amount} onChange={event => update(part.id, 'amount', event.target.value)} /></Field></div><Field label={`Categoria da divisão ${index + 1}`}><select required={part.owner === 'self'} value={part.categoryId} onChange={event => update(part.id, 'categoryId', event.target.value)}><option value="">{part.owner === 'self' ? 'Selecione' : 'Sem categoria pessoal'}</option>{state.categories.filter(item => item.kind === 'expense' && !item.archived).map(item => <option key={item.id} value={item.id}>{categoryPath(state.categories, item.id)}</option>)}</select></Field>{part.owner !== 'self' && <Field label={`Pagamento prometido ${index + 1} (opcional)`}><input type="date" value={part.dueDate} onChange={event => update(part.id, 'dueDate', event.target.value)} /></Field>}{parts.length > 1 && <button type="button" className={styles.secondary} onClick={() => setParts(old => old.filter(item => item.id !== part.id))}><Trash2 size={14} />Remover divisão {index + 1}</button>}</fieldset>)}
      <button type="button" className={styles.secondary} disabled={parts.length >= 100} onClick={() => setParts(old => [...old, blank()])}><Plus size={15} />Adicionar divisão</button><p className={styles.hint}>Total dividido: {splitTotal === null ? 'confira os valores' : formatMoney(splitTotal)}. As divisões de terceiros não são sua despesa.</p>
    </fieldset>{command.error && <p className={styles.error} role="alert">{command.error}</p>}<FormActions busy={command.busy} onClose={onClose} disabled={!state.cards.length} />
  </form></FinanceDialog>;
}
