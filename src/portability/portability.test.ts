import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, purchaseCommand, today } from '../test/finance-fixture';
import { plainBackup, encryptedBackup, readBackup } from './backup';
import { exportCsv, parseCsv, previewStatement, statementColumns } from './csv';
import { summary } from '../domain/queries';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe('Backup versionado e criptografia', () => {
  it('F: exportar/restaurar preserva centavos, chaves e relacionamentos de uma compra dividida', async () => {
    const f = fixture(); f.run({ ...purchaseCommand(f), installmentCount: 3 });
    const restored = await readBackup(plainBackup(f.state));
    expect(restored).toEqual(f.state); expect(summary(restored)).toEqual(summary(f.state));
    expect(restored.receipts).toEqual(f.state.receipts);
  });
  it('backup com AES-GCM não revela conteúdo e exige a senha correta', async () => {
    const f = fixture(); const encrypted = await encryptedBackup(f.state, 'senha de teste 123');
    expect(encrypted).not.toContain('Principal');
    expect(await readBackup(encrypted, 'senha de teste 123')).toEqual(f.state);
    await expect(readBackup(encrypted, 'senha incorreta')).rejects.toThrow(/Senha incorreta/);
    const tampered = JSON.parse(encrypted); tampered.data = tampered.data.slice(0, -4) + 'AAAA';
    await expect(readBackup(JSON.stringify(tampered), 'senha de teste 123')).rejects.toThrow();
  });
  it('rejeita versão desconhecida, relacionamento inválido e lançamento desequilibrado', async () => {
    const f = fixture(); const backup = JSON.parse(plainBackup(f.state));
    await expect(readBackup(JSON.stringify({ ...backup, version: 99 }))).rejects.toThrow();
    backup.state.entries[0].amount += 1;
    await expect(readBackup(JSON.stringify(backup))).rejects.toThrow(/desequilibrada/);
    await expect(readBackup('não é JSON')).rejects.toThrow(/JSON válido/);
  });
  it('explica a ausência de Web Crypto antes de exportar ou pedir outra senha', async () => {
    const state = fixture().state, encrypted = await encryptedBackup(state, 'senha teste 123');
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    await expect(encryptedBackup(state, 'senha teste 123')).rejects.toThrow(/HTTPS ou localhost/);
    await expect(readBackup(encrypted, 'senha teste 123')).rejects.toThrow(/HTTPS ou localhost/);
    expect(await readBackup(plainBackup(state))).toEqual(state);
  });
  it('lê snapshots anteriores sem as tabelas avançadas, preservando uma parcela por compra', async () => {
    const f = fixture(); f.run(purchaseCommand(f)); const backup = JSON.parse(plainBackup(f.state));
    backup.version = 2;
    for (const table of ['installments', 'receivableSchedules', 'goals', 'budgets', 'forecasts', 'recurrings', 'investments', 'loans']) delete backup.state[table];
    const restored = await readBackup(JSON.stringify(backup));
    expect(restored.installments).toHaveLength(1); expect(restored.installments[0].purchaseId).toBe(f.state.purchases[0].id);
    expect(summary(restored)).toEqual(summary(f.state));
  });
  it('formato atual preserva estorno e idempotência, mantendo leitura dos backups v2', async () => {
    const f = fixture(), legacy = JSON.parse(plainBackup(f.state)); legacy.version = 2;
    expect(await readBackup(JSON.stringify(legacy))).toEqual(f.state);
    const { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 1250, date: today, description: 'Duplicada' });
    f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Registro duplicado' });
    const backup = plainBackup(f.state); expect(JSON.parse(backup).version).toBe(5);
    expect(await readBackup(backup)).toEqual(f.state);
    expect(await readBackup(await encryptedBackup(f.state, 'senha de teste 123'), 'senha de teste 123')).toEqual(f.state);
    await expect(readBackup(JSON.stringify({ ...JSON.parse(backup), version: 2 }))).rejects.toThrow(/versão 3/);
  });
  it('rejeita estorno adulterado e tabelas ausentes no formato atual', async () => {
    const f = fixture(), { resultId } = f.run({ type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 100, date: today, description: 'Duplicada' });
    const reversed = f.run({ type: 'reverseMovement', operationId: resultId, reason: 'Duplicada' });
    const backup = JSON.parse(plainBackup(f.state));
    backup.state.entries.filter((item: { operationId: string }) => item.operationId === reversed.resultId).forEach((item: { amount: number }) => item.amount++);
    await expect(readBackup(JSON.stringify(backup))).rejects.toThrow(/incompatível/);
    const truncated = JSON.parse(plainBackup(f.state)); delete truncated.state.goals;
    await expect(readBackup(JSON.stringify(truncated))).rejects.toThrow();
  });
  it('identifica compra malformada em backup legado como entrada inválida', async () => {
    const backup = JSON.parse(plainBackup(fixture().state)); backup.version = 2;
    delete backup.state.installments; backup.state.purchases = [null];
    await expect(readBackup(JSON.stringify(backup))).rejects.toMatchObject({ name: 'ZodError' });
  });
});

