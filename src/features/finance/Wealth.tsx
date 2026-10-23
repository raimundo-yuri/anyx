import { useState } from 'react';
import type { State } from '../../domain/model';
import { balance, summary } from '../../domain/queries';
import { displayDate, formatMoney } from '../../application/finance-view';
import { FinanceData } from './FinanceData';
import { CommandDialog, type InputField } from './CommandDialog';
import { dateField, inputMoney, options, today, type DialogSpec } from './finance-fields';
import styles from './Finance.module.css';

export function Wealth({ page }: { page: 'wealth' | 'loans' }) { return <FinanceData>{state => <WealthContent state={state} page={page} />}</FinanceData>; }
function WealthContent({ state, page }: { state: State; page: 'wealth' | 'loans' }) {
  const [dialog, setDialog] = useState<DialogSpec | null>(null), [notice, setNotice] = useState('');
  const accounts = options(state.accounts.filter(item => !item.archived));
  const close = () => setDialog(null), saved = () => { close(); setNotice('Registro patrimonial salvo.'); };
  function loanForm(direction: 'lent' | 'borrowed') {
    setDialog({ title: direction === 'lent' ? 'Emprestar a uma pessoa' : 'Registrar empréstimo recebido', help: 'O principal movimenta ativo ou passivo e caixa. Não representa consumo ou renda. Cadastre a pessoa na seção Pessoas e recebíveis.', fields: [
      { name: 'description', label: 'Descrição' }, { name: 'personId', label: 'Pessoa', type: 'select', options: options(state.people) },
      { name: 'accountId', label: 'Conta', type: 'select', options: accounts }, { name: 'amount', label: 'Principal (R$)', type: 'money' }, dateField(), { name: 'dueDate', label: 'Vencimento', type: 'date', value: today() },
    ], build: (values, id) => ({ ...values, id, direction, type: 'createLoan' }) });
  }
  return <div className={styles.workspace}>{notice && <p role="status" className={styles.success}>{notice}</p>}
    {page === 'wealth' ? <><div className={styles.toolbar}><div><span className={styles.eyebrow}>O QUE VOCÊ ESTÁ CONSTRUINDO</span><h2>Investimentos e patrimônio</h2></div><button className={styles.primary} onClick={() => setDialog({ title: 'Novo investimento', help: 'Cadastro manual, sem conexão à corretora ou promessa de rentabilidade.', fields: [{ name: 'name', label: 'Nome do investimento' }], build: (values, id) => ({ ...values, id, type: 'createInvestment' }) })}>Novo investimento</button></div>
      <div className={styles.metrics}><div><span>Patrimônio líquido</span><strong>{formatMoney(summary(state).netWorth)}</strong><small>Ativos menos passivos; não é caixa disponível.</small></div><div><span>Investimentos (valor contábil)</span><strong>{formatMoney(balance(state, 'investment'))}</strong><small>Valor manual, sujeito a defasagem.</small></div><div><span>Variação patrimonial registrada</span><strong>{formatMoney(balance(state, 'valuation'))}</strong><small>Avaliação não significa dinheiro recebido.</small></div></div>
      <p className={styles.notice}>Aportes e resgates são transferências patrimoniais, não despesas ou rendas. A avaliação manual altera o patrimônio, nunca o caixa. Rendimentos efetivamente recebidos em conta devem ser registrados como receita com fonte e categoria próprias; não registre o mesmo valor também como resgate.</p>
      <div className={styles.accountGrid}>{state.investments.map(item => <article className={styles.accountCard} key={item.id}><h3>{item.name}</h3><p>{item.lastValuedOn ? `Avaliação manual em ${displayDate(item.lastValuedOn)}` : 'Sem avaliação manual'}</p><strong className={styles.accountBalance}>{formatMoney(balance(state, 'investment', item.id))}</strong><div className={styles.personChips}>{(['deposit', 'withdraw'] as const).map(direction => <button key={direction} className={styles.secondary} onClick={() => setDialog({ title: direction === 'deposit' ? 'Registrar aporte' : 'Registrar resgate', help: 'Informe somente a movimentação entre a conta e o valor contábil deste investimento.', fields: [{ name: 'accountId', label: 'Conta', type: 'select', options: accounts }, { name: 'amount', label: 'Valor (R$)', type: 'money' }, dateField(), { name: 'description', label: 'Descrição', value: `${direction === 'deposit' ? 'Aporte' : 'Resgate'}: ${item.name}` }], build: values => ({ ...values, investmentId: item.id, direction, type: 'investmentFlow' }) })}>{direction === 'deposit' ? 'Aportar' : 'Resgatar'}</button>)}<button className={styles.secondary} onClick={() => setDialog({ title: 'Atualizar avaliação', help: 'Informe o valor total atual, não o ganho. A diferença é patrimonial, não renda recebida. Use data posterior aos movimentos já registrados.', fields: [{ name: 'value', label: 'Valor total informado (R$)', type: 'money', value: inputMoney(balance(state, 'investment', item.id)) }, dateField()], build: values => ({ ...values, investmentId: item.id, type: 'valueInvestment' }) })}>Avaliar</button></div></article>)}</div>
    </> : <><div className={styles.toolbar}><div><span className={styles.eyebrow}>PRINCIPAL E JUROS SEPARADOS</span><h2>Dívidas e empréstimos</h2></div><div className={styles.toolbarActions}><button className={styles.secondary} onClick={() => loanForm('lent')}>Emprestar</button><button className={styles.primary} onClick={() => loanForm('borrowed')}>Empréstimo recebido</button></div></div>
      {!state.loans.length && <p className={styles.hint}>Nenhum empréstimo registrado. Juros são informados no pagamento; não há cálculo automático de amortização ou contratação de crédito.</p>}
      <div className={styles.stack}>{state.loans.map(item => {
        const pending = balance(state, item.direction === 'lent' ? 'loanAsset' : 'loanDebt', item.id);
        const repay = () => {
          const fields: InputField[] = [{ name: 'accountId', label: 'Conta', type: 'select', options: accounts }, { name: 'principalAmount', label: 'Principal pago (R$)', type: 'money', value: inputMoney(pending) }, { name: 'interestAmount', label: 'Juros pagos (R$)', type: 'money', value: '0,00' }, dateField(), { name: 'categoryId', label: 'Categoria dos juros (se houver)', type: 'select', optional: true, options: options(state.categories.filter(category => !category.archived && category.kind === (item.direction === 'lent' ? 'income' : 'expense'))) }, ...(item.direction === 'lent' ? [{ name: 'sourceId', label: 'Fonte dos juros (se houver)', type: 'select' as const, optional: true, options: options(state.sources.filter(source => !source.archived)) }] : [])];
          setDialog({ title: 'Pagamento de empréstimo', help: 'Principal reduz a dívida ou direito. Somente os juros são receita/despesa. Pagamentos parciais são aceitos.', fields, build: values => ({ ...values, id: item.id, type: 'repayLoan' }) });
        };
        return <article className={styles.accountCard} key={item.id}><div className={styles.toolbar}><div><h3>{item.name}</h3><p>{state.people.find(person => person.id === item.personId)?.name} · {item.direction === 'lent' ? 'A receber' : 'A pagar'} · vencimento {displayDate(item.dueDate)}</p><p>Principal original: {formatMoney(item.principal)}</p></div><div><strong>{formatMoney(pending)}</strong><p>{pending === 0 ? 'Principal quitado' : item.dueDate < today() ? 'Vencido' : 'Pendente'}</p><button className={styles.primary} onClick={repay}>Registrar pagamento</button></div></div></article>;
      })}</div>
    </>}{dialog && <CommandDialog {...dialog} onClose={close} onSaved={saved} />}</div>;
}
