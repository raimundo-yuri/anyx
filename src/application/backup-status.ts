import { z } from 'zod';
import { tableNames, type State } from '../domain/model';

export const BACKUP_STATUS_KEY = 'dexfin-backup-status-v1';
export const BACKUP_STATUS_EVENT = 'dexfin-backup-status-changed';
const DAY = 24 * 60 * 60 * 1000;
const instant = z.iso.datetime();
const statusSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.boolean(),
  intervalDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  lastRequested: z.strictObject({ at: instant, signature: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
  restoredAt: instant.optional(),
  dismissedUntil: instant.optional(),
});
export type BackupStatus = z.infer<typeof statusSchema>;
export type BackupInterval = BackupStatus['intervalDays'];
export const defaultBackupStatus = (): BackupStatus => ({ version: 1, enabled: true, intervalDays: 7 });
let sessionStatus = defaultBackupStatus();
let sessionOnly = false;

/** Metadata only: no names, values, records, filenames or passwords enter localStorage. */
export function readBackupStatus(): BackupStatus {
  if (sessionOnly) return statusSchema.parse(sessionStatus);
  try {
    const storage = globalThis.localStorage;
    if (!storage) return statusSchema.parse(sessionStatus);
    const raw = storage.getItem(BACKUP_STATUS_KEY);
    if (!raw) return defaultBackupStatus();
    const parsed = statusSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return defaultBackupStatus();
    sessionStatus = parsed.data;
    return parsed.data;
  } catch { return statusSchema.parse(sessionStatus); }
}

function writeStatus(input: BackupStatus): boolean {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return false;
  sessionStatus = parsed.data;
  let saved = false;
  try { globalThis.localStorage.setItem(BACKUP_STATUS_KEY, JSON.stringify(parsed.data)); saved = true; }
  catch { /* A denied metadata write must never block a financial action or download. */ }
  sessionOnly = !saved;
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BACKUP_STATUS_EVENT, { detail: parsed.data })); }
  catch { /* Unsupported event delivery does not invalidate the financial action either. */ }
  return saved;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** A digest detects changes to every table, including catalog edits and planning records. */
export async function backupSignature(state: State): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const data = tableNames.map(name => [name, [...state[name]].sort((a, b) => a.id.localeCompare(b.id)).map(canonical)]);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/** Call only after a backup download has been requested successfully; this is not proof of saving. */
export async function markBackupRequested(state: State, at = new Date().toISOString()): Promise<boolean> {
  if (!instant.safeParse(at).success) return false;
  const signature = await backupSignature(state);
  if (!signature) return false;
  return writeStatus({ ...readBackupStatus(), lastRequested: { at, signature }, dismissedUntil: undefined });
}

/** A restored file is not a new download. Do not carry a previous dataset's backup marker forward. */
export function markBackupRestored(at = new Date().toISOString()): boolean {
  if (!instant.safeParse(at).success) return false;
  return writeStatus({ ...readBackupStatus(), lastRequested: undefined, restoredAt: at, dismissedUntil: new Date(Date.parse(at) + DAY).toISOString() });
}

/** Use after an explicit local-data deletion; exported files are unaffected. */
export function resetBackupTracking(): boolean {
  const { enabled, intervalDays } = readBackupStatus();
  return writeStatus({ version: 1, enabled, intervalDays });
}

export function updateBackupPreferences(preferences: { enabled?: boolean; intervalDays?: BackupInterval }): boolean {
  return writeStatus({ ...readBackupStatus(), ...preferences });
}

export function postponeBackupReminder(at = new Date().toISOString()): boolean {
  if (!instant.safeParse(at).success) return false;
  return writeStatus({ ...readBackupStatus(), dismissedUntil: new Date(Date.parse(at) + DAY).toISOString() });
}

export function backupReminderStatus(state: State, status: BackupStatus, signature: string | null, now = Date.now()) {
  const hasData = tableNames.some(name => name !== 'receipts' && state[name].length > 0);
  const hasChanges = !status.lastRequested ? true : signature ? signature !== status.lastRequested.signature : null;
  const daysSinceRequest = status.lastRequested ? Math.floor(Math.max(0, now - Date.parse(status.lastRequested.at)) / DAY) : null;
  const overdue = hasData && (!status.lastRequested || (hasChanges !== false && daysSinceRequest !== null && daysSinceRequest >= status.intervalDays));
  const postponed = !!status.dismissedUntil && Date.parse(status.dismissedUntil) > now;
  return { hasData, hasChanges, daysSinceRequest, overdue, postponed,
    shouldShow: status.enabled && overdue && !postponed,
    reason: !status.lastRequested ? 'never' as const : overdue ? 'overdue' as const : 'none' as const,
  };
}
