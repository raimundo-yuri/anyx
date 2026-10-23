import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localRepository } from '../../infrastructure/database';
import { emptyState } from '../../domain/model';
import { StorageStatus } from './StorageStatus';

afterEach(() => vi.restoreAllMocks());

describe('Estado do armazenamento', () => {
  it('informa disponibilidade apenas depois de consultar o banco', async () => {
    vi.spyOn(localRepository, 'read').mockResolvedValue(emptyState());
    render(<StorageStatus />);
    expect(await screen.findByText(/IndexedDB disponível/)).toBeInTheDocument();
  });
  it('não expõe detalhes internos e permite tentar novamente após falha', async () => {
    vi.spyOn(localRepository, 'read').mockRejectedValueOnce(new Error('detalhe privado do banco')).mockResolvedValueOnce(emptyState());
    render(<StorageStatus />);
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText(/detalhe privado/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Não limpe o navegador');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText(/IndexedDB disponível/)).toBeInTheDocument();
  });
});
