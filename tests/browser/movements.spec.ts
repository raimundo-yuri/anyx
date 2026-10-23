import { expect, test, type Page } from '@playwright/test';

async function navigate(page: Page, label: string) {
  const target = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: label, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Abrir menu de navegação', exact: true }).click();
  await target.click();
}
async function createAccount(page: Page, name: string, balance: string) {
  await navigate(page, 'Contas e saldos');
  await page.getByRole('button', { name: 'Nova conta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill(name);
  await dialog.getByLabel('Saldo inicial (R$)', { exact: true }).fill(balance);
  await dialog.getByLabel('Data de abertura', { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function installSuggestions(page: Page) {
  await navigate(page, 'Categorias e fontes');
  await page.getByRole('button', { name: 'Adicionar sugestões' }).click();
  await expect(page.getByRole('button', { name: 'Editar categoria Alimentação', exact: true })).toBeVisible();
}
async function openMovement(page: Page, type: 'Receita' | 'Despesa' | 'Transferência', amount: string, description: string) {
  await navigate(page, 'Movimentações');
  await page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova movimentação', exact: true });
  await dialog.getByRole('button', { name: type, exact: true }).click();
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill(amount);
  await dialog.getByLabel('Descrição', { exact: true }).fill(description);
  await dialog.getByLabel('Data', { exact: true }).fill('2026-01-05');
  await dialog.getByLabel(type === 'Transferência' ? 'Conta de origem' : 'Conta', { exact: true }).selectOption({ label: 'Conta principal' });
  return dialog;
}

test('cadastros e movimentações pela interface preservam saldos e histórico após recarga', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await createAccount(page, 'Conta principal', '1.000,00');
  await createAccount(page, 'Carteira', '0,00');
  await page.getByRole('button', { name: 'Arquivar conta Carteira', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Carteira', exact: true })).toHaveCount(0);
  await page.getByLabel('Mostrar arquivadas').check();
  await page.getByRole('button', { name: 'Reativar conta Carteira', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Carteira', exact: true })).toBeVisible();
  await installSuggestions(page);
  let dialog = await openMovement(page, 'Receita', '200,00', 'Bolsa recebida');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Trabalho' });
  await dialog.getByLabel('Fonte de receita', { exact: true }).selectOption({ label: 'Estágio' });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row', { name: /Bolsa recebida/ })).toContainText('200,00');

  dialog = await openMovement(page, 'Despesa', '50,00', 'Almoço de sexta');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  dialog = await openMovement(page, 'Transferência', '100,00', 'Dinheiro na carteira');
  await dialog.getByLabel('Conta de destino', { exact: true }).selectOption({ label: 'Carteira' });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row', { name: /Dinheiro na carteira/ })).toContainText('Conta principal → Carteira');
  await page.getByLabel('Filtrar por tipo').selectOption('expense');
  await expect(page.getByRole('row', { name: /Almoço de sexta/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Bolsa recebida/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await page.getByLabel('Buscar movimentações').fill('não existe');
  await expect(page.getByText('Nenhum registro com esses filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).first().click();

  await navigate(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/1\.150,00/);
  const main = page.getByRole('article', { name: 'Conta principal', exact: true });
  const wallet = page.getByRole('article', { name: 'Carteira', exact: true });
  await expect(main).toContainText('1.050,00');
  await expect(wallet).toContainText('100,00');
  await page.getByRole('button', { name: 'Arquivar conta Carteira', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('saldo zero');
  await page.getByRole('button', { name: 'Editar conta Conta principal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill('Conta do dia a dia');
  await dialog.getByLabel('Instituição (opcional)', { exact: true }).fill('Nubank');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('article', { name: 'Conta do dia a dia', exact: true })).toContainText('1.050,00');
  await page.reload();
  await navigate(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/1\.150,00/);
  await page.getByRole('article', { name: 'Conta do dia a dia', exact: true }).getByRole('button', { name: 'Ver extrato' }).click();
  await expect(page.getByLabel('Filtrar por conta')).not.toHaveValue('');
  await expect(page.getByRole('row', { name: /Almoço de sexta/ })).toContainText('Conta do dia a dia');
  await page.getByLabel('Data inicial').fill('2026-02-01');
  await page.getByLabel('Data final').fill('2026-01-01');
  await expect(page.getByRole('alert')).toContainText('período válido');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.getByRole('row', { name: /Almoço de sexta/ }).getByRole('cell').last().evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('movements.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('arquivar categorias preserva histórico e trocar o tipo mantém os campos', async ({ page }) => {
  await page.goto('/');
  await createAccount(page, 'Conta principal', '100,00');
  await installSuggestions(page);
  let dialog = await openMovement(page, 'Despesa', '12,50', 'Café e pão');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByRole('button', { name: 'Receita', exact: true }).click();
  await expect(dialog.getByLabel('Valor (R$)', { exact: true })).toHaveValue('12,50');
  await expect(dialog.getByLabel('Descrição', { exact: true })).toHaveValue('Café e pão');
  await dialog.getByRole('button', { name: 'Despesa', exact: true }).click();
  await expect(dialog.getByLabel('Categoria', { exact: true }).locator('option:checked')).toHaveText('Alimentação');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, 'Categorias e fontes');
  await page.getByRole('button', { name: 'Arquivar categoria Alimentação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar categoria Alimentação', exact: true })).toHaveCount(0);
  await page.getByLabel('Mostrar arquivadas').check();
  await expect(page.getByRole('button', { name: 'Reativar categoria Alimentação', exact: true })).toBeVisible();
  await navigate(page, 'Movimentações');
  await expect(page.getByRole('row', { name: /Café e pão/ })).toContainText('Alimentação');
  await page.getByRole('button', { name: 'Nova movimentação', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova movimentação', exact: true });
  await expect(dialog.getByLabel('Categoria', { exact: true }).getByRole('option', { name: 'Alimentação', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('erro de resposta após commit mantém campos e permite repetir sem duplicar a movimentação', async ({ page }) => {
  await page.goto('/');
  await createAccount(page, 'Conta principal', '100,00');
  await installSuggestions(page);
  const dialog = await openMovement(page, 'Despesa', '10,00', 'Retentativa segura');
  await dialog.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentação' });
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('1.25');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('valor brasileiro válido');
  await dialog.getByLabel('Valor (R$)', { exact: true }).fill('10,00');
  await dialog.getByLabel('Data', { exact: true }).fill('2025-12-31');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('abertura da conta');
  await dialog.getByLabel('Data', { exact: true }).fill('2026-01-05');
  await page.evaluate(async () => {
    const modulePath = '/src/infrastructure/database.ts';
    const { localRepository } = await import(modulePath);
    const original = localRepository.execute.bind(localRepository);
    let once = true;
    localRepository.execute = async (command: unknown) => {
      const result = await original(command);
      if (once) { once = false; throw new Error('Detalhe interno que não deve aparecer'); }
      return result;
    };
  });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Seus campos foram mantidos');
  await expect(dialog).not.toContainText('Detalhe interno');
  await expect(dialog.getByLabel('Valor (R$)', { exact: true })).toHaveValue('10,00');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row', { name: /Retentativa segura/ })).toHaveCount(1);
  await navigate(page, 'Contas e saldos');
  await expect(page.getByTestId('accounts-total')).toHaveText(/90,00/);
});

test('categorias e fontes personalizadas podem ser criadas e renomeadas sem movimentar dinheiro', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Categorias e fontes');
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova categoria', exact: true });
  await dialog.getByLabel('Nome da categoria', { exact: true }).fill('Serviços prestados');
  await dialog.getByLabel('Natureza', { exact: true }).selectOption('income');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Editar categoria Serviços prestados', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar categoria', exact: true });
  await expect(dialog.getByLabel('Natureza', { exact: true })).toBeDisabled();
  await dialog.getByLabel('Nome da categoria', { exact: true }).fill('Trabalho autônomo');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar categoria Trabalho autônomo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nova fonte', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova fonte de receita', exact: true });
  await dialog.getByLabel('Nome da fonte', { exact: true }).fill('Projeto pessoal');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Editar fonte Projeto pessoal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar fonte de receita', exact: true });
  await dialog.getByLabel('Nome da fonte', { exact: true }).fill('Freelance');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await navigate(page, 'Categorias e fontes');
  await expect(page.getByRole('button', { name: 'Editar fonte Freelance', exact: true })).toBeVisible();
  await navigate(page, 'Movimentações');
  await expect(page.getByText('Uma nova história para seu dinheiro')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova movimentação', exact: true })).toBeDisabled();
});

test('uma segunda aba acompanha os cadastros e saldos sem recarregar', async ({ page }) => {
  await page.goto('/');
  const second = await page.context().newPage();
  await second.goto('/');
  await navigate(second, 'Contas e saldos');
  await expect(second.getByRole('heading', { name: 'Seu primeiro passo: uma conta' })).toBeVisible();
  await createAccount(page, 'Conta principal', '100,00');
  await expect(second.getByRole('heading', { name: 'Conta principal', exact: true })).toBeVisible();
  await expect(second.getByTestId('accounts-total')).toHaveText(/100,00/);
  await page.getByRole('button', { name: 'Editar conta Conta principal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar conta', exact: true });
  await dialog.getByLabel('Nome da conta', { exact: true }).fill('Conta atualizada');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(second.getByRole('heading', { name: 'Conta atualizada', exact: true })).toBeVisible();
  await second.close();
});
