import { useState, type FormEvent } from 'react';
import type { State } from '../../domain/model';
import { FinanceError } from '../../domain/errors';
import { assertCategoryHierarchy, categoryDescendantIds, categoryPath, type CategoryNode } from '../../domain/categories';
import { Field } from './Forms';
import { FinanceDialog } from './FinanceDialog';
import { useCommand } from './use-finance';
import styles from './Finance.module.css';

export function CategoryHierarchy({ state }: { state: State }) {
  const [mode, setMode] = useState<'create' | 'move' | null>(null), [notice, setNotice] = useState('');
  const categories: readonly CategoryNode[] = state.categories;
  const saved = () => { setMode(null); setNotice('Organização de categorias atualizada. Valores e registros financeiros foram preservados.'); };
  return <section className={styles.accountCard} style={{ marginTop: 24 }} aria-label="Organização de subcategorias">
    <h2 className={styles.sectionTitle}>Categorias e subcategorias</h2>
    <p className={styles.hint}>Organize categorias em grupos da mesma natureza. O caminho completo ajuda a distinguir nomes iguais; os registros continuam ligados à categoria escolhida.</p>
    <div className={styles.toolbarActions}><button className={styles.secondary} disabled={!categories.some(item => !item.archived)} onClick={() => { setNotice(''); setMode('create'); }}>Nova subcategoria</button><button className={styles.secondary} disabled={!categories.length} onClick={() => { setNotice(''); setMode('move'); }}>Organizar grupos</button></div>
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {categories.some(item => item.parentId) && <details className={styles.hint}><summary>Ver caminhos das categorias</summary><ul className={styles.detailList}>{categories.map(item => <li key={item.id}><span>{categoryPath(categories, item.id)}{item.archived ? ' (arquivada)' : ''}</span><span>{item.kind === 'income' ? 'Receita' : 'Despesa'}</span></li>)}</ul></details>}
    {mode === 'create' && <CreateSubcategory categories={categories} onClose={() => setMode(null)} onSaved={saved} />}
    {mode === 'move' && <MoveCategory categories={categories} onClose={() => setMode(null)} onSaved={saved} />}
  </section>;
}

function CreateSubcategory({ categories, onClose, onSaved }: { categories: readonly CategoryNode[]; onClose: () => void; onSaved: () => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(''), [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [parentId, setParentId] = useState(''), [confirmed, setConfirmed] = useState(false);
  const command = useCommand(onSaved);
  const parents = categories.filter(item => !item.archived && item.kind === kind);
  const parent = parents.find(item => item.id === parentId);
  const path = parent ? `${categoryPath(categories, parent.id)} / ${name.trim() || 'Nova subcategoria'}` : 'Escolha um grupo para conferir o caminho.';
  function save(event: FormEvent) {
    event.preventDefault(); void command.submit(() => {
      if (!confirmed) throw new FinanceError('Revise e confirme o nome e o grupo da subcategoria.');
      if (!parent) throw new FinanceError('Escolha um grupo ativo da mesma natureza.');
      assertCategoryHierarchy([...categories, { id, name: name.trim(), kind, parentId }]);
      return { type: 'createCategory', id, name, kind, parentId };
    });
  }
  return <FinanceDialog title="Nova subcategoria" busy={command.busy} onClose={onClose}><form onSubmit={save}>
    <p className={styles.formIntro}>Crie uma categoria dentro de um grupo existente. Isso organiza seus registros, sem movimentar dinheiro.</p>
    <fieldset className={styles.fields} disabled={command.busy}>
      <Field label="Nome da subcategoria"><input autoFocus required maxLength={120} value={name} onChange={event => { setName(event.target.value); setConfirmed(false); }} placeholder="Ex.: Restaurantes" /></Field>
      <Field label="Natureza da subcategoria"><select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setParentId(''); setConfirmed(false); }}><option value="expense">Despesa</option><option value="income">Receita</option></select></Field>
      <Field label="Grupo da subcategoria"><select required value={parentId} onChange={event => { setParentId(event.target.value); setConfirmed(false); }}><option value="">Selecione um grupo</option>{parents.map(item => <option key={item.id} value={item.id}>{categoryPath(categories, item.id)}</option>)}</select></Field>
      <p className={styles.notice}>Prévia: {path}</p>
      {!parents.length && <p className={styles.hint}>Cadastre uma categoria ativa desta natureza antes de criar sua subcategoria.</p>}
      <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisei o nome e o grupo da subcategoria.</label>
    </fieldset>
    {command.error && <p className={styles.error} role="alert">{command.error}</p>}
    <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={command.busy} onClick={onClose}>Cancelar</button><button type="submit" className={styles.primary} disabled={command.busy || !confirmed || !parent || !name.trim()}>{command.busy ? 'Salvando…' : 'Criar subcategoria'}</button></div>
  </form></FinanceDialog>;
}

