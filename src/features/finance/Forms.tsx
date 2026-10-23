import { Children, cloneElement, isValidElement, useId, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check } from 'lucide-react';
import type { State } from '../../domain/model';
import { parseBRL } from '../../domain/money';
import { FinanceError } from '../../domain/errors';
import { institutions } from '../../domain/catalog';
import { localToday } from '../../application/finance-view';
import { appConfig } from '../../config/app';
import { FinanceDialog } from './FinanceDialog';
import { useCommand } from './use-finance';
import styles from './Finance.module.css';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{Children.map(children, child => isValidElement<{ id?: string }>(child) && ['input', 'select', 'textarea'].includes(String(child.type)) ? cloneElement(child, { id }) : child)}</div>;
}
export function FormActions({ busy, onClose, disabled = false }: { busy: boolean; onClose: () => void; disabled?: boolean }) {
  return <div className={styles.formActions}><button className={styles.secondary} type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className={styles.primary} type="submit" disabled={busy || disabled}>{busy ? 'Salvando…' : <><Check size={16} /> Salvar</>}</button></div>;
}
const today = () => localToday(appConfig.timeZone);
function checkRealizedDate(date: string) {
  if (date > today()) throw new FinanceError('Informe uma data até hoje. Para valores previstos, use Planejamento e metas.');
}

export function AccountForm({ account, onClose, onSaved }: { account?: State['accounts'][number]; onClose: () => void; onSaved: () => void }) {
  const [id] = useState(() => account?.id ?? crypto.randomUUID());
  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [kind, setKind] = useState(account?.kind ?? 'checking');
  const [opening, setOpening] = useState('0,00');
  const [date, setDate] = useState(today);
  const { submit, busy, error } = useCommand(onSaved);
  const save = (event: FormEvent) => {
    event.preventDefault();
    void submit(() => {
      if (account) return { type: 'updateAccount', id, name, institution, kind };
      checkRealizedDate(date);
      return { type: 'createAccount', id, name, institution, kind, date, openingBalance: parseBRL(opening) };
    });
  };
  return <FinanceDialog title={account ? 'Editar conta' : 'Nova conta'} onClose={onClose} busy={busy}><form onSubmit={save}>
    <p className={styles.formIntro}>Cadastre uma conta bancária ou sua carteira. Limite de cartão não é saldo.</p>
    <fieldset disabled={busy} className={styles.fields}>
      <Field label="Nome da conta"><input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Minha conta Nubank" /></Field>
      <div className={styles.formGrid}><Field label="Instituição (opcional)"><input list="institutions" value={institution} maxLength={120} onChange={event => setInstitution(event.target.value)} placeholder="Escolha ou digite" /><datalist id="institutions">{institutions.map(item => <option key={item} value={item} />)}</datalist></Field>
      <Field label="Tipo de conta"><select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="checking">Conta corrente</option><option value="payment">Conta de pagamento</option><option value="savings">Poupança</option><option value="cash">Dinheiro em espécie</option></select></Field></div>
      {!account && <><div className={styles.formGrid}><Field label="Saldo inicial (R$)"><input required inputMode="decimal" value={opening} onChange={event => setOpening(event.target.value)} placeholder="0,00" /></Field><Field label="Data de abertura"><input type="date" required max={today()} value={date} onChange={event => setDate(event.target.value)} /></Field></div><p className={styles.hint}>Informe o saldo na data escolhida. Valores negativos são aceitos para representar um saldo devedor. O saldo inicial não é receita.</p></>}
      {account && <p className={styles.hint}>Editar o cadastro não altera o saldo inicial ou o histórico financeiro.</p>}
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}<FormActions busy={busy} onClose={onClose} />
  </form></FinanceDialog>;
}

export function CatalogForm({ entity, record, onClose, onSaved }: { entity: 'category' | 'source'; record?: { id: string; name: string; kind?: 'income' | 'expense' }; onClose: () => void; onSaved: () => void }) {
  const [id] = useState(() => record?.id ?? crypto.randomUUID());
  const [name, setName] = useState(record?.name ?? '');
  const [kind, setKind] = useState<'income' | 'expense'>(record?.kind ?? 'expense');
  const { submit, busy, error } = useCommand(onSaved);
  const title = entity === 'category' ? (record ? 'Editar categoria' : 'Nova categoria') : (record ? 'Editar fonte de receita' : 'Nova fonte de receita');
  function save(event: FormEvent) {
    event.preventDefault(); void submit(() => record ? { type: entity === 'category' ? 'renameCategory' : 'renameSource', id, name } :
      entity === 'category' ? { type: 'createCategory', id, name, kind } : { type: 'createSource', id, name });
  }
  return <FinanceDialog title={title} busy={busy} onClose={onClose}><form onSubmit={save}>
    <p className={styles.formIntro}>{entity === 'source' ? 'Uma fonte identifica de onde vem a renda. Cadastrá-la não registra uma receita.' : 'Dê um nome que faça sentido para você. Categorias organizam os registros, sem movimentar dinheiro.'}</p>
    <fieldset disabled={busy} className={styles.fields}>
      <Field label={entity === 'source' ? 'Nome da fonte' : 'Nome da categoria'}><input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={entity === 'source' ? 'Ex.: Estágio' : 'Ex.: Alimentação'} /></Field>
      {entity === 'category' && <Field label="Natureza"><select value={kind} disabled={!!record} onChange={event => setKind(event.target.value as typeof kind)}><option value="expense">Despesa</option><option value="income">Receita</option></select></Field>}
      {record && <p className={styles.hint}>A alteração do nome preserva os identificadores e todos os vínculos do histórico.</p>}
    </fieldset>{error && <p className={styles.error} role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} />
  </form></FinanceDialog>;
}

