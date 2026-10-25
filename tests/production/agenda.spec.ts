import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixture, purchaseCommand, uid } from '../../src/test/finance-fixture';
import type { State } from '../../src/domain/model';
import { plainBackup } from '../../src/portability/backup';

async function nav(page: Page, name: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
async function restore(page: Page, state: State) {
  await page.clock.setFixedTime(new Date('2026-01-10T15:00:00Z'));
  await page.goto('/'); await nav(page, 'Relatórios e backup');
  await page.getByLabel('Arquivo de backup', { exact: true }).setInputFiles({ name: 'agenda-fixture.json', mimeType: 'application/json', buffer: Buffer.from(plainBackup(state)) });
  await page.getByRole('button', { name: 'Validar e visualizar backup', exact: true }).click();
  await page.getByLabel('Entendo que o backup substituirá todos os dados locais atuais.', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.getByText('Backup restaurado com sucesso.', { exact: true })).toBeVisible();
}
function sorted(state: State) { return Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, [...rows].sort((a, b) => a.id.localeCompare(b.id))])); }
async function calendarFile(page: Page, path: string) {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar agenda (.ics)', exact: true }).click();
  const download = await pending; expect(download.suggestedFilename()).toMatch(/\.ics$/); await download.saveAs(path);
  return (await readFile(path, 'utf8')).replace(/\r\n[ \t]/g, '');
}
function forecast(f: ReturnType<typeof fixture>, name: string, date: string, kind: 'expense' | 'income' = 'expense') {
  return f.run({ type: 'createForecast', id: uid(), name, date, kind, accountId: f.ids.account, categoryId: kind === 'income' ? f.ids.income : f.ids.expense, ...(kind === 'income' ? { sourceId: f.ids.source } : {}), amount: 5000 });
}

