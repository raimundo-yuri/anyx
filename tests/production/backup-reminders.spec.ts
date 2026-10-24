import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { BACKUP_STATUS_KEY } from '../../src/application/backup-status';

async function nav(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}

async function storageReady(page: Page) {
  await expect(page.getByRole('status', { name: 'Estado do armazenamento' })).toContainText('IndexedDB disponível');
}

async function createAccount(page: Page, name: string) {
  await nav(page, 'Contas e saldos');
  await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill(name);
  await dialog.getByLabel('Saldo inicial (R$)', { exact: true }).fill('100,00');
  await dialog.getByLabel('Data de abertura', { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

const reminder = (page: Page) => page.getByRole('complementary', { name: 'Lembrete de backup', exact: true });
const preferences = (page: Page) => page.getByRole('region', { name: 'Preferências de backup', exact: true });

test('produção: lembrete começa sem dados, acompanha cadastro e registra somente download solicitado', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/'); await storageReady(page);
  await expect(reminder(page)).toHaveCount(0);
  await createAccount(page, 'Conta do lembrete');
  await expect(reminder(page)).toBeVisible();
  await expect(reminder(page)).toContainText('Guarde uma cópia dos seus registros');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('backup-reminder.png'), fullPage: true });
  await reminder(page).getByRole('button', { name: 'Abrir backup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backup completo', exact: true })).toBeVisible();
  await expect(preferences(page)).toContainText('Ainda não há uma solicitação de download de backup registrada');
  await expect(page.getByLabel('Criptografar backup com senha', { exact: true })).toBeChecked();
  await page.getByLabel('Senha do backup', { exact: true }).fill('senha de backup teste 123');
  const requested = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  const path = info.outputPath('backup-com-lembrete.json');
  await (await requested).saveAs(path);
  const text = await readFile(path, 'utf8');
  expect(JSON.parse(text).format).toBe('dexfin-encrypted');
  expect(text).not.toContain('Conta do lembrete');
  await expect(preferences(page)).toContainText('Último download solicitado em');
  await expect(preferences(page)).toContainText('Não há cópia automática nem confirmação de que o arquivo foi guardado.');
  await expect(page.getByLabel('Senha do backup', { exact: true })).toHaveValue('');
  await expect(reminder(page)).toHaveCount(0);
  const marker = await page.evaluate(key => localStorage.getItem(key), BACKUP_STATUS_KEY);
  expect(marker).not.toBeNull();
  expect(marker).not.toContain('Conta do lembrete'); expect(marker).not.toContain('senha de backup teste 123');
  expect(JSON.parse(marker!).lastRequested.at).toBeTruthy();
  await page.reload(); await storageReady(page);
  await expect(reminder(page)).toHaveCount(0);
  await nav(page, 'Relatórios e backup');
  await expect(preferences(page)).toContainText('Último download solicitado em');
});

test('produção: adiamento e preferências persistem, e cadastro alterado após cópia antiga avisa novamente', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/'); await storageReady(page);
  await createAccount(page, 'Conta da preferência');
  await expect(reminder(page)).toBeVisible();
  await reminder(page).getByRole('button', { name: 'Adiar por 24 horas', exact: true }).click();
  await expect(reminder(page)).toHaveCount(0);
  await page.reload(); await storageReady(page);
  await expect(reminder(page)).toHaveCount(0);
  await nav(page, 'Relatórios e backup');
  await preferences(page).getByLabel('Intervalo do lembrete de backup', { exact: true }).selectOption('14');
  await preferences(page).getByLabel('Ativar lembretes de backup neste navegador', { exact: true }).uncheck();
  await page.reload(); await storageReady(page); await nav(page, 'Relatórios e backup');
  await expect(preferences(page).getByLabel('Intervalo do lembrete de backup', { exact: true })).toHaveValue('14');
  await expect(preferences(page).getByLabel('Ativar lembretes de backup neste navegador', { exact: true })).not.toBeChecked();
  await preferences(page).getByLabel('Ativar lembretes de backup neste navegador', { exact: true }).check();
  await page.getByLabel('Senha do backup', { exact: true }).fill('senha de backup teste 123');
  const requested = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  await requested;
  await expect(preferences(page)).toContainText('Último download solicitado em');
  // Age only nonfinancial backup metadata; the account and subsequent edit use the actual UI.
  await page.evaluate(key => {
    const marker = JSON.parse(localStorage.getItem(key)!);
    marker.lastRequested.at = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(marker));
  }, BACKUP_STATUS_KEY);
  await page.reload(); await storageReady(page);
  await expect(reminder(page)).toHaveCount(0);
  await nav(page, 'Contas e saldos');
  await page.getByRole('button', { name: 'Editar conta Conta da preferência', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar conta', exact: true });
  await edit.getByLabel('Nome da conta', { exact: true }).fill('Conta revisada depois do backup');
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(edit).not.toBeVisible();
  await expect(reminder(page)).toBeVisible();
  await expect(reminder(page)).toContainText('Há alterações para guardar em um novo backup');
  await expect(reminder(page)).toContainText('Seus dados mudaram desde então.');
  await reminder(page).getByRole('button', { name: 'Preferências', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Lembretes de backup', exact: true });
  await expect(settings.getByLabel('Intervalo do lembrete de backup', { exact: true })).toHaveValue('14');
  await settings.getByLabel('Ativar lembretes de backup neste navegador', { exact: true }).uncheck();
  await settings.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.reload(); await storageReady(page);
  await expect(reminder(page)).toHaveCount(0);
  await nav(page, 'Relatórios e backup');
  await expect(preferences(page).getByLabel('Ativar lembretes de backup neste navegador', { exact: true })).not.toBeChecked();
});
