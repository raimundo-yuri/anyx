import { useRef, useState } from 'react';
import type { State } from '../../domain/model';
import { tableNames } from '../../domain/model';
import { FinanceError } from '../../domain/errors';
import { summary } from '../../domain/queries';
import { monthRange } from '../../application/dashboard';
import { displayDate, formatMoney, movementRows } from '../../application/finance-view';
import { userError } from '../../application/user-error';
import { localRepository } from '../../infrastructure/database';
import { MAX_FILE_SIZE, encryptedBackup, plainBackup, readBackup } from '../../portability/backup';
import { exportCsv, parseCsv, previewStatement, statementColumns, statementTemplate } from '../../portability/csv';
import { downloadFile } from '../../portability/download';
import { FinanceData } from './FinanceData';
import { Field } from './Forms';
import { today } from './finance-fields';
import { appConfig } from '../../config/app';
import styles from './Finance.module.css';

export function Reports() { return <FinanceData>{state => <ReportContent state={state} />}</FinanceData>; }
function ReportContent({ state }: { state: State }) {
  const [table, setTable] = useState<keyof State>('operations');
  const [encrypt, setEncrypt] = useState(true), [password, setPassword] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null), [restorePassword, setRestorePassword] = useState('');
  const [replacement, setReplacement] = useState<State | null>(null), [expected, setExpected] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [csvText, setCsvText] = useState(''), [headers, setHeaders] = useState<string[]>([]), [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewStatement>> | null>(null), [confirmImport, setConfirmImport] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const totals = summary(state, monthRange(month));
  const rows = movementRows(state, { query: '', kind: '', accountId: '', ...monthRange(month) });
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (error) { setError(userError(error)); }
    finally { setBusy(false); lock.current = false; }
  }
  function checkFile(file: File | null): asserts file is File {
    if (!file) throw new FinanceError('Selecione um arquivo.');
    if (file.size > MAX_FILE_SIZE) throw new FinanceError('O arquivo precisa ter no máximo 20 MiB.');
  }
  return <div className={styles.workspace}>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    <div className={styles.gridTwo}>
      <section className={styles.accountCard}><h2 className={styles.sectionTitle}>Exportar dados</h2><p className={styles.hint}>CSV UTF-8, separado por ponto e vírgula. Valores numéricos em centavos; tabelas relacionadas por IDs para Power BI.</p><fieldset disabled={busy} className={styles.fields}><Field label="Tabela para exportar"><select value={table} onChange={event => setTable(event.target.value as keyof State)}>{tableNames.filter(name => name !== 'receipts').map(name => <option value={name} key={name}>{name}</option>)}</select></Field><button className={styles.primary} onClick={() => { downloadFile(`${table}.csv`, exportCsv(state, table), 'text/csv;charset=utf-8'); setNotice('CSV exportado. Valores monetários estão em centavos.'); }}>Baixar CSV</button></fieldset></section>
      <section className={styles.accountCard}><h2 className={styles.sectionTitle}>Backup completo</h2><p className={styles.hint}>Preserva registros, relações e chaves de idempotência. Perder a senha de um backup criptografado impede sua recuperação.</p><fieldset disabled={busy} className={styles.fields}><label className={styles.checkbox}><input type="checkbox" checked={encrypt} onChange={event => setEncrypt(event.target.checked)} />Criptografar backup com senha</label>{encrypt ? <Field label="Senha do backup"><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></Field> : <p className={styles.notice}>Backup sem criptografia: quem tiver o arquivo poderá ler seus dados.</p>}<button className={styles.primary} disabled={encrypt && password.length < 8} onClick={() => void action(async () => { const current = await localRepository.read(); downloadFile(`${appConfig.name}-backup-${today()}.json`, encrypt ? await encryptedBackup(current, password) : plainBackup(current)); setPassword(''); setNotice('Backup baixado. Guarde o arquivo e a senha em local seguro.'); })}>Baixar backup</button></fieldset></section>
    </div>
    <section className={styles.accountCard} style={{ marginTop: 20 }}><h2 className={styles.sectionTitle}>Restaurar backup</h2><p className={styles.hint}>A restauração substitui todos os registros locais, inclusive cadastros. Exporte o estado atual antes de continuar. A validação e a substituição são atômicas.</p><fieldset disabled={busy} className={styles.fields}><Field label="Arquivo de backup"><input type="file" accept=".json,application/json" onChange={event => { setRestoreFile(event.target.files?.[0] ?? null); setReplacement(null); setConfirm(false); }} /></Field><Field label="Senha para restaurar (se criptografado)"><input type="password" autoComplete="off" value={restorePassword} onChange={event => { setRestorePassword(event.target.value); setReplacement(null); setConfirm(false); }} /></Field><button className={styles.secondary} onClick={() => void action(async () => { checkFile(restoreFile); const next = await readBackup(await restoreFile.text(), restorePassword); const current = await localRepository.read(); setReplacement(next); setExpected(JSON.stringify(current)); setConfirm(false); setNotice('Backup validado. Revise as quantidades antes de confirmar.'); })}>Validar e visualizar backup</button>
    {replacement && <><p className={styles.notice}>Prévia: {replacement.accounts.length} contas, {replacement.operations.length} operações, {replacement.purchases.length} compras e {replacement.receivables.length} recebíveis. Caixa: {formatMoney(summary(replacement).cash)}.</p><label className={styles.checkbox}><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} />Entendo que o backup substituirá todos os dados locais atuais.</label><button className={styles.primary} disabled={!confirm} onClick={() => void action(async () => { await localRepository.replace(replacement, expected); setReplacement(null); setRestorePassword(''); setConfirm(false); setNotice('Backup restaurado com sucesso.'); })}>Confirmar restauração</button></>}</fieldset></section>
    <section className={styles.accountCard} style={{ marginTop: 20 }}><h2 className={styles.sectionTitle}>Importar extrato CSV</h2><p className={styles.hint}>Adaptador CSV DexFin v1, somente receitas/despesas realizadas. Não é um formato bancário universal. Colunas mapeáveis; valores em centavos inteiros; externalId estável por conta permite reconhecer duplicatas.</p><button className={styles.secondary} onClick={() => downloadFile('modelo-extrato-dexfin.csv', statementTemplate, 'text/csv;charset=utf-8')}>Baixar modelo de importação</button><fieldset disabled={busy} className={styles.fields}><Field label="Arquivo de extrato CSV"><input type="file" accept=".csv,text/csv" onChange={event => void action(async () => { const file = event.target.files?.[0] ?? null; checkFile(file); const text = await file.text(); const header = parseCsv(text)[0] ?? []; setCsvText(text); setHeaders(header); setMapping(Object.fromEntries(statementColumns.map(column => [column, header.includes(column) ? column : '']))); setPreview(null); setConfirmImport(false); })} /></Field>{headers.length > 0 && <div className={styles.formGrid}>{statementColumns.map(column => <Field key={column} label={`Coluna ${column}`}><select value={mapping[column] ?? ''} onChange={event => { setMapping(old => ({ ...old, [column]: event.target.value })); setPreview(null); }}><option value="">Não mapeada</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select></Field>)}</div>}<button className={styles.secondary} disabled={!csvText} onClick={() => void action(async () => { setPreview(await previewStatement(csvText, await localRepository.read(), mapping)); setConfirmImport(false); })}>Visualizar importação</button>{preview && <><p className={styles.notice}>{preview.rows} linhas: {preview.commands.length} novas e {preview.duplicates} duplicatas reconhecidas. Nada foi importado ainda.</p><ul className={styles.detailList}>{preview.commands.slice(0, 20).map(command => <li key={command.key}><span>{'description' in command ? command.description : ''}</span><span>{'amount' in command ? formatMoney(command.amount) : ''}</span></li>)}</ul><label className={styles.checkbox}><input type="checkbox" checked={confirmImport} onChange={event => setConfirmImport(event.target.checked)} />Revisei a prévia e confirmo a importação.</label><button className={styles.primary} disabled={!confirmImport || preview.commands.length === 0} onClick={() => void action(async () => { await localRepository.executeBatch(preview.commands); setPreview(null); setConfirmImport(false); setNotice('Importação concluída sem gravações parciais.'); })}>Confirmar importação</button></>}</fieldset></section>
    <section className={`${styles.accountCard} ${styles.report}`} style={{ marginTop: 20 }}><h2 className={styles.sectionTitle}>Relatório financeiro · {appConfig.name}</h2><div className={styles.toolbar}><label className={styles.filterLabel}>Mês do relatório<input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label><button className={styles.secondary} onClick={() => window.print()}>Imprimir / salvar PDF</button></div><p className={styles.hint}>Período {month.split('-').reverse().join('/')}. Estoques atuais: caixa {formatMoney(totals.cash)}, faturas {formatMoney(totals.invoices)}. Fluxos do mês: receitas {formatMoney(totals.income)}, despesas pessoais {formatMoney(totals.expenses)}.</p><ul className={styles.detailList}>{rows.map(row => <li key={row.id}><span>{displayDate(row.date)} · {row.description} · {row.label}{row.reversal ? ' · Estornada' : row.original ? ` · Original: ${row.original.description}` : ''}</span><span>{formatMoney(row.amount)}</span></li>)}</ul></section>
  </div>;
}
