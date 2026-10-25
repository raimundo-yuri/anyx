# Plano revisável — estornos comerciais de compras no cartão

**Status: IMPLEMENTADO NA VERSÃO 0.11.0, no fluxo de crédito descrito; correções integrais desses eventos acrescentadas na 0.13.0.** Este documento conserva a proposta e a matriz usadas na revisão. Na 0.13, o estorno de correção também abrange devolução comercial, pagamento de fatura, reembolso, aplicação de crédito e devolução a pessoa, com validação de dependências e preservação do original. Os itens de correção pendentes no plano histórico abaixo foram atendidos nesse escopo; compra original e outros módulos permanecem fora. A implementação está em `src/domain/card-refunds.ts` e `src/features/finance/CreditAdjustmentForm.tsx`; o guia USO.md descreve a interface. Não autoriza ajustes manuais no banco.

A política adotada agrupa eventos no mesmo dia e recusa cadastrar um estorno anterior a movimentos já registrados do mesmo cartão ou das divisões selecionadas. O histórico de recebíveis/passivos é validado em cada corte diário. Devoluções são alocadas explicitamente por divisão; no cronograma, o cancelamento reduz as últimas parcelas, e pagamentos são aplicados por FIFO ao saldo ajustado. As parcelas originais do cartão não são canceladas automaticamente. Os limites abaixo continuam aplicáveis.

O estorno de correção já existente para receitas, despesas e transferências é outro fluxo: ele anula um registro incorreto na data original. Este plano trata de uma compra válida que depois recebeu uma devolução comercial efetivamente creditada pelo emissor do cartão, inclusive parcial, compartilhada ou com parcelas futuras.

## Objetivos e limites propostos

- Preservar a compra, suas divisões, parcelas, pagamentos, reembolsos e respectivos identificadores.
- Registrar a data efetiva e o destino do crédito informado pelo emissor, com motivo, prévia e confirmação.
- Permitir alocação explícita do valor devolvido entre divisões próprias e de terceiros, sem presumir rateio proporcional.
- Reduzir o direito contra o terceiro ainda pendente e reconhecer uma obrigação de devolver o que ele já pagou em excesso.
- Representar crédito no cartão quando a fatura já foi paga ou o estorno exceder seu saldo pendente, sem transformar esse crédito em caixa.
- Permitir registrar posteriormente a utilização do crédito em fatura do mesmo cartão e a devolução efetivamente realizada à pessoa.

A proposta inicial considera o crédito comercial lançado no cartão. Cancelamento de parcelas sem lançamento de crédito, crédito direto em conta bancária, contestação ainda em análise, juros, tarifas, reversão de um estorno comercial incorreto e renegociação exigem decisões específicas. Não devem ser simulados por receitas/despesas genéricas nem considerados suportados apenas por este plano.

## Representação financeira proposta

Os nomes abaixo são conceituais e podem ser revistos. O modelo atual não contém esses novos ledgers ou registros.

| Elemento | Finalidade |
| --- | --- |
| Registro do estorno comercial | Vincula operação, compra original, cartão, fatura creditada, data efetiva, motivo e valor total |
| Alocação por divisão | Identifica a divisão original e o valor devolvido a ela; permite validar limites acumulados |
| `cardCredit` | Ativo por cartão: crédito disponível com o emissor, excluído de caixa/disponível e incluído no patrimônio |
| `personPayable` | Passivo por recebível/divisão original: valor a devolver à pessoa, preservando a relação com a compra |
| Utilização de crédito | Operação explícita que compensa obrigação de uma fatura do mesmo cartão |
| Devolução à pessoa | Operação explícita da saída efetivamente realizada em conta para liquidar o passivo |

O ledger de cartão atual pode continuar com saldo não negativo por fatura. Um crédito excedente é representado pelo ativo separado; não basta remover a restrição existente e deixar a fatura negativa. Da mesma forma, um recebível negativo não deve esconder uma obrigação de devolver dinheiro.

