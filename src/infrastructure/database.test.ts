import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase, IndexedDbFinanceRepository } from './database';
import { summary, balance } from '../domain/queries';
import { FinanceService } from '../application/finance-service';
import { fixture, purchaseCommand, today, uid } from '../test/finance-fixture';

describe('Repositório IndexedDB e unidade de trabalho', () => {
  let database: FinanceDatabase;
  let repository: IndexedDbFinanceRepository;
  let f: ReturnType<typeof fixture>;
  const connections: FinanceDatabase[] = [];

  beforeEach(async () => {
    database = new FinanceDatabase(`dexfin-test-${uid()}`);
    repository = new IndexedDbFinanceRepository(database);
    f = fixture();
    for (const receipt of f.state.receipts) await repository.execute(JSON.parse(receipt.payload));
  });
  afterEach(async () => {
    for (const connection of connections.splice(0)) connection.close();
    await database.delete();
  });

  it('um banco recém-criado não contém dados fictícios', async () => {
    const blank = new FinanceDatabase(`dexfin-blank-${uid()}`);
    try {
      expect(summary(await new IndexedDbFinanceRepository(blank).read())).toMatchObject({ cash: 0, income: 0, expenses: 0 });
      expect((await new IndexedDbFinanceRepository(blank).read()).accounts).toEqual([]);
      expect(blank.verno).toBe(6);
    } finally { await blank.delete(); }
  });

  it('preserva operações e relacionamentos após fechar e reabrir a conexão', async () => {
    await repository.execute(purchaseCommand(f));
    const before = await repository.read();
    const receivable = before.receivables.find(item => item.amount === 10000)!;
    await repository.execute({ key: uid(), type: 'reimbursement', receivableId: receivable.id, accountId: f.ids.account, amount: 6000, date: today, description: 'Reembolso' });
    const persisted = await repository.read();
    database.close();
    await database.open();
    expect(await repository.read()).toEqual(persisted);
    expect(balance(await repository.read(), 'receivable', receivable.id)).toBe(4000);
    expect(summary(await repository.read())).toMatchObject({ cash: 106000, expenses: 12000, income: 0, invoices: 30000 });
  });

  it('retorna o mesmo resultado para uma retentativa após reabrir o banco', async () => {
    const command = purchaseCommand(f);
    const result = await repository.execute(command);
    database.close(); await database.open();
    expect(await repository.execute(command)).toEqual({ ...result, replayed: true });
    expect((await repository.read()).purchases).toHaveLength(1);
    await expect(repository.execute({ ...command, description: 'Alterado' })).rejects.toThrow(/idempotência/);
  });

  it('falha de escrita no armazenamento reverte compra, fatura, divisões, lançamentos e chave', async () => {
    const before = await repository.read();
    const fail = () => { throw new Error('Falha de escrita simulada'); };
    database.rows('entries').hook('creating', fail);
    const command = purchaseCommand(f);
    await expect(repository.execute(command)).rejects.toThrow(/Falha de escrita simulada/);
    database.rows('entries').hook('creating').unsubscribe(fail);
    expect(await repository.read()).toEqual(before);
    expect((await repository.execute(command)).replayed).toBe(false);
    expect((await repository.read()).purchases).toHaveLength(1);
  });

  it('reserva e receita também são revertidas juntas se o armazenamento falhar', async () => {
    await repository.execute({ key: uid(), type: 'createRule', id: uid(), name: 'Reserva', enabled: true, basisPoints: 1000, sourceIds: [f.ids.source], mode: 'reserve' });
    const before = await repository.read();
    const fail = () => { throw new Error('Sem espaço para reserva'); };
    database.rows('reserves').hook('creating', fail);
    await expect(repository.execute({ key: uid(), type: 'income', amount: 10000, accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, description: 'Receita', date: today })).rejects.toThrow(/Sem espaço/);
    database.rows('reserves').hook('creating').unsubscribe(fail);
    expect(await repository.read()).toEqual(before);
  });

  it('duas conexões concorrentes não podem reembolsar mais que o pendente', async () => {
    await repository.execute(purchaseCommand(f));
    const receivableId = (await repository.read()).receivables.find(item => item.amount === 10000)!.id;
    const connection = new FinanceDatabase(database.name); connections.push(connection);
    const other = new IndexedDbFinanceRepository(connection);
    const reimburse = () => ({ key: uid(), type: 'reimbursement', receivableId, accountId: f.ids.account, amount: 6000, date: today, description: 'Parcial' });
    const outcomes = await Promise.allSettled([repository.execute(reimburse()), other.execute(reimburse())]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(item => item.status === 'rejected')).toHaveLength(1);
    expect(balance(await repository.read(), 'receivable', receivableId)).toBe(4000);
    expect((await repository.read()).operations.filter(item => item.kind === 'reimbursement')).toHaveLength(1);
  });

  it('submissões simultâneas com a mesma chave geram somente uma compra', async () => {
    const command = purchaseCommand(f);
    const results = await Promise.all([repository.execute(command), repository.execute(command)]);
    expect(results.map(item => item.replayed).sort()).toEqual([false, true]);
    expect((await repository.read()).purchases).toHaveLength(1);
  });

  it('falha de relacionamento é rejeitada sem alterar nenhuma tabela', async () => {
    const before = await repository.read();
    await expect(repository.execute({ ...purchaseCommand(f), cardId: uid() })).rejects.toThrow(/Cartão/);
    expect(await repository.read()).toEqual(before);
  });

  it('não lê silenciosamente um banco com integridade comprometida', async () => {
    const entries = (await repository.read()).entries;
    await database.rows('entries').update(entries[0].id, { amount: entries[0].amount + 1 });
    await expect(repository.read()).rejects.toThrow(/desequilibrada/);
  });

  it('serviço de aplicação consulta o mesmo saldo persistido sem depender da interface', async () => {
    const service = new FinanceService(repository);
    await service.submit({ key: uid(), type: 'transfer', fromId: f.ids.account, toId: f.ids.other, amount: 10000, date: today, description: 'Entre contas próprias' });
    expect(await service.overview()).toMatchObject({ cash: 100000, income: 0, expenses: 0, netWorth: 100000 });
  });
  it('duas conexões só estornam uma vez e a retentativa persiste após reabrir', async () => {
    const income = { key: uid(), type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today, description: 'Duplicada' };
    await repository.execute(income);
    const connection = new FinanceDatabase(database.name); connections.push(connection);
    const other = new IndexedDbFinanceRepository(connection);
    const commands = [0, 1].map(() => ({ key: uid(), type: 'reverseMovement', operationId: income.key, reason: 'Receita duplicada' }));
    const outcomes = await Promise.allSettled([repository.execute(commands[0]), other.execute(commands[1])]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(item => item.status === 'rejected')).toHaveLength(1);
    const winner = outcomes.findIndex(item => item.status === 'fulfilled');
    database.close(); await database.open();
    expect((await repository.execute(commands[winner])).replayed).toBe(true);
    const state = await repository.read();
    expect(state.operations.filter(item => item.kind === 'reversal')).toHaveLength(1);
    expect(summary(state)).toMatchObject({ cash: 100000, income: 0 });
  });
  it('falha de gravação reverte estorno, cancelamento das contribuições e recibo', async () => {
    await repository.execute({ key: uid(), type: 'createRule', id: uid(), name: 'Reserva', enabled: true, basisPoints: 1000, sourceIds: [f.ids.source], mode: 'reserve' });
    const income = { key: uid(), type: 'income', accountId: f.ids.account, categoryId: f.ids.income, sourceId: f.ids.source, amount: 10000, date: today, description: 'Duplicada' };
    await repository.execute(income);
    const before = await repository.read(), command = { key: uid(), type: 'reverseMovement', operationId: income.key, reason: 'Duplicada' };
    const fail = () => { throw new Error('Falha de estorno simulada'); };
    database.rows('entries').hook('creating', fail);
    await expect(repository.execute(command)).rejects.toThrow(/Falha de estorno/);
    database.rows('entries').hook('creating').unsubscribe(fail);
    expect(await repository.read()).toEqual(before);
    expect((await repository.execute(command)).replayed).toBe(false);
    expect(summary(await repository.read())).toMatchObject({ cash: 100000, income: 0, reserved: 0 });
  });
});

