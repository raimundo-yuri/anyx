# Backup, importação, relatórios e Power BI

## Portabilidade entre os modos local e nuvem

O mesmo backup v6 é aceito nos dois modos; não há migração automática por domínio nem mesclagem de bases. Restauração na nuvem substitui os registros compartilhados após comparar o estado com a prévia. A nuvem aceita inicialmente 2 MiB de estado JSON e 100 comandos por lote; um arquivo local dentro do limite de leitura ainda pode exceder esses limites. A operação é recusada por inteiro, sem importação parcial. Continue guardando backups protegidos fora do dispositivo; a nuvem não é backup automático. Consulte [Vercel e Supabase](VERCEL-E-SUPABASE.md).

## Agenda iCalendar (.ics) — versão 0.12

Exportação local em **Agenda e pendências**, a partir dos filtros ativos. Inclui todas as páginas da seleção, até 5.000 itens com data, sem inventar vencimento para itens sem prazo. O arquivo informa quantos itens foram exportados e quantos não tinham data. Não é backup restaurável nem formato de importação financeira.

Eventos são de dia inteiro, com DTSTART/DTEND em datas civis e DTSTAMP UTC. UID é estável por item de origem; isso permite reconhecer a mesma identidade, mas não garante como cada calendário trata nova importação. Não há sincronização, cancelamento remoto ou remoção automática do evento antigo. O arquivo usa METHOD:PUBLISH, STATUS:TENTATIVE e não possui convidados/organizadores. Nenhum pagamento é confirmado ao importar.

Opcionalmente inclui VALARM de um dia antes, somente para datas futuras, quando o operador marca essa opção. A execução do lembrete depende do calendário importador e de suas permissões/configurações. O DexFin não agenda push, e-mail ou processos de fundo.

O exportador escapa texto, delimitadores e quebras de linha e dobra linhas em até 75 octetos UTF-8 sem dividir caracteres. A seleção inteira é validada antes de solicitar o download; erro não produz arquivo parcial. Fim do ano 9999 é recusado porque não permite representar o dia seguinte no mesmo formato. A exportação .ics não muda os registros. Na versão 0.13, a base local e o envelope de backup estão na versão 6. O .ics contém nomes/descrições e valores legíveis: proteja o arquivo e escolha conscientemente o calendário de destino.

## Backup

Em **Relatórios e backup**, escolha exportar com senha (padrão) ou desative explicitamente a criptografia. O arquivo inclui todas as tabelas, lançamentos, relações e recibos de idempotência.

Formato JSON atual `dexfin`, versão 6, com `exportedAt` UTC e `state`. Todas as tabelas atuais são obrigatórias. O leitor também aceita os envelopes v2/v3/v4/v5 e adapta estados legados quando necessário sem trocar IDs; parcelas únicas antigas são derivadas da compra original. Versões desconhecidas são rejeitadas. Estornos de correção exigem v3 ou posterior; subcategorias exigem v4; devoluções comerciais exigem v5; correções de pagamentos, reembolsos e devoluções exigem v6. Leitores antigos não entendem os novos formatos. O envelope criptografado continua na versão 1 e protege o JSON interno atual.

Formato protegido `dexfin-encrypted`, versão 1: PBKDF2-SHA-256 com 310.000 iterações, salt aleatório de 16 bytes, chave AES-GCM de 256 bits e IV aleatório de 12 bytes. A chave não é extraível; salt/IV e ciphertext ficam no envelope. A senha não é gravada. Perda da senha significa perda do acesso a esse backup. Integridade autenticada detecta senha incorreta ou ciphertext alterado; um backup JSON sem proteção não é prova de autenticidade contra alteração intencional.

Arquivos devem ter no máximo 20 MiB, inclusive o envelope criptografado. O exportador também verifica esse limite, para não gerar um backup que o leitor recusaria. CSV é alternativa de portabilidade tabular, não substituto completo do backup.

## Restaurar com segurança

1. Exporte o estado atual para manter uma opção de recuperação.
2. Selecione o backup e, se necessário, informe a senha.
3. Use **Validar e visualizar backup** e confira contas, operações, compras, recebíveis e caixa.
4. Confirme explicitamente a substituição total dos dados locais.
5. Use **Confirmar restauração** e confira os saldos.

A validação inclui formas, referências, partidas balanceadas, parcelas, reservas e pendentes. A escrita ocorre em uma única transação, inclusive limpeza/substituição e recibos. Falha de escrita reverte o estado anterior. Uma alteração entre a prévia e a confirmação exige rever a prévia; o aplicativo não sobrescreve silenciosamente a atividade de outra aba.

