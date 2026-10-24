import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState } from '../domain/model';
import { fixture, uid } from '../test/finance-fixture';

let backup: typeof import('./backup-status');
const exportedAt = '2026-01-01T12:00:00.000Z';
const day = 24 * 60 * 60 * 1000;
const instant = (days: number) => Date.parse(exportedAt) + days * day;

beforeEach(async () => {
  vi.resetModules(); localStorage.clear(); vi.stubGlobal('crypto', webcrypto);
  backup = await import('./backup-status');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Lembretes locais de backup', () => {
  it('não avisa em um banco vazio, mas inclui cadastros que ainda não tenham movimentações', async () => {
    const blank = emptyState();
    expect(backup.backupReminderStatus(blank, backup.defaultBackupStatus(), await backup.backupSignature(blank), instant(0)).shouldShow).toBe(false);
    blank.people.push({ id: uid(), createdAt: exportedAt, name: 'Pessoa cadastrada' });
    expect(backup.backupReminderStatus(blank, backup.defaultBackupStatus(), await backup.backupSignature(blank), instant(0))).toMatchObject({ hasData: true, reason: 'never', shouldShow: true });
  });

  it('registra somente metadados da solicitação, sem guardar nomes, registros ou senhas', async () => {
    const f = fixture();
    expect(await backup.markBackupRequested(f.state, exportedAt)).toBe(true);
    const status = backup.readBackupStatus(), stored = localStorage.getItem(backup.BACKUP_STATUS_KEY)!;
    expect(status.lastRequested).toMatchObject({ at: exportedAt, signature: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(stored).not.toContain('Principal'); expect(stored).not.toContain(f.ids.account); expect(stored).not.toContain('senha');
    expect(backup.backupReminderStatus(f.state, status, await backup.backupSignature(f.state), instant(1))).toMatchObject({ hasChanges: false, shouldShow: false });
  });

  it('detecta alteração de cadastro e planejamento sem depender de quantidade de operações', async () => {
    const f = fixture(); await backup.markBackupRequested(f.state, exportedAt);
    const altered = structuredClone(f.state); altered.categories[0].name = 'Categoria revisada';
    expect(altered.operations.length).toBe(f.state.operations.length);
    expect(backup.backupReminderStatus(altered, backup.readBackupStatus(), await backup.backupSignature(altered), instant(8))).toMatchObject({ hasChanges: true, overdue: true, shouldShow: true });
    const planning = structuredClone(f.state);
    planning.goals.push({ id: uid(), createdAt: exportedAt, name: 'Meta', accountId: f.ids.account, target: 10000, deadline: '2026-12-31' });
    expect(await backup.backupSignature(planning)).not.toBe(await backup.backupSignature(f.state));
  });

  it('aguarda o intervalo configurado e não insiste em exportar dados que não mudaram', async () => {
    const f = fixture(); await backup.markBackupRequested(f.state, exportedAt);
    const signature = await backup.backupSignature(f.state);
    expect(backup.backupReminderStatus(f.state, backup.readBackupStatus(), signature, instant(60)).shouldShow).toBe(false);
    const changed = structuredClone(f.state); changed.accounts[0].name = 'Outro nome';
    const changedSignature = await backup.backupSignature(changed);
    expect(backup.backupReminderStatus(changed, backup.readBackupStatus(), changedSignature, instant(6)).shouldShow).toBe(false);
    expect(backup.backupReminderStatus(changed, backup.readBackupStatus(), changedSignature, instant(8)).shouldShow).toBe(true);
    backup.updateBackupPreferences({ intervalDays: 30 });
    expect(backup.backupReminderStatus(changed, backup.readBackupStatus(), changedSignature, instant(8)).shouldShow).toBe(false);
    expect(backup.backupReminderStatus(changed, backup.readBackupStatus(), changedSignature, instant(31)).shouldShow).toBe(true);
    backup.updateBackupPreferences({ enabled: false });
    expect(backup.backupReminderStatus(changed, backup.readBackupStatus(), changedSignature, instant(31)).shouldShow).toBe(false);
  });

  it('adiar por 24 horas persiste entre leituras e não reaparece a cada mudança de dados', async () => {
    const f = fixture(); backup.postponeBackupReminder(exportedAt);
    const status = backup.readBackupStatus();
    expect(backup.backupReminderStatus(f.state, status, await backup.backupSignature(f.state), instant(0.9)).shouldShow).toBe(false);
    const changed = structuredClone(f.state); changed.accounts[0].name = 'Conta revisada';
    expect(backup.backupReminderStatus(changed, status, await backup.backupSignature(changed), instant(0.9)).shouldShow).toBe(false);
    expect(backup.backupReminderStatus(changed, status, await backup.backupSignature(changed), instant(1.1)).shouldShow).toBe(true);
  });

  it('restauração não alega uma nova exportação nem carrega marcador de outro estado', async () => {
    const f = fixture(); await backup.markBackupRequested(f.state, exportedAt);
    const restoredAt = '2026-02-01T12:00:00.000Z'; backup.markBackupRestored(restoredAt);
    const status = backup.readBackupStatus();
    expect(status.lastRequested).toBeUndefined(); expect(status.restoredAt).toBe(restoredAt);
    expect(backup.backupReminderStatus(f.state, status, await backup.backupSignature(f.state), Date.parse(restoredAt) + 1000).shouldShow).toBe(false);
    expect(backup.backupReminderStatus(f.state, status, await backup.backupSignature(f.state), Date.parse(restoredAt) + 2 * day)).toMatchObject({ reason: 'never', shouldShow: true });
  });

  it('exclusão explícita pode limpar o rastreio mantendo apenas as preferências do lembrete', async () => {
    await backup.markBackupRequested(fixture().state, exportedAt);
    backup.updateBackupPreferences({ intervalDays: 30 });
    backup.postponeBackupReminder(exportedAt);
    backup.resetBackupTracking();
    expect(backup.readBackupStatus()).toEqual({ version: 1, enabled: true, intervalDays: 30 });
  });

  it('a assinatura não muda só pela ordem dos registros ou das propriedades', async () => {
    const f = fixture(), reordered = structuredClone(f.state);
    reordered.accounts.reverse();
    reordered.categories = reordered.categories.map(item => Object.fromEntries(Object.entries(item).reverse()) as typeof item);
    expect(await backup.backupSignature(reordered)).toBe(await backup.backupSignature(f.state));
  });

  it('ignora metadados inválidos e não anuncia exportação quando falta Web Crypto', async () => {
    const state = fixture().state;
    localStorage.setItem(backup.BACKUP_STATUS_KEY, '{"version":99,"enabled":true,"intervalDays":-1}');
    expect(backup.readBackupStatus()).toEqual(backup.defaultBackupStatus());
    vi.stubGlobal('crypto', {});
    expect(await backup.markBackupRequested(state, exportedAt)).toBe(false);
    expect(backup.readBackupStatus().lastRequested).toBeUndefined();
  });

  it('falha no localStorage preserva as preferências na sessão sem bloquear a ação', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('QuotaExceededError'); });
    expect(backup.updateBackupPreferences({ enabled: false, intervalDays: 14 })).toBe(false);
    expect(backup.readBackupStatus()).toMatchObject({ enabled: false, intervalDays: 14 });
    const f = fixture(), before = structuredClone(f.state);
    await expect(backup.markBackupRequested(f.state, exportedAt)).resolves.toBe(false);
    expect(f.state).toEqual(before);
    expect(backup.readBackupStatus().lastRequested?.at).toBe(exportedAt);
  });
});