Uma referência por recebível no novo passivo permite derivar a pessoa e consultar várias compras sem misturar suas origens. Novas tabelas de estornos/alocações precisam ser a fonte validada desse vínculo; o conteúdo textual de um recibo de idempotência não deve substituir o modelo financeiro.

## Partidas propostas

Para a parcela própria devolvida, creditar a categoria de despesa da divisão original. Isso reduz o consumo líquido na data efetiva do estorno, sem criar receita.

Para uma alocação de terceiro de valor `q`, considerar o recebível pendente no momento financeiro pertinente:

1. Creditar o recebível em `min(q, pendente)`.
2. Creditar `personPayable` no restante, que representa o valor recebido da pessoa e agora devido a ela.

No lado devedor, a soma do estorno reduz o passivo da fatura creditada até zero. O restante debita `cardCredit` do cartão correspondente. A soma dos débitos precisa coincidir exatamente com a das alocações creditadas.

| Operação | Débito | Crédito |
| --- | --- | --- |
| Estorno comercial creditado | Obrigação da fatura até seu pendente; excedente em `cardCredit` | Despesa própria, recebíveis cancelados e/ou `personPayable`, conforme divisões |
| Aplicar crédito em fatura | Obrigação da fatura escolhida | `cardCredit` do mesmo cartão |
| Devolver dinheiro à pessoa | `personPayable` correspondente | Conta de caixa utilizada na devolução |

Utilizar crédito e devolver dinheiro não criam consumo ou renda. Uma eventual transferência do crédito do cartão para uma conta bancária exigiria um fluxo específico, confirmado somente quando efetivamente recebida; não é automática.

## Cenário numérico — estorno total

Valores em reais apenas para leitura. A implementação deverá usar centavos inteiros seguros em todas as etapas.

Considere caixa inicial de R$ 1.000,00 e uma compra de R$ 300,00: R$ 120,00 próprios, R$ 100,00 da pessoa A e R$ 80,00 da pessoa B. A já reembolsou R$ 60,00. O pagamento realizado da fatura é `P`, entre zero e R$ 300,00, sem outros fatos nesse exemplo.

Antes do estorno:

| Indicador | Valor |
| --- | --- |
| Caixa | R$ 1.060,00 − P |
| A receber de A | R$ 40,00 |
| A receber de B | R$ 80,00 |
| Fatura pendente | R$ 300,00 − P |
| Consumo pessoal | R$ 120,00 |
| Patrimônio líquido | R$ 880,00 |

O estorno total lança:

- Débito no cartão: `R$ 300,00 − P`.
- Débito em `cardCredit`: `P`.
- Crédito na despesa própria: R$ 120,00.
- Crédito no recebível de A: R$ 40,00.
- Crédito no recebível de B: R$ 80,00.
- Crédito em `personPayable` de A: R$ 60,00.

Depois do estorno, os recebíveis e a fatura estão zerados, o consumo líquido da compra é zero e o patrimônio volta a R$ 1.000,00: `caixa (1.060 − P) + crédito P − obrigação 60`. Os R$ 60,00 continuam sendo uma obrigação com A; o caixa isolado não comprova que esse dinheiro possa ser gasto.

Depois de devolver R$ 60,00 a A:

| Pagamento anterior da fatura | Caixa | Crédito no cartão | A devolver | Patrimônio |
| --- | --- | --- | --- | --- |
| R$ 0,00 | R$ 1.000,00 | R$ 0,00 | R$ 0,00 | R$ 1.000,00 |
| R$ 150,00 | R$ 850,00 | R$ 150,00 | R$ 0,00 | R$ 1.000,00 |
| R$ 300,00 | R$ 700,00 | R$ 300,00 | R$ 0,00 | R$ 1.000,00 |

Na última linha, não se pode anunciar caixa de R$ 1.000,00: R$ 300,00 continuam com o emissor como crédito no cartão.

## Cenário numérico — estorno parcial

