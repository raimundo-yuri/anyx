import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, uid } from '../test/finance-fixture';
import { summary } from '../domain/queries';
import { decodeOfx, ofxTransactionKey, parseOfx, previewOfx, type OfxClassification } from './ofx';
import { MAX_FILE_SIZE } from './backup';
import { FinanceDatabase, IndexedDbFinanceRepository } from '../infrastructure/database';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

function transaction({ id = 'FIT-001', amount = '-12.50', type = 'DEBIT', date = '20260105120000[-3:BRT]', memo = 'Mercado', extra = '' } = {}) {
  return `<STMTTRN><TRNTYPE>${type}</TRNTYPE><DTPOSTED>${date}</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${id}</FITID><MEMO>${memo}</MEMO>${extra}</STMTTRN>`;
}
function xml(rows = transaction(), currency = 'BRL') {
  return `<?xml version="1.0" encoding="UTF-8"?><OFX><BANKMSGSRSV1><STMTTRNRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>${currency}</CURDEF><BANKACCTFROM><BANKID>001</BANKID><BRANCHID>1234</BRANCHID><ACCTID>000123456</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM><BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>${rows}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}
function sgml(rows = '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-12.50<FITID>FIT-001<MEMO>Mercado & Filhos</STMTTRN>') {
  return `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>001<BRANCHID>1234<ACCTID>000123456<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST><DTSTART>20260101<DTEND>20260131${rows}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}
function twoRows() { return parseOfx(xml(transaction() + transaction({ id: 'FIT-002', amount: '200.00', type: 'CREDIT', memo: 'Bolsa recebida' }))); }
function classified(f: ReturnType<typeof fixture>): OfxClassification[] { return [{ action: 'expense', categoryId: f.ids.expense }, { action: 'income', categoryId: f.ids.income, sourceId: f.ids.source }]; }

