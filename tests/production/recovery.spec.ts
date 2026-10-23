import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixture } from '../../src/test/finance-fixture';
import { plainBackup } from '../../src/portability/backup';

async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}

test('produção: recupera banco inconsistente com prévia, cópia e confirmação', async ({ page }, info) => {
  const state = fixture().state, backup = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(plainBackup(state)) };
  await page.goto('/'); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles(backup);
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.', { exact: true })).toBeVisible();
  // Simulate corruption only in this test's isolated native IndexedDB context.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('dexfin');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('entries', 'readwrite'), store = tx.objectStore('entries');
      const request = store.getAll();
      request.onsuccess = () => { const entry = request.result[0]; entry.amount++; store.put(entry); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.reload();
  await page.getByRole('button', { name: 'Abrir recuperação de dados', exact: true }).click();
  await page.getByLabel('Backup para recuperação', { exact: true }).setInputFiles(backup);
  await page.getByRole('button', { name: 'Validar backup para recuperação', exact: true }).click();
  await expect(page.getByText(/Backup validado: 2 contas/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('recuperacao.png'), fullPage: true });
  const recover = page.getByRole('button', { name: 'Confirmar recuperação', exact: true });
  await expect(recover).toBeDisabled();
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar cópia de diagnóstico', exact: true }).click();
  const path = info.outputPath('diagnostico.json'); await (await pendingDownload).saveAs(path);
  const diagnostic = JSON.parse(await readFile(path, 'utf8'));
  expect(diagnostic.format).toBe('dexfin-recovery');
  expect(diagnostic.tables.entries.some((entry: { id: string; amount: number }) => state.entries.some(original => original.id === entry.id && original.amount + 1 === entry.amount))).toBe(true);
  await expect(recover).toBeDisabled();
  await page.getByLabel('Guardei a cópia de diagnóstico e entendo que o backup substituirá todos os dados locais.', { exact: true }).check();
  await recover.click();
  await expect(page.getByRole('heading', { name: 'Recuperar com um backup', exact: true })).not.toBeVisible();
  await nav(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/1\.000,00/);
  await expect(page.getByRole('status', { name: 'Estado do armazenamento' })).toContainText('IndexedDB disponível');
  await page.reload(); await nav(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/1\.000,00/);
});

test('produção: nomes importados são texto e não disparam HTML ou pedidos externos', async ({ page }) => {
  const f = fixture(), name = '<img src="https://example.invalid/x" onerror="alert(1)">';
  f.run({ type: 'updateAccount', id: f.ids.account, name });
  const dialogs: string[] = [], external: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await page.goto('/'); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles({ name: 'nomes.json', mimeType: 'application/json', buffer: Buffer.from(plainBackup(f.state)) });
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.', { exact: true })).toBeVisible();
  await nav(page, 'Contas e saldos');
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.locator('img[src*="example.invalid"]')).toHaveCount(0);
  expect(dialogs).toEqual([]); expect(external).toEqual([]);
});
