import { useState } from 'react';
import type { State } from '../../domain/model';
import { FinanceData } from './FinanceData';
import { CommandDialog } from './CommandDialog';
import { dateField, inputMoney, options, type DialogSpec } from './finance-fields';
import { formatMoney, displayDate } from '../../application/finance-view';
import { useCommand } from './use-finance';
import styles from './Finance.module.css';

export function Contributions() { return <FinanceData>{state => <ContributionContent state={state} />}</FinanceData>; }
function ContributionContent({ state }: { state: State }) {
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [notice, setNotice] = useState('');
  const actions = useCommand(() => setNotice('Regra atualizada. Recebimentos anteriores não foram recalculados.'));
  const close = () => setDialog(null), saved = () => { close(); setNotice('Contribuição atualizada.'); };
  function ruleForm(rule?: State['rules'][number]) {
    setDialog({ title: rule ? 'Editar regra de contribuição' : 'Nova regra de contribuição', help: 'Escolha fontes e percentual. A regra vale para novos recebimentos; transferências e reembolsos ficam de fora.', fields: [
      { name: 'name', label: 'Nome da regra', value: rule?.name }, { name: 'basisPoints', label: 'Percentual (%)', type: 'percent', value: rule ? inputMoney(rule.basisPoints) : '' },
      { name: 'sourceIds', label: 'Fontes elegíveis', type: 'multi', value: rule?.sourceIds ?? [], options: options(state.sources.filter(item => !item.archived)) },
      { name: 'mode', label: 'Aplicação', type: 'select', value: rule?.mode ?? 'suggest', options: [{ value: 'suggest', label: 'Apenas sugerir' }, { value: 'reserve', label: 'Reservar automaticamente' }] },
      { name: 'enabled', label: 'Regra ativada', type: 'checkbox', value: rule?.enabled ?? false },
    ], build: (values, id) => ({ ...values, type: rule ? 'updateRule' : 'createRule', id: rule?.id ?? id }) });
  }
  return <div className={styles.workspace}><div className={styles.toolbar}><div><span className={styles.eyebrow}>CONTRIBUIÇÕES COM PROPÓSITO</span><h2>Suas regras, sua escolha</h2></div><button className={styles.primary} disabled={!state.sources.some(item => !item.archived)} onClick={() => ruleForm()}>Nova regra</button></div><p className={styles.notice}>Percentuais não são presumidos. Cadastre as fontes em Categorias e fontes. Sugestões não movimentam caixa; reservas reduzem o disponível até pagamento ou cancelamento.</p>{notice && <p className={styles.success} role="status">{notice}</p>}{actions.error && <p className={styles.error} role="alert">{actions.error}</p>}
    {!state.rules.length && <p className={styles.hint}>Nenhuma regra configurada. A contribuição é opcional.</p>}
    <div className={styles.accountGrid}>{state.rules.map(rule => <article key={rule.id} className={styles.accountCard}><h3>{rule.name}</h3><p>{inputMoney(rule.basisPoints)}% · {rule.enabled ? 'Ativada' : 'Desativada'} · {rule.mode === 'reserve' ? 'Reserva automática' : 'Sugestão'}</p><p>{rule.sourceIds.map(id => state.sources.find(item => item.id === id)?.name).join(', ')}</p><button className={styles.secondary} onClick={() => ruleForm(rule)}>Editar regra</button></article>)}</div>
    <h2 className={styles.sectionTitle}>Histórico de contribuições</h2><div className={styles.stack}>{state.contributions.map(item => {
      const income = state.operations.find(op => op.id === item.incomeId)!;
      const open = ['suggested', 'reserved'].includes(item.status);
      return <article className={styles.accountCard} key={item.id}><div className={styles.toolbar}><div><h3>{state.rules.find(rule => rule.id === item.ruleId)?.name} · {formatMoney(item.amount)}</h3><p>Origem: {income.description} · {displayDate(income.date)} · {({ suggested: 'Sugerida', reserved: 'Reservada', paid: 'Paga', cancelled: 'Cancelada' })[item.status]}{item.cancelledById && ' · Estorno da receita'}</p></div><div className={styles.toolbarActions}>{open && <><button className={styles.secondary} onClick={() => setDialog({ title: 'Ajustar contribuição', fields: [{ name: 'amount', label: 'Novo valor (R$)', type: 'money', value: inputMoney(item.amount) }], build: values => ({ ...values, type: 'adjustContribution', id: item.id }) })}>Ajustar</button><button className={styles.secondary} onClick={() => setDialog({ title: 'Cancelar contribuição', help: 'A reserva será liberada sem gerar despesa. O registro permanece no histórico.', fields: [dateField()], build: values => ({ ...values, type: 'settleContribution', contributionId: item.id, action: 'cancel' }) })}>Cancelar contribuição</button><button className={styles.primary} onClick={() => setDialog({ title: 'Pagar contribuição', help: 'O pagamento será feito pela conta do recebimento original. Sua reserva será liberada.', fields: [dateField(), { name: 'categoryId', label: 'Categoria da contribuição', type: 'select', options: options(state.categories.filter(category => category.kind === 'expense' && !category.archived), state.categories) }], build: values => ({ ...values, type: 'settleContribution', contributionId: item.id, action: 'pay' }) })}>Registrar pagamento</button></>}</div></div></article>;
    })}</div>{!state.contributions.length && <p className={styles.hint}>O histórico aparecerá quando uma receita elegível for registrada com uma regra ativa.</p>}{dialog && <CommandDialog {...dialog} onClose={close} onSaved={saved} />}</div>;
}
