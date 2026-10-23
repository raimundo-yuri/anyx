# Modelo de dados — esquema 3 (com histórico das bases v1/v2)

Todos os registros possuem `id` UUID e `createdAt` UTC. Datas financeiras e vencimentos são strings civis ISO `YYYY-MM-DD`. Valores são inteiros seguros em centavos BRL; percentuais são inteiros em pontos-base (750 = 7,5%).

| Tabela | Finalidade e relações |
| --- | --- |
| accounts | Conta financeira BRL, nome e data de abertura; saldo inicial é operação, não campo de saldo mutável |
| categories | Categoria de receita ou despesa |
| people | Pessoa responsável por divisões de compras |
| sources | Fonte de receita, referência usada pelas regras de contribuição |
| cards | Cartão, limite em centavos, dia de fechamento e vencimento |
| invoices | Cartão, ciclo, fechamento e vencimento; índice único por cartão/ciclo |
| operations | Tipo, data civil e descrição; identificador igual à chave do comando financeiro |
| entries | Operação, natureza contábil, referência, débito/crédito, centavos e categoria opcional |
| purchases | Operação original, fatura e valor total |
| splits | Compra, valor e responsável; ausência de pessoa significa responsabilidade própria, que exige categoria |
| receivables | Divisão de terceiro, pessoa, principal e vencimento opcional; uma por divisão |
| rules | Regra de contribuição, percentual, fontes elegíveis, ativação e modo sugestão/reserva |
| contributions | Receita e regra originais, percentual aplicado, conta, valor, estado e pagamento opcional |
| reserves | Conta, contribuição e valor; permanece no histórico após liquidação/cancelamento |
| receipts | Chave de comando, conteúdo validado normalizado e identificador do resultado; trilha de execução/idempotência |

## Referências contábeis

`entries.ledger` determina o tipo de referência de `referenceId`:

- `cash`: conta financeira; saldo natural devedor.
- `receivable`: recebível; saldo natural devedor.
- `card`: fatura; saldo natural credor.
- `income`: fonte de receita; saldo natural credor, com categoria de receita.
- `expense`: categoria de despesa; saldo natural devedor.
- `equity`: conta financeira do saldo inicial; saldo natural credor.

Pagamentos de fatura e reembolsos são operações com lançamentos vinculados à fatura/recebível e à conta. Não há tabela redundante com um segundo saldo ou com uma segunda despesa. O extrato de uma fatura é obtido pelas operações que a referenciam nos lançamentos.

As faturas persistem suas datas para que uma eventual alteração futura dos dias do cartão não reescreva ciclos antigos. A compra mantém sua operação e divisões originais. O percentual de contribuição é copiado para a contribuição no momento do recebimento.

## Restrições

Soma de débitos igual à de créditos em cada operação; referências existentes; valores positivos nos lançamentos; IDs únicos por tabela; soma das divisões igual à compra; natureza da categoria compatível; recebível único por divisão de terceiro; regra/receita de contribuição únicas; reserva única por contribuição.

Pendentes são derivados dos lançamentos e não podem ser negativos. Também é verificado o saldo no encerramento de cada data civil, evitando sobrepagamentos retroativos que seriam ocultados por uma compra posterior. Operações de caixa não podem anteceder a abertura da conta.

O identificador do cartão não é conta de caixa, e seu limite nunca entra nos ativos. Categorias/fontes e edição/arquivamento foram implementados na etapa 4; previsões e parcelas foram adicionadas no esquema 2, descrito abaixo. Subcategorias permanecem pendentes.

## Relatórios e portabilidade futura

Exportações CSV preservam UUIDs e centavos numéricos, sem somar novamente compras e lançamentos. Consumo pessoal deriva dos lançamentos de despesa. Backup/restauração e importação CSV são implementados como fluxos distintos; veja PORTABILIDADE.md.


## Metadados opcionais da etapa 4

`accounts` aceita `institution`, `kind` (checking/savings/payment/cash), `archived` e `updatedAt`. `categories` e `sources` aceitam `archived` e `updatedAt`. Ausência de `archived` equivale a cadastro ativo, sem regravar os dados antigos.

Novos comandos: `updateAccount` altera somente nome/instituição/tipo; `renameCategory` e `renameSource` alteram somente o nome; `setArchived` muda o estado sem remover registros. A natureza da categoria, a data de abertura e o saldo inicial não podem ser alterados por esses comandos. Uma conta só pode ser arquivada quando zerada. Arquivados continuam nos extratos e referências antigas, mas são recusados em novas movimentações.