test('produção: agenda vazia não inventa valores e calendário bissexto cabe na tela', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-01-10T15:00:00Z')); await page.goto('/'); await nav(page, 'Agenda e pendências');
  await expect(page.getByRole('heading', { name: 'Nenhuma pendência nesta seleção', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar agenda (.ics)', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Lista de pendências', exact: true })).not.toContainText('R$');
  await page.getByRole('button', { name: 'Calendário mensal', exact: true }).click();
  await page.getByLabel('Mês da agenda', { exact: true }).fill('2024-02');
  const calendar = page.getByRole('region', { name: 'Calendário financeiro mensal', exact: true });
  await expect(calendar.getByRole('button', { name: /pendência\(s\)$/ })).toHaveCount(29);
  await expect(calendar.getByRole('button', { name: '29/02/2024: 0 pendência(s)', exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: '29/02/2024: 0 pendência(s)', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(calendar.getByRole('button', { name: '29/02/2024: 0 pendência(s)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await calendar.screenshot({ path: info.outputPath('calendario-vazio-bissexto.png') });
});

test('produção: agenda reúne fontes, filtra dia e exporta ICS sem alterar o banco', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = fixture(), purchase = purchaseCommand(f);
  f.run({ ...purchase, installmentCount: 3, splits: purchase.splits.map((split, index) => index === 2 ? { ...split, dueDate: '2026-01-12' } : split) });
  f.run({ type: 'scheduleReceivable', receivableId: f.state.receivables[0].id, count: 2, firstDueDate: '2026-01-10' });
  f.run({ type: 'reimbursement', receivableId: f.state.receivables[0].id, accountId: f.ids.account, amount: 6000, date: '2026-01-07', description: 'Reembolso recebido de A' });
  for (const [direction, name, dueDate, amount] of [['borrowed', 'Principal a pagar', '2026-01-11', 15000], ['lent', 'Principal a receber', '2026-01-08', 5000]] as const) f.run({ type: 'createLoan', id: uid(), direction, description: name, accountId: f.ids.account, personId: f.ids.person, amount, date: '2026-01-05', dueDate });
  forecast(f, 'Conta de luz', '2026-01-09'); forecast(f, 'Salário a confirmar', '2026-01-10', 'income');
  const goal = uid(); f.run({ type: 'createGoal', id: goal, accountId: f.ids.account, name: 'Viagem', target: 30000, deadline: '2026-01-11' }); f.run({ type: 'fundGoal', id: goal, amount: 5000 });
  f.run({ type: 'createRule', id: uid(), name: 'Contribuição sugerida', mode: 'suggest', basisPoints: 1000, enabled: true, sourceIds: [f.ids.source] });
  f.run({ type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: '2026-01-06', description: 'Recebimento confirmado' });
  await restore(page, f.state); await nav(page, 'Visão geral');
  await page.getByRole('button', { name: 'Ver agenda e pendências', exact: true }).click();
  await expect(page.getByRole('button', { name: /Todos os itens/ })).toContainText('11');
  await expect(page.getByRole('button', { name: /Datas ultrapassadas/ })).toContainText('2');
  await expect(page.getByRole('button', { name: /Para hoje/ })).toContainText('1');
  await expect(page.getByRole('article', { name: 'Salário a confirmar', exact: true })).toContainText('Ainda não realizado');
  await page.getByRole('button', { name: 'Calendário mensal', exact: true }).click();
  await page.getByRole('button', { name: '11/01/2026: 2 pendência(s)', exact: true }).click();
  const list = page.getByRole('region', { name: 'Lista de pendências', exact: true });
  await expect(list.getByRole('article')).toHaveCount(2); await expect(list).toContainText('Viagem'); await expect(list).toContainText('Principal a pagar');
  await page.getByLabel('Pedir lembrete um dia antes dos eventos futuros', { exact: true }).check();
  const text = await calendarFile(page, info.outputPath('dia-11.ics'));
  expect(text.match(/BEGIN:VEVENT\r\n/g)).toHaveLength(2); expect(text.match(/BEGIN:VALARM\r\n/g)).toHaveLength(2);
  expect(text).toContain('DTSTART;VALUE=DATE:20260111'); expect(text).toContain('R$ 150\\,00'); expect(text).toContain('R$ 250\\,00');
  await page.getByRole('button', { name: 'Mostrar o mês inteiro', exact: true }).click();
  await page.getByLabel('Mês da agenda', { exact: true }).fill('2026-02'); await page.getByRole('combobox', { name: 'Tipo de pendência', exact: true }).selectOption('invoice');
  await expect(list.getByRole('article')).toHaveCount(1); await expect(list).toContainText('R$ 100,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('agenda-com-pendencias.png'), fullPage: true });
  await page.getByRole('button', { name: 'Todas as pendências', exact: true }).click(); await page.getByRole('button', { name: /Sem data.*Ver pendências/ }).click();
  await expect(list.getByRole('article')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Baixar agenda (.ics)', exact: true })).toBeDisabled();
  await nav(page, 'Relatórios e backup'); await page.getByLabel('Criptografar backup com senha', { exact: true }).uncheck();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
  const path = info.outputPath('apos-agenda.json'); await (await pending).saveAs(path);
  const exported = JSON.parse(await readFile(path, 'utf8')); expect(exported.version).toBe(5); expect(sorted(exported.state)).toEqual(sorted(f.state));
});

test('produção: pagamento em outra aba retira pendência, e a agenda funciona após recarga offline', async ({ page, context }) => {
  const f = fixture(); forecast(f, 'Conta de luz', '2026-01-09'); forecast(f, 'Outro compromisso', '2026-01-11');
  await restore(page, f.state); await nav(page, 'Agenda e pendências');
  await expect(page.getByRole('article', { name: 'Conta de luz', exact: true })).toBeVisible();
  const other = await context.newPage(); await other.clock.setFixedTime(new Date('2026-01-10T15:00:00Z')); await other.goto('/'); await nav(other, 'Planejamento e metas');
  await other.getByLabel('Mês do planejamento', { exact: true }).fill('2026-01');
  await other.getByRole('article').filter({ has: other.getByRole('heading', { name: /Conta de luz/ }) }).getByRole('button', { name: 'Confirmar realização', exact: true }).click();
  const dialog = other.getByRole('dialog', { name: 'Confirmar realização', exact: true }); await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('article', { name: 'Conta de luz', exact: true })).toHaveCount(0); await other.close();
  await expect(page.getByText('Disponível offline neste navegador.', { exact: true })).toBeVisible(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true); await page.reload(); await nav(page, 'Agenda e pendências');
  const item = page.getByRole('article', { name: 'Outro compromisso', exact: true }); await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Abrir em Planejamento e metas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Planejamento e metas', exact: true })).toBeVisible();
  await nav(page, 'Contas e saldos'); await expect(page.getByTestId('accounts-total')).toHaveText(/950,00/);
});

test('produção: exportação inclui todas as páginas e a referência muda ao retomar no dia seguinte', async ({ page }, info) => {
  test.setTimeout(60000);
  const f = fixture(); forecast(f, 'Compromisso do dia 10', '2026-01-10');
  for (let index = 1; index <= 25; index++) forecast(f, `Compromisso ${index}`, '2026-01-11');
  await restore(page, f.state); await nav(page, 'Agenda e pendências');
  const list = page.getByRole('region', { name: 'Lista de pendências', exact: true });
  await expect(list.getByRole('article')).toHaveCount(20); await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima página', exact: true }).click(); await expect(list.getByRole('article')).toHaveCount(6);
  const text = await calendarFile(page, info.outputPath('todas-as-paginas.ics')); expect(text.match(/BEGIN:VEVENT\r\n/g)).toHaveLength(26); expect(text).not.toContain('VALARM');
  await page.clock.setFixedTime(new Date('2026-01-11T03:10:00Z')); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: /Para hoje/ })).toContainText('25');
  await expect(page.getByRole('button', { name: /Datas ultrapassadas/ })).toContainText('1');
  await page.getByRole('button', { name: /Para hoje/ }).click(); await expect(list.getByRole('article', { name: 'Compromisso do dia 10', exact: true })).toHaveCount(0);
  await expect(page.getByText('Página 1 de 2', { exact: true })).toBeVisible();
});
