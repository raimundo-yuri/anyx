import { appConfig } from '../../config/app';
import { localToday } from '../../application/finance-view';
import type { InputField } from './CommandDialog';
import { categoryPath, type CategoryNode } from '../../domain/categories';
export interface DialogSpec { title: string; help?: string; fields: InputField[]; build: (values: Record<string, unknown>, id: string) => Record<string, unknown> }
export const options = (items: readonly { id: string; name: string }[], categories?: readonly CategoryNode[]) => items.map(item => ({ value: item.id, label: categories ? categoryPath(categories, item.id) : item.name }));
export function inputMoney(value: number) { const amount = BigInt(value), absolute = amount < 0n ? -amount : amount; return `${amount < 0n ? '-' : ''}${absolute / 100n},${String(absolute % 100n).padStart(2, '0')}`; }
export const today = () => localToday(appConfig.timeZone);
export const dateField = (): InputField => ({ name: 'date', label: 'Data', type: 'date', value: today(), max: today() });
