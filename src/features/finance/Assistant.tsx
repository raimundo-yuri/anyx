import { useState, type FormEvent } from 'react';
import type { State } from '../../domain/model';
import { localAssistant, type AssistantAnswer } from '../../application/assistant';
import { FinanceData } from './FinanceData';
import { CommandDialog } from './CommandDialog';
import { options, inputMoney, today, type DialogSpec } from './finance-fields';
import styles from './Finance.module.css';

export function Assistant() { return <FinanceData>{state => <AssistantContent state={state} />}</FinanceData>; }
function AssistantContent({ state }: { state: State }) {
  const [question, setQuestion] = useState(''), [history, setHistory] = useState<{ question: string; answer: AssistantAnswer }[]>([]);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  function ask(value: string) {
    if (!value.trim()) return;
    setHistory(old => [...old.slice(-19), { question: value, answer: localAssistant.answer(state, value, today()) }]); setQuestion('');
  }
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  function review(command: Record<string, unknown>, index: number) {
    setReviewIndex(index);
    setDialog({ title: 'Revisar lançamento do assistente', help: 'Nenhum registro foi salvo. Confira os dados e confirme somente um fato já realizado.', fields: [
      { name: 'description', label: 'Descrição', value: String(command.description) }, { name: 'amount', label: 'Valor (R$)', type: 'money', value: inputMoney(Number(command.amount)) },
      { name: 'date', label: 'Data', type: 'date', value: String(command.date), max: today() }, { name: 'accountId', label: 'Conta', type: 'select', options: options(state.accounts.filter(item => !item.archived)), value: String(command.accountId) },
      { name: 'categoryId', label: 'Categoria', type: 'select', options: options(state.categories.filter(item => !item.archived && item.kind === command.type), state.categories), value: String(command.categoryId) },
      ...(command.type === 'income' ? [{ name: 'sourceId', label: 'Fonte de receita', type: 'select' as const, options: options(state.sources.filter(item => !item.archived)), value: String(command.sourceId) }] : []),
    ], build: values => ({ ...values, type: command.type }) });
  }
  function submit(event: FormEvent) { event.preventDefault(); ask(question); }
  return <div className={styles.workspace}><section className={styles.accountCard}><span className={styles.eyebrow}>ASSISTENTE LOCAL · SEM API EXTERNA</span><h2>Vamos entender suas finanças?</h2><p className={styles.hint}>Consultas estruturadas sobre seus dados atuais. Sem julgamentos e sem decisões automáticas. O histórico da conversa fica apenas nesta sessão.</p><div className={styles.personChips}>{['Quanto tenho disponível?', 'Quanto as pessoas me devem?', 'Quanto preciso para as faturas?', 'Quais despesas aumentaram?', 'Quais assinaturas vencem?', 'Minha agenda e pendências', 'Qual meu patrimônio?'].map(item => <button className={styles.secondary} key={item} onClick={() => ask(item)}>{item}</button>)}</div></section>
    <div className={styles.stack} aria-live="polite">{history.map((item, index) => <section className={styles.chatBubble} key={index}><strong>{item.question}</strong><p>{item.answer.text}</p>{item.answer.command && <button className={styles.primary} onClick={() => review(item.answer.command!, index)}>Revisar e confirmar lançamento</button>}</section>)}</div>
    <form className={styles.chatInput} onSubmit={submit}><input aria-label="Mensagem para o assistente" maxLength={500} placeholder="Pergunte sobre seus registros ou descreva um lançamento…" value={question} onChange={event => setQuestion(event.target.value)} required /><button className={styles.primary}>Enviar</button></form><p className={styles.hint}>Exemplo de lançamento: gastei 12,50 em Alimentação na conta Nubank. Se um nome for ambíguo, o assistente pede esclarecimento. Compras divididas devem ser registradas no formulário de cartões.</p>
    {dialog && <CommandDialog {...dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setHistory(old => [...old.map((item, index) => index === reviewIndex ? { ...item, answer: { text: item.answer.text + '\nLançamento já confirmado.' } } : item), { question: 'Lançamento confirmado', answer: { text: 'Registro salvo no banco local. Os indicadores serão atualizados.' } }]); }} />}
  </div>;
}