No mesmo exemplo, considere estorno de R$ 90,00 alocado em R$ 20,00 próprios, R$ 50,00 para A e R$ 20,00 para B.

- O consumo pessoal passa de R$ 120,00 para R$ 100,00.
- A passa a ser responsável por R$ 50,00. Como já pagou R$ 60,00, seu recebível de R$ 40,00 é cancelado e nasce uma obrigação de devolver R$ 10,00.
- B passa a dever R$ 60,00, depois de cancelados R$ 20,00 do seu recebível.
- O patrimônio passa de R$ 880,00 para R$ 900,00. Apenas os R$ 20,00 próprios devolvidos aumentam o patrimônio; as partes dos terceiros ajustam direitos e obrigações.

Se a fatura estava parcialmente paga em R$ 150,00, o resultado é caixa R$ 910,00, recebível B R$ 60,00, fatura R$ 60,00 e obrigação A R$ 10,00: patrimônio R$ 900,00. Se já estava totalmente paga, o resultado é caixa R$ 760,00, crédito no cartão R$ 90,00, recebível B R$ 60,00 e obrigação A R$ 10,00: o mesmo patrimônio.

## Cronologia e validação por data

A data do estorno comercial é a data efetiva do crédito, posterior ou igual à compra. Ela não é substituída pela data original para fazer relatórios coincidirem. A decisão é distinta do estorno de correção de um lançamento incorreto.

Não basta conferir o saldo final. A validação deve reconstruir prefixos do histórico por data civil e verificar as relações em cada corte, incluindo lançamentos retroativos. Valores do mesmo dia precisam de uma política determinística; o agrupamento diário usado atualmente é um ponto de partida, sem alegar ordem intradiária que o modelo não registra.

Para um recebível original, em cada corte de data, defina:

- `P`: principal original já reconhecido.
- `R`: estornos comerciais acumulados alocados à divisão.
- `C`: reembolsos efetivamente recebidos da pessoa, sem contar cancelamentos como pagamentos.
- `D`: devoluções efetivamente realizadas à pessoa.

Então:

```text
recebível pendente = max(P − R − C, 0)
obrigação a devolver = max(C − (P − R), 0) − D
```

O segundo resultado não pode ser negativo. Os saldos dos ledgers precisam corresponder a essas fórmulas também em datas intermediárias. O original deve continuar reconhecido; somente os direitos ainda existentes podem ser cancelados, e somente o excesso já recebido pode virar obrigação de devolver.

Por exemplo, lançar hoje um estorno com data anterior a um reembolso já cadastrado pode exigir realocação contábil desse recebimento. Não é aceitável antecipar um passivo com a pessoa antes de ela pagar ou manter recebível artificial para compensá-lo. Uma primeira implementação pode recusar esse lançamento retroativo com explicação e orientação de revisão, em vez de reescrever entradas originais. O limite cronológico exato deverá ser definido e testado antes da entrega.

Créditos aplicados e devoluções também precisam estar cobertos na data e no estado atual. Pagamentos posteriores não podem esconder saldo negativo histórico de `cardCredit` ou `personPayable`.

## Invariantes a implementar

1. Soma das alocações igual ao valor total do estorno, sem valores nulos, negativos ou divisão duplicada na mesma operação.
2. Estorno acumulado por divisão não superior ao valor original daquela divisão; total acumulado da compra não superior ao total original.
3. Compra, fatura creditada, crédito utilizado e cartão precisam corresponder. Não transferir crédito entre cartões silenciosamente.
4. Referências, natureza das categorias, valores inteiros seguros e partidas balanceadas validados também ao restaurar/importar dados.
5. Compra, divisões, parcelas, pagamentos e reembolsos originais preservados. Alocações não podem se apoiar em uma divisão de outra compra.
6. Recebíveis, passivos de devolução e ativos de crédito no cartão não negativos, coerentes com os eventos e limites em cada data.
7. Uma utilização de crédito não pode exceder o crédito disponível nem a obrigação da fatura, tanto na data escolhida quanto no saldo atual.
8. Uma devolução não pode exceder o passivo correspondente e só pode usar uma conta ativa; reservas de caixa continuam protegidas.
9. A chave idempotente deve preservar o resultado de uma repetição. Operações concorrentes não podem ultrapassar limites acumulados.
10. Operação, alocações, entradas e recibo gravados numa única transação; falha em qualquer escrita reverte tudo.
11. Receita e elegibilidade de contribuição não são criadas por estorno, crédito utilizado ou devolução à pessoa.
12. Crédito no cartão não entra no disponível para gastos em conta. Uma obrigação com a pessoa não desaparece quando seu recebível chega a zero.

