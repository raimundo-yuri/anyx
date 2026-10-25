import { useId, useRef, useState } from 'react';
import type { State } from '../../domain/model';
import { FinanceError } from '../../domain/errors';
import { sum } from '../../domain/money';
import { categoryPath } from '../../domain/categories';
import { formatMoney, displayDate } from '../../application/finance-view';
import { userError } from '../../application/user-error';
import { repository } from '../../infrastructure/repository';
import { MAX_FILE_SIZE } from '../../portability/backup';
import { decodeOfx, parseOfx, previewOfx, type OfxClassification, type OfxStatement } from '../../portability/ofx';
import { Field } from './Forms';
import styles from './Finance.module.css';
import ofxStyles from './OfxImport.module.css';

const pageSize = 10;
export function OfxImport({ state }: { state: State }) {
  const titleId = useId();
  const accounts = state.accounts.filter(item => !item.archived);
  const incomeCategories = state.categories.filter(item => item.kind === 'income' && !item.archived);
  const expenseCategories = state.categories.filter(item => item.kind === 'expense' && !item.archived);
  const sources = state.sources.filter(item => !item.archived);
  const [statement, setStatement] = useState<OfxStatement | null>(null), [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : ''), [accountChecked, setAccountChecked] = useState(false);
  const [incomeCategoryId, setIncomeCategoryId] = useState(''), [expenseCategoryId, setExpenseCategoryId] = useState(''), [sourceId, setSourceId] = useState(sources.length === 1 ? sources[0].id : '');
  const [choices, setChoices] = useState<OfxClassification[]>([]), [page, setPage] = useState(0);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewOfx>> | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  function resetPreview() { setPreview(null); setConfirmed(false); }
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (reason) { setError(userError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  function updateChoice(index: number, change: Partial<OfxClassification>) {
    resetPreview();
    setChoices(old => old.map((choice, current) => current === index ? { ...choice, ...change } : choice));
  }
  const pending = choices.filter(item => item.action === 'pending').length;
  const pages = Math.max(1, Math.ceil(choices.length / pageSize));
  return <section className={styles.accountCard} style={{ marginTop: 20 }} aria-labelledby={titleId}>
    <div className={ofxStyles.header}><h2 id={titleId} className={styles.sectionTitle}>Importar extrato OFX</h2><span className={ofxStyles.status}>Conta bancária · BRL · revisão antes de gravar</span></div>
    <p className={styles.hint}>Importe um extrato de uma conta corrente, poupança ou de pagamento, em OFX SGML 1.x ou XML 2.x. Faturas de cartão, investimentos, correções bancárias e conversão de moeda exigem outro tratamento e não são importados aqui. Até 20 MiB e 5.000 lançamentos.</p>
    <p className={styles.hint}>Classifique somente receitas realmente recebidas e despesas pessoais pagas. Transferências entre suas contas, reembolsos, pagamento de fatura e devoluções devem ser ignorados neste importador e registrados na seção apropriada. O arquivo não é enviado a nenhum serviço.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}
    <fieldset className={styles.fields} disabled={busy}>
      <Field label="Arquivo de extrato OFX"><input type="file" accept=".ofx,application/x-ofx,application/ofx" onChange={event => {
        const file = event.target.files?.[0]; setStatement(null); setChoices([]); setFileName(''); setAccountChecked(false); resetPreview();
        void action(async () => {
          if (!file) return;
          if (file.size > MAX_FILE_SIZE) throw new FinanceError('O arquivo OFX precisa ter no máximo 20 MiB.');
          const parsed = parseOfx(decodeOfx(await file.arrayBuffer()));
          setStatement(parsed); setFileName(file.name); setChoices(parsed.transactions.map(() => ({ action: 'pending' }))); setPage(0);
        });
      }} /></Field>
      {statement && <>
        <details className={ofxStyles.bank}><summary>Conta identificada no arquivo: banco {statement.bankId}, final {statement.accountNumber.slice(-4)}</summary><p className={ofxStyles.identifier}>{fileName} · agência {statement.branchId || 'não informada'} · conta {statement.accountNumber} · {statement.currency}</p></details>
        <Field label="Conta de destino do extrato OFX"><select value={accountId} onChange={event => { setAccountId(event.target.value); setAccountChecked(false); resetPreview(); }}><option value="">Selecione a conta correspondente</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
        <label className={styles.checkbox}><input type="checkbox" checked={accountChecked} onChange={event => { setAccountChecked(event.target.checked); resetPreview(); }} />Conferi a conta no arquivo e selecionei a conta correspondente no DexFin.</label>
        <div className={styles.formGrid}>
          <Field label="Categoria padrão de despesas OFX"><select value={expenseCategoryId} onChange={event => { setExpenseCategoryId(event.target.value); resetPreview(); }}><option value="">Selecione para classificar saídas comuns</option>{expenseCategories.map(category => <option key={category.id} value={category.id}>{categoryPath(state.categories, category.id)}</option>)}</select></Field>
          <Field label="Categoria padrão de receitas OFX"><select value={incomeCategoryId} onChange={event => { setIncomeCategoryId(event.target.value); resetPreview(); }}><option value="">Selecione para classificar entradas comuns</option>{incomeCategories.map(category => <option key={category.id} value={category.id}>{categoryPath(state.categories, category.id)}</option>)}</select></Field>
          <Field label="Fonte padrão de receitas OFX"><select value={sourceId} onChange={event => { setSourceId(event.target.value); resetPreview(); }}><option value="">Selecione a fonte</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></Field>
        </div>
        <div className={ofxStyles.actions}>
          <button className={styles.secondary} type="button" onClick={() => {
            resetPreview(); setChoices(old => old.map((choice, index) => {
              if (choice.action !== 'pending' || statement.transactions[index].requiresReview) return choice;
              if (statement.transactions[index].amount < 0 && expenseCategoryId) return { action: 'expense', categoryId: expenseCategoryId };
              if (statement.transactions[index].amount > 0 && incomeCategoryId && sourceId) return { action: 'income', categoryId: incomeCategoryId, sourceId };
              return choice;
            }));
          }}>Classificar lançamentos comuns pendentes</button>
          <button className={styles.secondary} type="button" onClick={() => { resetPreview(); setChoices(old => old.map(choice => choice.action === 'pending' ? { action: 'ignore' } : choice)); }}>Ignorar todos os pendentes</button>
          <button className={styles.secondary} type="button" onClick={() => { resetPreview(); setChoices(old => old.map(() => ({ action: 'pending' }))); }}>Limpar classificações OFX</button>
        </div>
        <p className={styles.hint}>A classificação padrão só preenche lançamentos comuns ainda pendentes e preserva escolhas anteriores. Revise as linhas: o tipo informado pelo banco ou o sinal do valor não comprovam que uma entrada é renda ou uma saída é consumo.</p>
        <div className={ofxStyles.summary}><span>{choices.length} lançamentos</span><span>{pending} pendentes</span><span>{choices.filter(choice => choice.action === 'ignore').length} ignorados</span><span>{choices.filter(choice => choice.action === 'income' || choice.action === 'expense').length} selecionados</span></div>
        <div className={ofxStyles.pages}><button className={styles.secondary} type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Página anterior</button><span>Página {page + 1} de {pages}</span><button className={styles.secondary} type="button" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>Próxima página</button></div>
        <div className={ofxStyles.rows}>{statement.transactions.slice(page * pageSize, (page + 1) * pageSize).map((row, offset) => {
          const index = page * pageSize + offset, choice = choices[index];
          return <article className={ofxStyles.row} key={index} aria-label={`Lançamento OFX ${index + 1}`}>
            <div className={ofxStyles.rowTop}><h4>{row.description}</h4><strong>{row.amount > 0 ? '+' : ''}{formatMoney(row.amount)}</strong></div>
            <p>{displayDate(row.date)} · {row.bankType} · ID {row.fitId}</p>
            {row.requiresReview && <p className={ofxStyles.review}>Revisão individual: pode ser transferência, reembolso, pagamento ou outro movimento que exige registro específico. Ignore se não for receita/despesa pessoal.</p>}
            <div className={styles.fields}>
              <Field label={`Classificação do lançamento OFX ${index + 1}`}><select value={choice.action} onChange={event => updateChoice(index, { action: event.target.value as OfxClassification['action'], categoryId: row.amount > 0 ? incomeCategoryId : expenseCategoryId, sourceId: row.amount > 0 ? sourceId : undefined })}><option value="pending">Revisão pendente</option>{row.amount > 0 ? <option value="income">Confirmar como receita recebida</option> : <option value="expense">Confirmar como despesa paga</option>}<option value="ignore">Ignorar este lançamento</option></select></Field>
              {(choice.action === 'income' || choice.action === 'expense') && <Field label={`Categoria do lançamento OFX ${index + 1}`}><select value={choice.categoryId ?? ''} onChange={event => updateChoice(index, { categoryId: event.target.value })}><option value="">Selecione a categoria</option>{(choice.action === 'income' ? incomeCategories : expenseCategories).map(category => <option key={category.id} value={category.id}>{categoryPath(state.categories, category.id)}</option>)}</select></Field>}
              {choice.action === 'income' && <Field label={`Fonte do lançamento OFX ${index + 1}`}><select value={choice.sourceId ?? ''} onChange={event => updateChoice(index, { sourceId: event.target.value })}><option value="">Selecione a fonte</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></Field>}
            </div>
          </article>;
        })}</div>
        <button className={styles.secondary} type="button" disabled={!accountId || !accountChecked || pending > 0} onClick={() => void action(async () => {
          resetPreview(); setPreview(await previewOfx(statement, await repository.read(), accountId, choices));
        })}>Validar e visualizar importação OFX</button>
        {preview && <>
          <p className={styles.notice}>Prévia OFX: {preview.rows} linhas, {preview.commands.length} novas, {preview.duplicates} duplicatas e {preview.ignored} ignoradas. Receitas novas: {formatMoney(sum(preview.commands.filter(command => command.type === 'income').map(command => 'amount' in command ? command.amount : 0)))}. Despesas novas: {formatMoney(sum(preview.commands.filter(command => command.type === 'expense').map(command => 'amount' in command ? command.amount : 0)))}.</p>
          <p className={styles.hint}>Nada foi importado ainda. O lote inteiro é validado e gravado numa transação. Receitas elegíveis podem gerar contribuições conforme suas regras atuais. O FITID reconhece repetições da mesma conta; mudar dados ou classificação de um identificador já importado causa conflito. Não reconhece automaticamente lançamentos digitados manualmente ou importados por CSV.</p>
          <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisei a conta e confirmo que os lançamentos selecionados são receitas/despesas reais.</label>
          <button className={styles.primary} type="button" disabled={!confirmed || preview.commands.length === 0} onClick={() => void action(async () => {
            await repository.executeBatch(preview.commands); resetPreview(); setNotice('Lote OFX processado. Lançamentos já importados não foram repetidos; não houve gravações parciais.');
          })}>Confirmar importação OFX</button>
        </>}
      </>}
    </fieldset>
  </section>;
}