`installCatalog` instala sugestões por IDs estáveis, reutiliza nomes equivalentes da mesma natureza e preserva nomes editados ou arquivamento. O comando não cria contas, operações ou rendas confirmadas. Seu recibo é persistido como os demais.

## Esquema 2 — tabelas e naturezas adicionadas nas etapas 5–8

Este trecho atualiza as limitações históricas descritas para a versão 1: parcelas, previsões, orçamentos, metas, investimentos e empréstimos já existem. Subcategorias, estornos de outros módulos e conciliação permanecem pendentes. A correção de receitas/despesas/transferências está descrita no esquema 3 abaixo.

| Tabela | Modelo e relacionamentos |
| --- | --- |
| installments | Compra, fatura, índice e centavos; soma igual à compra; índice único por compra |
| receivableSchedules | Recebível, índice, vencimento e centavos; independente das parcelas do cartão |
| goals | Nome, conta do caixa, alvo e prazo |
| budgets | Categoria de despesa, mês e limite; único por categoria/mês |
| forecasts | Natureza, conta, categoria, fonte opcional, centavos e data; operação confirmada ou cancelamento opcionais |
| recurrings | Modelo mensal de previsão, dia 1–31 e ativação; não gera operação realizada automaticamente |
| investments | Identificação manual e data da última avaliação; valor derivado do ledger |
| loans | Pessoa, direção (lent/borrowed), principal, data/vencimento e operação de origem |

As reservas agora têm exatamente uma finalidade: contribuição ou meta. Reserva de meta aceita zero para liberar o caixa sem receita; o total reservado não pode superar alvo nem cobertura da conta. Não é segundo saldo de um ativo.

Novas naturezas de ledger: `investment` (ativo devedor), `valuation` (contrapartida patrimonial credora da avaliação), `loanAsset` (principal a receber, devedor) e `loanDebt` (principal a pagar, credor). Operação de pagamento de empréstimo tem `relatedId` para vincular o contrato, inclusive quando o pagamento contém somente juros.

Compra possui `buyerId` opcional. Sua `invoiceId` continua indicando a primeira fatura; a distribuição completa está em `installments`. O consumo pessoal e o recebível são reconhecidos uma vez na data da compra; a distribuição do passivo não duplica o consumo. Uma compra antiga recebe uma parcela única na migração.

Planos de reembolso não criam novos recebíveis: somente distribuem o principal original. Pagamentos são aplicados por FIFO às parcelas do plano na consulta. A soma dos pendentes das parcelas é igual ao único saldo do recebível.

Previsões confirmadas apontam para uma operação de mesma natureza; as pendentes não possuem lançamentos. Uma ocorrência recorrente é única por recorrência/mês, mesmo quando o comando de geração é repetido. Dias inválidos são limitados ao último dia do mês.

A migração v1→v2 adiciona tabelas sem resetar o banco, sem trocar IDs e sem reescrever recibos. As restrições antigas continuam aplicadas às operações e referências do histórico.

## Esquema 3 — estorno integral de correção

A migração v2→v3 acrescenta o índice não único `operations.relatedId`; não cria tabelas novas, não apaga dados e não troca IDs. Os esquemas anteriores continuam declarados e as migrações v1/v2→v3 são testadas.

- `operations.kind = reversal`: estorno de uma receita, despesa ou transferência original. `relatedId` aponta para ela; `description` é o motivo. A data financeira é idêntica à original, e `createdAt` preserva o instante em que a correção foi registrada.
- As entradas da correção têm os mesmos ledgers, referências, categorias e centavos do original, com os lados invertidos. O original permanece intacto. Cada operação elegível admite uma única correção desse tipo, validada dentro da transação.
- `contributions.cancelledById` é opcional e aponta para o estorno da receita que cancelou uma sugestão/reserva pendente. Status passa a `cancelled`, sem apagar os registros. Contribuições pagas e seus pagamentos permanecem preservados.
- A previsão realizada mantém `operationId`; sua situação de realização estornada é derivada do vínculo no histórico. Não é reaberta automaticamente.

Os comandos `reverseMovement` contêm chave, operação original e motivo. Não aceitam valor ou data arbitrários. Recibo idempotente, operação, entradas e cancelamentos são gravados atomicamente. O backup JSON passa ao envelope v3, preservando leitura dos v2; leitores antigos não compreendem o novo tipo financeiro.