describe('Restauração e importação atômicas', () => {
  it('recupera um banco inconsistente, preserva a cópia bruta e reverte falhas de escrita', async () => {
    const db = new FinanceDatabase(`dexfin-recovery-${uid()}`), repo = new IndexedDbFinanceRepository(db);
    try {
      const f = fixture();
      for (const receipt of f.state.receipts) await repo.execute(JSON.parse(receipt.payload));
      const original = await repo.read(), entry = original.entries[0];
      await db.rows('entries').update(entry.id, { amount: entry.amount + 1 });
      await expect(repo.read()).rejects.toThrow(/desequilibrada/);
      const snapshot = await repo.captureRecovery();
      expect(JSON.parse(snapshot).entries.find((item: { id: string }) => item.id === entry.id).amount).toBe(entry.amount + 1);
      const fail = () => { throw new Error('Falha de recuperação simulada'); };
      db.rows('entries').hook('creating', fail);
      await expect(repo.recover(original, snapshot)).rejects.toThrow(/Falha de recuperação/);
      db.rows('entries').hook('creating').unsubscribe(fail);
      expect(await repo.captureRecovery()).toBe(snapshot);
      await repo.recover(original, snapshot);
      expect(await repo.read()).toEqual(original);
    } finally { await db.delete(); }
  });
  it('recuperação recusa banco válido, backup inválido e alterações concorrentes', async () => {
    const db = new FinanceDatabase(`dexfin-recovery-conflict-${uid()}`), repo = new IndexedDbFinanceRepository(db);
    try {
      const f = fixture();
      for (const receipt of f.state.receipts) await repo.execute(JSON.parse(receipt.payload));
      const original = await repo.read(), snapshot = await repo.captureRecovery();
      await expect(repo.recover(original, snapshot)).rejects.toThrow(/estão válidos/);
      const entry = original.entries[0];
      await db.rows('entries').update(entry.id, { amount: entry.amount + 1 });
      const corrupt = await repo.captureRecovery();
      await expect(repo.recover({ ...original, entries: [] }, corrupt)).rejects.toThrow();
      await expect(repo.recover(original, snapshot)).rejects.toThrow(/mudaram/);
      expect(await repo.captureRecovery()).toBe(corrupt);
    } finally { await db.delete(); }
  });
  it('reverte um lote inteiro se qualquer linha falhar', async () => {
    const db = new FinanceDatabase(`dexfin-batch-${uid()}`), repo = new IndexedDbFinanceRepository(db);
    try {
      const f = fixture(); for (const receipt of f.state.receipts) await repo.execute(JSON.parse(receipt.payload));
      const before = await repo.read();
      await expect(repo.executeBatch([
        { key: uid(), type: 'expense', accountId: f.ids.account, categoryId: f.ids.expense, amount: 100, date: today, description: 'Válido' },
        { key: uid(), type: 'expense', accountId: uid(), categoryId: f.ids.expense, amount: 100, date: today, description: 'Inválido' },
      ])).rejects.toThrow();
      expect(await repo.read()).toEqual(before);
    } finally { await db.delete(); }
  });
  it('não substitui dados alterados desde a prévia e faz rollback se a gravação da restauração falhar', async () => {
    const db = new FinanceDatabase(`dexfin-restore-${uid()}`), repo = new IndexedDbFinanceRepository(db);
    try {
      const f = fixture(); for (const receipt of f.state.receipts) await repo.execute(JSON.parse(receipt.payload));
      const previous = await repo.read();
      await repo.execute({ key: uid(), type: 'createPerson', id: uid(), name: 'Novo cadastro' });
      await expect(repo.replace(f.state, JSON.stringify(previous))).rejects.toThrow(/mudaram/);
      const current = await repo.read(), replacement = fixture().state;
      const fail = () => { throw new Error('Falha de armazenamento simulada'); };
      db.rows('entries').hook('creating', fail);
      await expect(repo.replace(replacement, JSON.stringify(current))).rejects.toThrow(/Falha de armazenamento/);
      db.rows('entries').hook('creating').unsubscribe(fail);
      expect(await repo.read()).toEqual(current);
      await repo.replace(replacement, JSON.stringify(current));
      expect(summary(await repo.read())).toEqual(summary(replacement));
    } finally { await db.delete(); }
  });
});