export function MovementForm({ state, onClose, onSaved }: { state: State; onClose: () => void; onSaved: () => void }) {
  const accounts = state.accounts.filter(item => !item.archived);
  const [draft, setDraft] = useState({ type: 'expense' as 'expense' | 'income' | 'transfer', amount: '', date: today(), description: '', accountId: accounts.length === 1 ? accounts[0].id : '', toId: '', incomeCategoryId: '', expenseCategoryId: '', sourceId: '' });
  const update = (field: keyof typeof draft, value: string) => setDraft(old => ({ ...old, [field]: value }));
  const { submit, busy, error } = useCommand(onSaved);
  const categories = state.categories.filter(item => !item.archived && item.kind === draft.type);
  const sources = state.sources.filter(item => !item.archived);
  const unavailable = accounts.length === 0 || (draft.type === 'transfer' ? accounts.length < 2 : !categories.length || (draft.type === 'income' && !sources.length));
  function save(event: FormEvent) {
    event.preventDefault(); void submit(() => {
      checkRealizedDate(draft.date);
      const amount = parseBRL(draft.amount);
      if (amount <= 0) throw new FinanceError('O valor da movimentação deve ser maior que zero.');
      const base = { amount, date: draft.date, description: draft.description };
      if (draft.type === 'transfer') return { ...base, type: 'transfer', fromId: draft.accountId, toId: draft.toId };
      if (draft.type === 'income') return { ...base, type: 'income', accountId: draft.accountId, categoryId: draft.incomeCategoryId, sourceId: draft.sourceId };
      return { ...base, type: 'expense', accountId: draft.accountId, categoryId: draft.expenseCategoryId };
    });
  }
  return <FinanceDialog title="Nova movimentação" busy={busy} onClose={onClose}><form onSubmit={save}>
    <fieldset disabled={busy} className={styles.fields}>
      <div className={styles.segment} role="group" aria-label="Tipo de movimentação">{([
        ['expense', 'Despesa', ArrowUpRight], ['income', 'Receita', ArrowDownLeft], ['transfer', 'Transferência', ArrowLeftRight],
      ] as const).map(([type, label, Icon]) => <button key={type} type="button" aria-pressed={draft.type === type} className={draft.type === type ? styles.selected : ''} onClick={() => update('type', type)}><Icon size={15} />{label}</button>)}</div>
      <p className={styles.hint}>{draft.type === 'transfer' ? 'Entre suas próprias contas: não gera renda nem despesa.' : draft.type === 'income' ? 'Registre somente valores já recebidos. Para receitas previstas, use Planejamento e metas.' : 'Registre somente despesas já pagas com saldo em conta. Para compras no cartão, use Cartões e faturas.'}</p>
      <Field label="Valor (R$)"><input className={styles.amountInput} autoFocus required inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={event => update('amount', event.target.value)} /></Field>
      <Field label="Descrição"><input required maxLength={120} placeholder={draft.type === 'income' ? 'Ex.: Bolsa de estágio' : draft.type === 'transfer' ? 'Ex.: Dinheiro para a carteira' : 'Ex.: Almoço'} value={draft.description} onChange={event => update('description', event.target.value)} /></Field>
      <div className={styles.formGrid}><Field label={draft.type === 'transfer' ? 'Conta de origem' : 'Conta'}><select required value={draft.accountId} onChange={event => update('accountId', event.target.value)}><option value="">Selecione uma conta</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Data"><input type="date" required max={today()} value={draft.date} onChange={event => update('date', event.target.value)} /></Field></div>
      {draft.type === 'transfer' ? <Field label="Conta de destino"><select required value={draft.toId} onChange={event => update('toId', event.target.value)}><option value="">Selecione o destino</option>{accounts.map(item => <option disabled={item.id === draft.accountId} key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : <Field label="Categoria"><select required value={draft.type === 'income' ? draft.incomeCategoryId : draft.expenseCategoryId} onChange={event => update(draft.type === 'income' ? 'incomeCategoryId' : 'expenseCategoryId', event.target.value)}><option value="">Selecione uma categoria</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      {draft.type === 'income' && <Field label="Fonte de receita"><select required value={draft.sourceId} onChange={event => update('sourceId', event.target.value)}><option value="">Selecione a fonte</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      {unavailable && <p className={styles.notice}>{draft.type === 'transfer' ? 'Cadastre pelo menos duas contas ativas para transferir.' : 'Cadastre uma conta e categorias ativas desta natureza em “Categorias e fontes”. Para receitas, cadastre também uma fonte.'}</p>}
    </fieldset>{error && <p className={styles.error} role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} disabled={unavailable} />
  </form></FinanceDialog>;
}