Teste a recuperação em um perfil separado antes de depender do backup. Os testes automatizados cobrem exportar/restaurar, senha errada, corrupção, falha após limpeza e conflito com mudança concorrente. Não apague dados do navegador como tentativa de reparo de um banco com erro. Se a leitura normal falhar por inconsistência, o fluxo **Abrir recuperação de dados** na tela de erro oferece a recuperação descrita abaixo.

## Recuperação de um banco inconsistente

1. Na tela de erro, use **Abrir recuperação de dados**. Isso não exclui nada.
2. Selecione um backup válido, informe sua senha quando necessária e use **Validar backup para recuperação**.
3. Confira a prévia e use **Baixar cópia de diagnóstico**. Guarde o arquivo antes de continuar: ele é legível, contém os registros atuais sem tentar corrigi-los e pode estar inconsistente. Seu formato `dexfin-recovery` não é aceito como backup restaurável.
4. Confirme que guardou a cópia e entende a substituição. Use **Confirmar recuperação**.
5. A transação compara os registros brutos com a prévia, recusa alterações concorrentes e aceita somente uma substituição validada. Qualquer falha de escrita reverte a troca inteira. Ao concluir, a aplicação recarrega e os indicadores voltam a consultar o banco.

A recuperação especial só substitui um estado inconsistente; se os dados atuais forem válidos, o usuário é orientado a recarregar e usar a restauração normal. Não há reparo automático nem exclusão silenciosa. O fluxo depende de conseguir abrir, ler, serializar e gravar o IndexedDB; não recupera falha física, dados já removidos ou senha perdida. Sem backup válido, preserve os dados e procure diagnóstico técnico antes de alterar o perfil. Não envie a cópia bruta para serviços públicos.

## CSV e Power BI

As tabelas são exportadas individualmente, com UTF-8/BOM e ponto e vírgula. Cabeçalhos seguem o modelo versionado; UUIDs permanecem estáveis. Datas civis usam ISO `YYYY-MM-DD`, instantes são UTC. `amount`, `principal`, `target`, `limit`, `value` e demais campos monetários são **centavos inteiros**, sem símbolo nem separador brasileiro. Divida por 100 somente para apresentação no Power BI. `basisPoints` é percentual multiplicado por 100 (750 = 7,5%).

Relacionamentos principais:

| Origem | Destino | Relação |
| --- | --- | --- |
| categories.parentId | categories.id | Grupo pai opcional, sem ciclos e da mesma natureza |
| entries.operationId | operations.id | Vários lançamentos por operação |
| operations.relatedId, quando kind = reversal | operations.id | Estorno integral ligado ao original |
| contributions.cancelledById | operations.id | Estorno que cancelou a contribuição pendente, quando preenchido |
| purchases.operationId | operations.id | Operação original da compra |
| purchaseRefunds.operationId | operations.id | Operação de devolução comercial |
| purchaseRefunds.purchaseId | purchases.id | Compra original preservada |
| purchaseRefunds.invoiceId | invoices.id | Fatura que recebeu o crédito |
| refundAllocations.refundId | purchaseRefunds.id | Alocação explícita da devolução |
| refundAllocations.splitId | splits.id | Divisão original beneficiada |
| splits.purchaseId | purchases.id | Responsabilidades de uma compra |
| installments.purchaseId | purchases.id | Parcelas do cartão da compra |
| installments.invoiceId | invoices.id | Fatura que recebe a parcela |
| invoices.cardId | cards.id | Cartão da fatura |
| receivables.splitId | splits.id | Direito decorrente da divisão |
| receivables.personId | people.id | Pessoa devedora |
| receivableSchedules.receivableId | receivables.id | Plano independente de reembolso |
| reserves.accountId | accounts.id | Caixa já existente reservado |
| reserves.goalId | goals.id | Reserva de meta, quando preenchido |
| contributions.incomeId | operations.id | Origem realizada da contribuição |
| forecasts.operationId | operations.id | Realização confirmada da previsão |

`entries.referenceId` é uma referência tipada por `entries.ledger`; não estabeleça uma relação única indiscriminada entre esse campo e todas as tabelas. Crie dimensões/consultas filtradas por natureza: cash→accounts, card→invoices, cardCredit→cards, receivable/personPayable→receivables, expense→categories, income→sources, investment/valuation→investments, loanAsset/loanDebt→loans.

Estornos de correção preservam o original e criam entradas exatamente inversas na mesma data financeira. Para acompanhar correções, filtre `operations.kind = reversal` e relacione `relatedId` ao original.

Devolução comercial usa `operations.kind = purchaseRefund`, com `relatedId` para a compra, registros em `purchaseRefunds` e rateio em `refundAllocations`. Reduz consumo somente na data efetiva do crédito, que pode produzir total mensal negativo. `cardCreditUse.relatedId` identifica a fatura compensada e `personRefund.relatedId` o recebível cuja obrigação está sendo liquidada. Use crédito menos débito para o passivo `personPayable` e débito menos crédito para o ativo `cardCredit`; nenhum é caixa ou renda. Não trate todo débito em `card` como pagamento bancário nem todo crédito em `receivable` como dinheiro recebido: a natureza da operação distingue compensação e cancelamento.