describe('Adaptador OFX bancário explícito', () => {
  it('lê XML, mantém centavos exatos e usa a data civil informada sem converter fuso', () => {
    const statement = parseOfx(xml(transaction({ amount: '-0.01', date: '20260105235959.123[-3:BRT]', memo: 'A &amp; B &#xE1;' })));
    expect(statement).toMatchObject({ bankId: '001', branchId: '1234', accountNumber: '000123456', accountType: 'CHECKING', currency: 'BRL' });
    expect(statement.transactions).toEqual([{ fitId: 'FIT-001', date: '2026-01-05', amount: -1, description: 'A & B á', bankType: 'DEBIT', requiresReview: false }]);
    expect(parseOfx(xml(transaction({ amount: '90071992547409.91' }))).transactions[0].amount).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('lê SGML com fechamento implícito apenas nas folhas e decodifica Windows-1252', () => {
    const source = sgml().replace('Mercado & Filhos', 'Pão & Filhos');
    const bytes = Uint8Array.from(source, character => character.charCodeAt(0));
    const statement = parseOfx(decodeOfx(bytes.buffer));
    expect(statement.transactions[0]).toMatchObject({ amount: -1250, description: 'Pão & Filhos' });
    expect(() => parseOfx(source.replace('</BANKTRANLIST>', ''))).toThrow(/Estrutura|incompleto/);
  });
  it('aceita UTF-8 e rejeita declaração incompatível, bytes inválidos e arquivos grandes', () => {
    const encoded = new TextEncoder().encode(xml(transaction({ memo: 'Educação' })));
    expect(parseOfx(decodeOfx(encoded.buffer)).transactions[0].description).toBe('Educação');
    expect(() => decodeOfx(new TextEncoder().encode('OFXHEADER:100\nENCODING:USASCII\nCHARSET:NONE\n<OFX>á</OFX>').buffer)).toThrow(/ASCII/);
    expect(() => decodeOfx(new TextEncoder().encode('<?xml encoding="KOI8-R"?><OFX/>').buffer)).toThrow(/Codificação/);
    expect(() => decodeOfx(new Uint8Array([0xff, 0xfe, 0]).buffer)).toThrow(/UTF-16/);
    expect(() => decodeOfx(new Uint8Array([0xff]).buffer)).toThrow(/codificação/);
    expect(() => decodeOfx(new ArrayBuffer(MAX_FILE_SIZE + 1))).toThrow(/20 MiB/);
  });
  it('trata texto escapado como texto e rejeita DTD, entidades personalizadas e CDATA sem rede', () => {
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    expect(parseOfx(xml(transaction({ memo: '&lt;img src=x onerror=alert(1)&gt;' }))).transactions[0].description).toBe('<img src=x onerror=alert(1)>');
    for (const input of ['<!DOCTYPE OFX [<!ENTITY xxe SYSTEM "https://example.invalid">]>' + xml(), xml(transaction({ memo: '&bancoCustomizado;' })), xml(transaction({ memo: '<![CDATA[teste]]>' }))]) expect(() => parseOfx(input)).toThrow(/DTD|entidade|Entidade|CDATA/);
    expect(network).not.toHaveBeenCalled();
  });
  it('rejeita moeda, cartões, investimentos, tipo de conta e correções sem suporte', () => {
    expect(() => parseOfx(xml(undefined, 'USD'))).toThrow(/BRL/);
    expect(() => parseOfx(xml().replace('CHECKING', 'CREDITLINE'))).toThrow(/Tipo de conta/);
    expect(() => parseOfx(xml().replaceAll('STMTRS', 'CCSTMTRS'))).toThrow(/cartão|bancária/);
    expect(() => parseOfx(xml().replaceAll('STMTRS', 'INVSTMTRS'))).toThrow(/investimentos/);
    for (const extra of ['<CORRECTFITID>OLD</CORRECTFITID>', '<CORRECTACTION>REPLACE</CORRECTACTION>', '<CURRENCY><CURSYM>USD</CURSYM></CURRENCY>']) expect(() => parseOfx(xml(transaction({ extra })))).toThrow(/correções|moedas/);
    expect(() => parseOfx(xml().replace('<CODE>0</CODE>', '<CODE>2000</CODE>'))).toThrow(/erro ou aviso/);
  });
  it('rejeita campos monetários e datas inválidos antes de qualquer prévia', () => {
    for (const amount of ['0', '1e3', '12,50', '12.345', 'NaN', '90071992547409.92']) expect(() => parseOfx(xml(transaction({ amount })))).toThrow(/Valor|centavos/);
    for (const date of ['20260230', '20260105250000', '20260105126000', '20260105120099', '2026-01-05', '20260105trailing']) expect(() => parseOfx(xml(transaction({ date })))).toThrow(/Data/);
  });
  it('exige FITID único por folha, uma conta e um documento completos', () => {
    expect(() => parseOfx(xml().replace('<FITID>FIT-001</FITID>', ''))).toThrow(/FITID/);
    expect(() => parseOfx(xml().replace('<FITID>FIT-001</FITID>', '<FITID>A</FITID><FITID>B</FITID>'))).toThrow(/FITID/);
    expect(() => parseOfx(xml().replace('</OFX>', '') )).toThrow(/incompleto/);
    expect(() => parseOfx(xml() + '<OFX></OFX>')).toThrow(/único/);
    const statement = xml().match(/<STMTRS>[\s\S]*<\/STMTRS>/)![0];
    expect(() => parseOfx(xml().replace('</OFX>', statement + '</OFX>'))).toThrow(/única conta/);
    expect(() => parseOfx('não é OFX')).toThrow(/OFX/);
    expect(() => parseOfx(sgml().replace('COMPRESSION:NONE', 'COMPRESSION:ZIP'))).toThrow(/comprimido/);
  });
  it('limita linhas e marca transferências e descrições ambíguas para revisão individual', () => {
    const rows = transaction({ type: 'XFER', memo: 'Transferência entre contas' }) + transaction({ id: 'B', memo: 'PIX recebido', amount: '100.00', type: 'CREDIT' }) + transaction({ id: 'C', memo: 'Pagamento de fatura' });
    expect(parseOfx(xml(rows)).transactions.every(row => row.requiresReview)).toBe(true);
    expect(() => parseOfx(xml(transaction().repeat(5001)))).toThrow(/5.000/);
    for (const extra of ['<BANKACCTTO><BANKID>001</BANKID><ACCTID>OUTRA</ACCTID></BANKACCTTO>', '<CCACCTTO><ACCTID>CARTAO</ACCTID></CCACCTTO>']) expect(parseOfx(xml(transaction({ memo: 'Pagamento', extra }))).transactions[0].requiresReview).toBe(true);
  });
  it('recusa prefixo excessivo e prólogos malformados antes de examinar o cabeçalho', () => {
    expect(() => parseOfx('<?xml '.repeat(10000) + '<OFX></OFX>')).toThrow(/4 KiB/);
    expect(() => parseOfx('<?xml <?xml version="1.0"?>' + xml().replace(/^<\?xml[^>]*\?>/, ''))).toThrow(/Prólogo/);
    expect(() => parseOfx('<?xml version="1.0"?>' + xml())).toThrow(/Prólogo/);
  });
});

describe('Prévia, classificação e deduplicação OFX', () => {
  it('simula o lote sem alterar o estado e reconhece o mesmo FITID após gravar', async () => {
    const f = fixture(), statement = twoRows(), before = structuredClone(f.state), choices = classified(f);
    const first = await previewOfx(statement, f.state, f.ids.account, choices);
    expect(first).toMatchObject({ rows: 2, duplicates: 0, ignored: 0 }); expect(first.commands).toHaveLength(2);
    expect(f.state).toEqual(before);
    for (const command of first.commands) f.run(command);
    expect(summary(f.state)).toMatchObject({ cash: 118750, income: 20000, expenses: 1250 });
    expect(await previewOfx(statement, f.state, f.ids.account, choices)).toMatchObject({ commands: [], duplicates: 2 });
  });
  it('a chave não muda com a classificação; dados ou categorias diferentes dão conflito', async () => {
    const f = fixture(), statement = twoRows(), choices = classified(f);
    const first = await previewOfx(statement, f.state, f.ids.account, choices); for (const command of first.commands) f.run(command);
    await expect(previewOfx(statement, f.state, f.ids.account, [{ action: 'expense', categoryId: uid() }, choices[1]])).rejects.toThrow(/FITID já foi usado/);
    const changed = parseOfx(xml(transaction({ amount: '-13.00' })));
    await expect(previewOfx(changed, f.state, f.ids.account, [choices[0]])).rejects.toThrow(/FITID já foi usado/);
    expect(await ofxTransactionKey(f.ids.account, 'FIT-001')).not.toBe(await ofxTransactionKey(f.ids.other, 'FIT-001'));
  });
  it('repetição no próprio arquivo é reconhecida e conflito não altera nenhuma linha', async () => {
    const f = fixture(), choice: OfxClassification = { action: 'expense', categoryId: f.ids.expense };
    const preview = await previewOfx(parseOfx(xml(transaction() + transaction())), f.state, f.ids.account, [choice, choice]);
    expect(preview).toMatchObject({ duplicates: 1 }); expect(preview.commands).toHaveLength(1);
    const before = structuredClone(f.state);
    await expect(previewOfx(parseOfx(xml(transaction() + transaction({ amount: '-13.00' }))), f.state, f.ids.account, [choice, choice])).rejects.toThrow(/FITID/);
    expect(f.state).toEqual(before);
  });
  it('exige classificar ou ignorar e nunca transforma uma transferência pendente em renda', async () => {
    const f = fixture(), statement = parseOfx(xml(transaction({ type: 'XFER', amount: '100.00', memo: 'Transferência' })));
    await expect(previewOfx(statement, f.state, f.ids.account, [{ action: 'pending' }])).rejects.toThrow(/classifique/);
    expect(await previewOfx(statement, f.state, f.ids.account, [{ action: 'ignore' }])).toMatchObject({ commands: [], ignored: 1 });
    expect(summary(f.state).income).toBe(0);
    await expect(previewOfx(statement, f.state, f.ids.account, [{ action: 'expense', categoryId: f.ids.expense }])).rejects.toThrow(/incompatível/);
    await expect(previewOfx(statement, f.state, f.ids.account, [])).rejects.toThrow(/incompleta/);
  });
  it('valida data realizada, abertura e cadastros na prévia', async () => {
    const f = fixture(), choice: OfxClassification = { action: 'expense', categoryId: f.ids.expense };
    await expect(previewOfx(parseOfx(xml(transaction({ date: '29990105' }))), f.state, f.ids.account, [choice])).rejects.toThrow(/até hoje/);
    await expect(previewOfx(parseOfx(xml(transaction({ date: '20251231' }))), f.state, f.ids.account, [choice])).rejects.toThrow(/abertura/);
    f.run({ type: 'setArchived', entity: 'account', id: f.ids.other, archived: true });
    await expect(previewOfx(parseOfx(xml()), f.state, f.ids.other, [choice])).rejects.toThrow(/conta ativa/);
  });
  it('receita só aciona contribuição na gravação e o lote reverte se outra linha ficar inválida', async () => {
    const f = fixture(); f.run({ type: 'createRule', id: uid(), name: 'Contribuição', mode: 'reserve', enabled: true, basisPoints: 1000, sourceIds: [f.ids.source] });
    const statement = parseOfx(xml(transaction({ id: 'CREDIT-FIRST', amount: '200.00', type: 'CREDIT', memo: 'Bolsa' }) + transaction()));
    const preview = await previewOfx(statement, f.state, f.ids.account, [classified(f)[1], classified(f)[0]]);
    expect(f.state.contributions).toHaveLength(0);
    const db = new FinanceDatabase(`dexfin-ofx-${uid()}`), repo = new IndexedDbFinanceRepository(db);
    try {
      for (const receipt of f.state.receipts) await repo.execute(JSON.parse(receipt.payload));
      await repo.execute({ key: uid(), type: 'setArchived', entity: 'category', id: f.ids.expense, archived: true });
      const before = await repo.read();
      await expect(repo.executeBatch(preview.commands)).rejects.toThrow(/arquivada/);
      expect(await repo.read()).toEqual(before);
      await repo.execute({ key: uid(), type: 'setArchived', entity: 'category', id: f.ids.expense, archived: false });
      await repo.executeBatch(preview.commands);
      expect(summary(await repo.read())).toMatchObject({ income: 20000, expenses: 1250, reserved: 2000 });
    } finally { await db.delete(); }
  });
});