## Parcelas e cronograma do recebível

O crédito comercial e o cancelamento de parcelas futuras pelo emissor são fatos diferentes. No fluxo proposto de crédito, as parcelas originais permanecem registradas; o crédito é aplicado explicitamente à fatura efetivamente compensada. Não cancelar simultaneamente as parcelas e registrar o mesmo crédito, pois isso reduziria a obrigação duas vezes.

O cronograma prometido pelo terceiro continua independente do parcelamento do cartão. O seletor atual de recebíveis considera toda redução do principal como pagamento; ele precisará distinguir valores pagos, valores cancelados pelo estorno e pendência.

Uma política candidata é reduzir primeiro as últimas parcelas da obrigação ajustada e aplicar pagamentos por FIFO às parcelas restantes. A política precisa ser exibida e validada, sem reescrever datas prometidas nem chamar de pagamento um valor cancelado. O valor efetivamente recebido da pessoa pode exceder o preço ajustado; esse excesso deve aparecer no passivo de devolução, não como parcela quitada adicional.

Eventuais datas prometidas para devolver dinheiro à pessoa não devem reutilizar automaticamente as parcelas do cartão. O saldo do passivo e seus pagamentos precisam permanecer consultáveis mesmo sem um cronograma avançado de devolução.

## Interface, consultas e portabilidade dependentes

- Prévia deve mostrar rateio, efeito em cada fatura, crédito excedente, redução de consumo, recebíveis cancelados e obrigações com pessoas antes da confirmação.
- Faturas devem distinguir pagamento, estorno comercial e crédito utilizado. Atualmente todo débito em `card` aparece como pagamento; essa apresentação seria incorreta após adicionar estornos.
- Cartões devem mostrar crédito com o emissor separadamente de limite e de dinheiro em conta.
- Pessoas deve mostrar o que há a receber e a devolver por compra, inclusive quando o recebível está zerado, com histórico das devoluções realizadas.
- Dashboard, patrimônio, planejamento, assistente e relatórios devem reconhecer os novos ativos/passivos sem duplicação. A projeção deve considerar o dinheiro a devolver e não tratar crédito no cartão como caixa para qualquer despesa. O indicador atual de disponível é caixa menos reservas; qualquer alteração de sua definição deve ser explícita. Não criar uma reserva automática sem cobertura nem descontar a mesma obrigação duas vezes.
- Um estorno de compra de outro mês pode deixar consumo líquido negativo no mês atual. Gráficos e categorias precisam comportar valores assinados; ocultar valores negativos produziria apresentação incompleta.
- Orçamentos devem declarar o tratamento do consumo líquido e dos créditos no período. Não ocultar um resultado negativo nem alterar o mês original silenciosamente.
- CSV/Power BI precisam incluir os vínculos e instruir o uso dos lados contábeis para calcular consumo líquido.
- Migrações e novo formato de backup devem preservar os esquemas anteriores; leitores antigos não compreendem novos tipos/ledgers. A migração e a compatibilidade precisam ser exercitadas em dados legados, sem resetar o banco.

## Matriz de testes proposta