function MoveCategory({ categories, onClose, onSaved }: { categories: readonly CategoryNode[]; onClose: () => void; onSaved: () => void }) {
  const initial = categories.find(item => !item.archived) ?? categories[0];
  const [categoryId, setCategoryId] = useState(initial?.id ?? ''), [parentId, setParentId] = useState(initial?.parentId ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const command = useCommand(onSaved);
  const selected = categories.find(item => item.id === categoryId);
  const descendants = selected ? categoryDescendantIds(categories, selected.id) : [];
  const parents = categories.filter(item => selected && item.kind === selected.kind && (!item.archived || selected.archived) && !descendants.includes(item.id));
  const parent = parents.find(item => item.id === parentId);
  const changed = !!selected && parentId !== (selected.parentId ?? '');
  const invalidParent = !!parentId && !parent;
  const path = invalidParent ? 'Escolha novamente um grupo disponível.' : selected ? `${parent ? categoryPath(categories, parent.id) + ' / ' : ''}${selected.name}` : 'Selecione uma categoria.';
  function save(event: FormEvent) {
    event.preventDefault(); void command.submit(() => {
      if (!selected) throw new FinanceError('Esta categoria mudou em outra aba. Confira a seleção.');
      if (!confirmed) throw new FinanceError('Revise e confirme a mudança de grupo.');
      if (!changed) throw new FinanceError('Escolha um grupo diferente do atual.');
      if (parentId && !parent) throw new FinanceError('Escolha um grupo válido da mesma natureza.');
      assertCategoryHierarchy(categories.map(item => item.id === selected.id ? { ...item, parentId: parentId || undefined } : item));
      return { type: 'setCategoryParent', id: selected.id, parentId: parentId || null };
    });
  }
  return <FinanceDialog title="Organizar grupos de categorias" busy={command.busy} onClose={onClose}><form onSubmit={save}>
    <p className={styles.formIntro}>Mover uma categoria preserva seus valores e identificadores e altera o agrupamento dos registros existentes. Subcategorias acompanham a mudança; confira os orçamentos dos grupos envolvidos.</p>
    <fieldset className={styles.fields} disabled={command.busy}>
      <Field label="Categoria para organizar"><select required value={categoryId} onChange={event => { const next = categories.find(item => item.id === event.target.value); setCategoryId(event.target.value); setParentId(next?.parentId ?? ''); setConfirmed(false); command.clearError(); }}>{categories.map(item => <option key={item.id} value={item.id}>{categoryPath(categories, item.id)} · {item.kind === 'income' ? 'Receita' : 'Despesa'}{item.archived ? ' (arquivada)' : ''}</option>)}</select></Field>
      <Field label="Novo grupo"><select value={parentId} onChange={event => { setParentId(event.target.value); setConfirmed(false); command.clearError(); }}><option value="">Sem grupo — categoria principal</option>{parents.map(item => <option key={item.id} value={item.id}>{categoryPath(categories, item.id)}{item.archived ? ' (arquivado)' : ''}</option>)}</select></Field>
      <p className={styles.notice}>Prévia: {path}</p>
      {invalidParent && <p className={styles.error} role="alert">O grupo escolhido mudou ou não está mais disponível. Confira a seleção antes de continuar.</p>}
      {descendants.length > 1 && <p className={styles.hint}>{descendants.length - 1} subcategoria(s) acompanhará(ão) esta categoria.</p>}
      <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisei a mudança de grupo e seus efeitos nos registros existentes.</label>
    </fieldset>
    {command.error && <p className={styles.error} role="alert">{command.error}</p>}
    <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={command.busy} onClick={onClose}>Cancelar</button><button type="submit" className={styles.primary} disabled={command.busy || !changed || !confirmed || (!!parentId && !parent)}>{command.busy ? 'Salvando…' : 'Confirmar novo grupo'}</button></div>
  </form></FinanceDialog>;
}
