/** Suggestions only: no accounts, balances or confirmed income are created. */
export const suggestedCategories = [
  ['Alimentação', 'expense'], ['Moradia e contas', 'expense'], ['Transporte', 'expense'],
  ['Educação', 'expense'], ['Compras e tecnologia', 'expense'], ['Saúde e bem-estar', 'expense'],
  ['Lazer e entretenimento', 'expense'], ['Assinaturas e serviços digitais', 'expense'],
  ['Família e presentes', 'expense'], ['Doações e contribuições', 'expense'],
  ['Tarifas e encargos financeiros', 'expense'], ['Outros gastos', 'expense'],
  ['Trabalho', 'income'], ['Benefícios estudantis', 'income'], ['Outras receitas', 'income'],
] as const;
export const suggestedSources = ['Estágio', 'Ajuda dos pais', 'Pé-de-Meia', 'Benefícios estudantis', 'Remuneração Hostweb', 'Outras fontes'] as const;
export const institutions = ['Nubank', 'Mercado Pago', 'Banco do Brasil', 'Caixa Tem', 'Inter', 'Dinheiro em espécie'] as const;
export const catalogId = (type: 'category' | 'source', index: number) =>
  `${type === 'category' ? 'cafe0000' : 'feed0000'}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
