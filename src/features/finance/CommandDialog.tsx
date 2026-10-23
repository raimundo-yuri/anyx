import { useState, type FormEvent } from 'react';
import { FinanceDialog } from './FinanceDialog';
import { Field, FormActions } from './Forms';
import { useCommand } from './use-finance';
import { parseBRL } from '../../domain/money';
import styles from './Finance.module.css';

export interface InputField {
  name: string; label: string; type?: 'text' | 'money' | 'date' | 'number' | 'month' | 'select' | 'checkbox' | 'multi' | 'percent';
  value?: string | boolean | string[]; options?: { value: string; label: string }[]; optional?: boolean; min?: number; max?: number | string;
}
export function CommandDialog({ title, help, fields, build, onClose, onSaved }: {
  title: string; help?: string; fields: InputField[]; build: (values: Record<string, unknown>, id: string) => Record<string, unknown>;
  onClose: () => void; onSaved: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>(() => Object.fromEntries(fields.map(field => [field.name, field.value ?? (field.type === 'checkbox' ? false : field.type === 'multi' ? [] : '')])));
  const command = useCommand(onSaved);
  const change = (name: string, value: string | boolean | string[]) => setValues(old => ({ ...old, [name]: value }));
  function save(event: FormEvent) {
    event.preventDefault(); void command.submit(() => {
      const data = Object.fromEntries(fields.flatMap(field => {
        const value = values[field.name];
        if (field.optional && value === '') return [];
        return [[field.name, field.type === 'money' || field.type === 'percent' ? parseBRL(String(value)) : field.type === 'number' ? Number(value) : value]];
      }));
      return build(data, id);
    });
  }
  return <FinanceDialog title={title} busy={command.busy} onClose={onClose}><form onSubmit={save}>
    {help && <p className={styles.formIntro}>{help}</p>}
    <fieldset className={styles.fields} disabled={command.busy}>{fields.map(field => field.type === 'checkbox' ?
      <label key={field.name} className={styles.checkbox}><input type="checkbox" checked={!!values[field.name]} onChange={event => change(field.name, event.target.checked)} />{field.label}</label> : field.type === 'multi' ?
      <fieldset className={styles.fields} key={field.name}><legend>{field.label}</legend>{field.options?.map(option => <label key={option.value} className={styles.checkbox}><input type="checkbox" checked={(values[field.name] as string[]).includes(option.value)} onChange={event => change(field.name, event.target.checked ? [...values[field.name] as string[], option.value] : (values[field.name] as string[]).filter(value => value !== option.value))} />{option.label}</label>)}</fieldset> :
      <Field key={field.name} label={field.label}>{field.type === 'select' ? <select required={!field.optional} value={String(values[field.name])} onChange={event => change(field.name, event.target.value)}><option value="">Selecione</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> :
      <input required={!field.optional} maxLength={field.type === 'text' || !field.type ? 120 : undefined} inputMode={field.type === 'money' || field.type === 'percent' ? 'decimal' : undefined} type={['date', 'month', 'number'].includes(field.type ?? '') ? field.type : 'text'} min={field.min} max={field.max} step={field.type === 'number' ? 1 : undefined} value={String(values[field.name])} onChange={event => change(field.name, event.target.value)} />}</Field>)}</fieldset>
    {command.error && <p role="alert" className={styles.error}>{command.error}</p>}<FormActions busy={command.busy} onClose={onClose} />
  </form></FinanceDialog>;
}