Receita é o saldo credor dos lançamentos `income`. Consumo é o saldo devedor de `expense`. Inclua os créditos de despesa e débitos de receita para que os estornos sejam descontados. Não some compras, divisões, parcelas e pagamentos para calcular despesa: isso duplicaria fatos. A compra compartilhada de R$ 300 com R$ 120 pessoais produz R$ 120 de despesa, R$ 180 a receber e R$ 300 no passivo; parcelas apenas distribuem o passivo entre faturas. Transferência, pagamento de fatura, reembolso, empréstimo principal e aporte/resgate não são consumo ou renda.

Arrays, quando presentes (como `sourceIds`), são JSON textual e podem ser expandidos no Power Query para uma tabela de ponte. Campos de texto que poderiam executar fórmulas em planilhas recebem apóstrofo; campos numéricos, inclusive negativos, continuam numéricos. A exportação inclui dados pessoais de nomes/descrições: proteja os arquivos.

## Importação CSV DexFin v1

O importador é um adaptador explícito para receitas/despesas realizadas, não um importador bancário universal. O adaptador OFX bancário está descrito a seguir; não há conexão bancária automática. Use **Baixar modelo de importação** ou mapeie suas colunas para:

```text
externalId;date;type;description;amount;accountId;categoryId;sourceId
```

- `externalId`: identificador estável do lançamento no extrato (até 120 caracteres).
- `date`: data ISO válida, até hoje no fuso configurado.
- `type`: `income` ou `expense`.
- `description`: descrição não vazia, até 120 caracteres.
- `amount`: centavos inteiros positivos; não usar valor decimal em reais.
- `accountId`: UUID de conta ativa já cadastrada.
- `categoryId`: UUID de categoria ativa da natureza correta.
- `sourceId`: UUID de fonte ativa, obrigatório para receita e dispensável para despesa.

A conta e o ID externo determinam uma chave UUID estável derivada de SHA-256. Repetir o mesmo conteúdo não duplica. Reutilizar a mesma conta/ID externo com outro conteúdo causa conflito, não sobrescrita. Dois IDs externos diferentes representam fatos distintos: deduplicação não pode adivinhar equivalência por descrição.

Até 5.000 registros e 20 MiB; CSV com aspas, ponto e vírgula e quebras de linha é analisado com validação estrita. Todas as linhas são simuladas/validadas antes da prévia. Revise a prévia, confirme e importe; todo o lote é atômico, inclusive em falha posterior à primeira linha.

## PDF

Escolha o mês em **Relatório financeiro** e use **Imprimir / salvar PDF**. A impressão contém fluxos do período, estoques atuais explicitamente identificados e o histórico selecionado. O PDF é produzido pela opção Salvar como PDF do navegador, não por um serviço externo. O estilo de impressão remove menus e controles.

## OFX bancário BRL

Aceita uma única conta `CHECKING`, `SAVINGS` ou `CASHMGMT`, com moeda BRL, em SGML OFX 1.x ou XML OFX 2.x no subconjunto validado. Codificações aceitas: UTF-8 e Windows-1252 (incluindo declarações compatíveis). Limites: 20 MiB, cabeçalho de até 4 KiB e 1–5.000 lançamentos. Datas são civis a partir de DTPOSTED, valores são convertidos de texto decimal do banco para centavos com aritmética inteira e FITID é obrigatório.

Cartões/investimentos, múltiplas contas, câmbio/moeda por lançamento, correções `CORRECTFITID`, documentos comprimidos/protegidos, DTD e entidades personalizadas são rejeitados. O parser não acessa rede nem resolve conteúdo externo. Ele não afirma aceitar todos os arquivos produzidos por todos os bancos.

Conta destino e classificação precisam de revisão explícita. Lançamentos especiais (incluindo destinos BANKACCTTO/CCACCTTO) permanecem pendentes; só receitas/despesas realmente selecionadas entram no lote. Ignorar um lançamento não grava um fato financeiro. A chave deriva de conta DexFin+FITID e não depende da categoria escolhida; arquivo repetido não duplica, e conteúdo/classificação diferente para a mesma chave gera conflito. Não há deduplicação entre OFX, CSV e registros manuais.

A prévia simula todas as linhas selecionadas antes da confirmação. A gravação usa uma transação externa e conserva recibos de idempotência; falha posterior não deixa importação parcial. Transferências, faturas, reembolsos e estornos devem ser registrados nos seus fluxos próprios para preservar a natureza financeira.
