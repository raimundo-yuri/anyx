import { appConfig } from '../../config/app';
import { localToday } from '../../application/finance-view';
import type { InputField } from './CommandDialog';
export interface DialogSpec { title: string; help?: string; fields: InputField[]; build: (values: Record<string, unknown>, id: string) => Record<string, unknown> }
export const options = (items: readonly { id: string; name: string }[]) => items.map(item => ({ value: item.id, label: item.name }));
export function inputMoney(value: number) { const amount = BigInt(value), absolute = amount < 0n ? -amount : amount; return `${amount < 0n ? '-' : ''}${absolute / 100n},${String(absolute % 100n).padStart(2, '0')}`; }
export const today = () => localToday(appConfig.timeZone);
export const dateField = (): InputField => ({ name: 'date', label: 'Data', type: 'date', value: today(), max: today() });
