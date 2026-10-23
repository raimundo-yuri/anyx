import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('Estrutura inicial do DexFin', () => {
  it('informa a etapa atual sem apresentar dados financeiros fictícios', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(await screen.findByText(/Cadastre suas contas, organize categorias/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(document.title).toBe('DexFin · Finanças pessoais');
  });

  it('permite consultar o plano e retornar ao início', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Conhecer o projeto/ }));
    expect(screen.getByRole('heading', { name: 'Sobre o projeto' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent('Persistência e motor financeiro — concluído');
    await user.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });

  it('expõe as limitações de armazenamento e recursos planejados', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Privacidade' }));
    expect(screen.getByText(/não é criptografado/)).toBeInTheDocument();
    expect(screen.getByText(/cache offline não é ativado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Privacidade' })).toHaveAttribute('aria-current', 'page');
  });
});