describe('CSV, validação e deduplicação', () => {
  it('protege textos contra fórmulas, preserva aspas e centavos numéricos', () => {
    const f = fixture(); f.run({ type: 'renameCategory', id: f.ids.expense, name: '=SUM(1;2) "teste"' });
    const exported = exportCsv(f.state, 'categories');
    const rows = parseCsv(exported);
    expect(rows.some(row => row.includes('\'=SUM(1;2) "teste"'))).toBe(true);
    const entries = parseCsv(exportCsv(f.state, 'entries'));
    expect(entries[1][entries[0].indexOf('amount')]).toBe('100000');
  });
  it('G: importar o mesmo extrato reconhece duplicatas sem duplicar operações', async () => {
    const f = fixture();
    const csv = statementColumns.join(';') + `\nID-001;${today};expense;Almoço;1250;${f.ids.account};${f.ids.expense};\n`;
    const first = await previewStatement(csv, f.state); expect(first.commands).toHaveLength(1); f.run(first.commands[0]);
    const second = await previewStatement(csv, f.state); expect(second).toMatchObject({ duplicates: 1, commands: [] });
    await expect(previewStatement(csv.replace('Almoço', 'Outro fato'), f.state)).rejects.toThrow(/idempotência/);
  });
  it('valida todas as linhas e aceita mapeamento de cabeçalhos', async () => {
    const f = fixture();
    const csv = statementColumns.join(';') + `\nA;${today};expense;Válido;100;${f.ids.account};${f.ids.expense};\nB;2026-02-30;expense;Inválido;100;${f.ids.account};${f.ids.expense};`;
    const before = structuredClone(f.state);
    await expect(previewStatement(csv, f.state)).rejects.toThrow(); expect(f.state).toEqual(before);
    const mapped = csv.split('\n').slice(0, 2).join('\n').replace('externalId', 'identificador');
    const preview = await previewStatement(mapped, f.state, { externalId: 'identificador' }); expect(preview.commands).toHaveLength(1);
    expect(() => parseCsv('a;b\n"não fechou')).toThrow(/aspas/);
    await expect(previewStatement(mapped.replace(today, '2999-01-01'), f.state, { externalId: 'identificador' })).rejects.toThrow(/até hoje/);
  });
  it('duas linhas idênticas no mesmo arquivo são reconhecidas antes de gravar', async () => {
    const f = fixture(); const line = `A;${today};expense;Almoço;100;${f.ids.account};${f.ids.expense};`;
    const preview = await previewStatement(statementColumns.join(';') + '\n' + line + '\n' + line, f.state);
    expect(preview.commands).toHaveLength(1); expect(preview.duplicates).toBe(1);
  });
});