| Área | Variações | Resultado a verificar |
| --- | --- | --- |
| Compra própria | Estorno parcial, total e vários parciais | Consumo reduzido exatamente; soma limitada ao original |
| Compra compartilhada | Uma ou várias pessoas; pessoa repetida em divisões distintas | Alocação por divisão, direitos e obrigações preservados por origem |
| Reembolso do terceiro | Nenhum, parcial, total | Cancelamento do pendente; somente o excesso recebido vira passivo |
| Fatura | Aberta, parcialmente paga, quitada | Redução até zero; excedente em crédito, sem fabricar caixa |
| Parcelamento | Uma parcela, várias futuras, primeira fatura explícita | Parcelas originais preservadas; crédito não cancela a mesma obrigação duas vezes |
| Rateio | Próprio/terceiros; restos de centavos; divisões repetidas | Soma exata e limites por divisão; rejeição atômica de dados inválidos |
| Créditos | Utilização parcial/total; várias faturas do mesmo cartão | Limites na data e no estado atual; sem despesa/renda adicional |
| Cartão incorreto | Crédito ou fatura de outro cartão | Rejeição sem gravação parcial |
| Devoluções | Parcial, total, várias devoluções e valor excessivo | Redução do passivo e caixa; excesso recusado; sem nova despesa |
| Reservas | Caixa livre, reservado e conta arquivada | Proteções atuais preservadas; erro claro sem ajuste silencioso |
| Cronologia | Compra, reembolso, estorno, pagamento e devolução em ordens distintas | Fórmulas verificadas em cortes intermediários; retroatividade inválida recusada |
| Mesmo dia | Eventos em ordens de gravação diferentes | Política diária determinística e totais coerentes |
| Relatórios | Compra antiga estornada no mês atual | Consumo líquido assinado no período correto; receita inalterada |
| Cronograma de terceiros | Sem plano, com plano e parcelas já pagas | Pagamento separado de cancelamento; excesso reconhecido como passivo |
| Idempotência | Repetição após fechar/reabrir e resposta incerta após commit | Mesmo resultado, sem novo estorno, crédito ou devolução |
| Concorrência | Duas abas estornando a mesma parte ou usando o mesmo crédito | Limite preservado; somente operações ainda válidas confirmadas |
| Rollback | Falha em entradas, alocações ou recibos | Estado anterior integralmente preservado |
| Importação/restauração | Referências, valores ou lados adulterados; versão desconhecida | Recusa antes da substituição; vínculos válidos preservados no round-trip |
| Migração | Cada esquema anterior suportado | IDs, parcelas, saldos e idempotência mantidos; nenhum reset |
| Interface | Cancelar prévia, confirmar, recarregar e consultar vínculos | Nada grava na prévia; resultado persistente e histórico navegável |
| Offline | Confirmar e consultar sem rede após instalação | IndexedDB e recursos estáticos funcionando no caminho do Pages |

O cenário total e o parcial deste documento devem ser critérios de aceitação automatizados, incluindo conferência do patrimônio e de todas as parcelas do balanço. Cobertura de tela isolada não basta para considerar o módulo concluído.

## Decisões ainda abertas

- Forma exata de registrar um crédito do emissor quando a compra e o crédito aparecem em faturas diferentes.
- Política de lançamentos retroativos que afetem reembolsos/pagamentos já existentes e tratamento de eventos do mesmo dia.
- Política final de abatimento do cronograma prometido e apresentação das parcelas ajustadas.
- Apresentação das obrigações a devolver no indicador disponível e na projeção, preservando uma definição explícita e evitando reservas fictícias ou dupla subtração.
- Inclusão de datas prometidas e eventual cronograma de devolução à pessoa.
- Tratamento de recebimento do crédito em conta, de cancelamento de parcelas sem crédito e de correção de um estorno comercial incorreto.
- Sequência de implementação, migração e interface que entregue um conjunto utilizável sem anunciar suporte parcial como completo.

Essas decisões não dependem de contratação de um serviço pago, mas precisam de modelagem, implementação e validação próprias. O plano serve para orientar essa revisão; sua existência não altera as funcionalidades atualmente disponíveis.
