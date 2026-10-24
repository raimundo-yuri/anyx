# Regras financeiras implementadas

## Devolução comercial de cartão — versão 0.11

O comando `purchaseRefund` recebe compra, fatura creditada do mesmo cartão, data efetiva, motivo, total e alocações por divisão. Cada divisão tem limite acumulado igual ao seu valor original. A própria parte credita despesa; a de terceiro cancela recebível pendente e credita `personPayable` no excesso já recebido. No débito, a fatura cai até zero e o excedente vira `cardCredit`. Não há renda, contribuição ou caixa novo.

`cardCreditUse` debita a fatura e credita o ativo do mesmo cartão. `personRefund` debita a obrigação da divisão e credita a conta ativa da devolução efetiva. Valores devem caber na data e no saldo atual; reservas em conta continuam protegidas. Nenhum desses fatos apaga lançamentos anteriores ou cancela automaticamente parcelas do cartão.

Em cada corte diário: recebível=max(principal−devoluções−recebido,0); a devolver=max(recebido−(principal−devoluções),0)−devolvido. A obrigação não pode ficar negativa. Créditos e obrigações têm prefixos diários não negativos. Estornos retroativos antes de movimentos já registrados do cartão ou das divisões selecionadas são recusados para evitar reescrever a classificação de pagamentos. Movimentos no mesmo dia são agrupados, sem ordem intradiária presumida.

Com caixa inicial de R$ 1.000, compra de R$ 300 (R$ 120 seus, R$ 100 de A, R$ 80 de B), fatura paga e R$ 60 recebidos de A, a devolução total deixa caixa R$ 760, crédito no cartão R$ 300, recebíveis zero e R$ 60 a devolver: patrimônio R$ 1.000. Devolver R$ 60 deixa caixa R$ 700 e obrigação zero, mantendo patrimônio R$ 1.000. Não há recuperação automática dos R$ 300 para a conta.

A despesa reduz na data efetiva do crédito, podendo deixar o mês negativo. Orçamento e dashboard mostram consumo líquido sem esconder esse crédito nem alterar o mês original. Disponível permanece caixa menos reservas, com obrigações separadas; a projeção conservadora desconta o valor a devolver às pessoas, sem adicionar crédito no cartão como dinheiro disponível. Cancelamento simples de parcelas, crédito direto em conta, contestação e correção de uma devolução comercial incorreta não fazem parte deste fluxo.

## Dinheiro e datas

Dinheiro é armazenado em centavos inteiros seguros. `parseBRL` aceita texto brasileiro como `1.234,56`; rejeita formatos ambíguos e não multiplica números decimais em ponto flutuante. Agregações validam overflow. Percentuais usam BigInt nos intermediários e arredondam meio centavo para cima.

Datas civis são validadas por calendário, sem conversão de fuso. No dia do fechamento, uma compra vai por padrão para o ciclo seguinte. Pode haver seleção explícita de ciclo, inclusive o do dia de fechamento; nunca se aceita fatura que feche antes da compra. Dias 29–31 são limitados ao último dia válido do mês. O vencimento sempre fica depois do fechamento, avançando ao mês seguinte se necessário.

## Partidas balanceadas

| Operação | Débito | Crédito |
| --- | --- | --- |
| Saldo inicial positivo | Caixa | Patrimônio inicial |
| Receita recebida | Caixa | Receita |
| Despesa pessoal paga | Despesa | Caixa |
| Transferência própria | Caixa de destino | Caixa de origem |
| Compra no cartão | Despesa pessoal e/ou recebíveis | Obrigação da fatura |
| Reembolso | Caixa | Recebível |
| Pagamento de fatura | Obrigação da fatura | Caixa |
| Pagamento de contribuição | Despesa de contribuição | Caixa |

Saldo inicial negativo inverte os lados e não gera despesa de consumo. Saldos bancários negativos são permitidos para representar uma situação real; o app não cria crédito fictício para cobri-los. Não há modelagem de juros de cheque especial nesta etapa.

## Compra compartilhada obrigatória

Uma compra de R$ 300 gera uma compra original e três divisões: R$ 120 próprios, R$ 100 da pessoa A e R$ 80 da pessoa B. O motor registra R$ 120 de despesa, R$ 180 de ativos a receber e R$ 300 de obrigação no cartão. O caixa permanece igual.

Receber R$ 60 de A deixa R$ 40 pendentes para essa pessoa e R$ 80 para B. O recebimento aumenta caixa e diminui recebível; não aumenta renda nem patrimônio. Pagar a fatura reduz caixa e passivo em R$ 300 e não repete a despesa de R$ 120. Pagamentos parciais são aceitos; excessos são rejeitados.

## Reservas e contribuições

Regras usam fonte de receita identificada, percentual configurável e ativação explícita. Somente um comando de receita efetivamente recebida pode gerar contribuição. Saldo inicial, transferência e reembolso não acionam regra.

- Sugestão não movimenta nem reserva dinheiro.
- Reserva automática reduz o disponível para novos compromissos, sem gerar despesa.
- Pagamento gera despesa, reduz caixa e libera a reserva correspondente, sem diminuir o disponível duas vezes.
- Cancelamento libera a reserva e preserva o histórico, sem gerar despesa.
- Contribuições encerradas não podem ser pagas de novo. Retentativa com a mesma chave retorna o resultado anterior.

Uma operação que deixaria reservas ativas sem cobertura na conta é rejeitada atomicamente. Se regras conflitantes ou saldo negativo impedirem uma reserva automática, o recebimento é rejeitado inteiro; não há conversão silenciosa em sugestão. Os editores de regras e contribuições permitem ajustar percentuais, fontes e valores antes de tentar novamente. Alterar uma regra não recalcula contribuições anteriores.

Reservas são associadas a contribuições ou metas; reservas de metas foram adicionadas na etapa 8. Registros antigos de reserva deixam de compor o total ativo quando a contribuição é paga ou cancelada.

## Indicadores e recortes

`summary` é uma consulta do domínio compartilhada pelo dashboard, pelos relatórios e pela página Contas e saldos. Gráficos, indicadores e extratos usam os mesmos lançamentos reais.

- Caixa: saldo atual de todas as contas, sem limite de cartão.
- Disponível: caixa atual menos reservas ativas.
- Receitas e despesas: fluxos realizados entre as datas do período, inclusive consumo no cartão.
- Faturas pendentes: passivo atual das faturas.
- Reservado: reservas ativas.
- A receber: ativos pendentes contra terceiros; não são dinheiro disponível.
- Patrimônio: caixa + recebíveis + principal emprestado + investimentos − faturas − principal devido.

O filtro de período altera os fluxos de receita/despesa; os estoques continuam atuais. Disponível não desconta novamente as faturas: elas aparecem separadas. Não se deve anunciar esse indicador como saldo já descontado de todos os compromissos futuros.

## Limites

Comandos de caixa representam fatos realizados. Previsões, orçamentos, empréstimos, investimentos e parcelamentos têm comandos próprios, descritos na atualização abaixo. Estornos de correção de receitas/despesas/transferências são implementados na evolução descrita abaixo. Devoluções comerciais de cartão têm o fluxo da versão 0.11 descrito acima; correção de outros módulos e conciliação automática continuam pendentes. A versão 0.10 permite conferir manualmente o saldo com o extrato, sem ajustar lançamentos. Não há comando de exclusão silenciosa de histórico.


## Registro pela interface — etapa 4

Formulários de receitas e despesas representam fatos recebidos/pagos, com data até hoje no fuso America/Sao_Paulo configurado. Datas futuras são recusadas no formulário; não há transformação automática de previsão em realizado. Uma conta, uma categoria da natureza correta e, para receitas, uma fonte ativa são obrigatórias. Transferências exigem duas contas ativas distintas.

O saldo inicial é informado na criação da conta e gera operação patrimonial; se for zero, não há lançamento de valor zero. A edição do cadastro não altera dinheiro. Contas devedoras são aceitas para refletir a realidade, mas não há cálculo de juros ou conciliação automática.

Arquivar categoria/fonte preserva o passado e impede seu uso em novas operações. Arquivar conta exige saldo zero. Reativar não movimenta dinheiro. O nome editado é apresentado também nos registros vinculados por ID, mantendo valores e datas originais.

O extrato mostra cada operação original uma vez. A transferência aparece nos extratos das duas contas, mas uma única vez no consolidado. Os filtros só selecionam linhas e não alteram os saldos atuais. Compras compartilhadas preexistentes no domínio aparecem como valor total da compra, explicitamente identificado; o valor total não deve ser confundido com consumo pessoal.

## Atualização das etapas 5 a 8

As referências anteriores a parcelas, metas, orçamento, previsões, investimentos e empréstimos como pendentes descrevem o estado da etapa 4. Esses módulos agora têm regras e interface. Correção de outros módulos, renegociações e conciliação automática permanecem fora do escopo implementado; devoluções comerciais de cartão foram acrescentadas na versão 0.11. A correção integral de receitas/despesas/transferências foi acrescentada na versão 0.9.

### Cartão parcelado e reembolso independente

Toda a compra e seu consumo pessoal são reconhecidos na data original. O passivo é distribuído entre as faturas, começando na fatura escolhida. Cada parcela referencia a mesma compra; a soma em centavos é exata, com restos alocados às primeiras parcelas. Pagamento de fatura apenas liquida o passivo.

O plano de reembolso é criado antes de receber pagamentos e pode ter quantidade/data inicial diferentes do cartão. Sua soma é o principal do recebível, sem criar outro ativo. Cada reembolso reduz o saldo único e é alocado por FIFO às parcelas prometidas mais antigas.

### Metas, orçamento e previsões

Meta é uma finalidade de reserva do caixa existente, não novo ativo ou despesa. Ajustar o total reservado reduz/aumenta o livre; zero libera a reserva sem receita. Limites de cobertura e alvo são validados atomicamente.

Orçamento compara limite mensal com consumo pessoal reconhecido no mês. A compra parcelada conta como consumo integral na data da compra, não novamente em cada fatura. A previsão não altera esse realizado.

Recorrências geram previsões somente quando o usuário aciona a geração; repetir o mês não duplica ocorrências. Confirmação cria uma única receita/despesa e marca a previsão como realizada. Cancelamento não altera caixa. Para confirmar uma despesa coberta por meta, liberar a reserva correspondente antes do pagamento.

A projeção conservadora usa disponível atual menos despesas previstas, faturas e principal de empréstimos devidos até o mês escolhido. Receitas previstas só entram se o cenário for explicitamente ativado. Não identifica por descrição quando o usuário registrou duas representações do mesmo compromisso: não duplicar fatura/previsão/reserva para a mesma finalidade.

### Investimentos

Aporte: débito em investimento e crédito no caixa; resgate: débito em caixa e crédito no investimento. Nenhum é consumo ou renda. Resgate não pode superar o valor contábil registrado.

Avaliação manual altera investimento contra `valuation`, sem renda recebida ou caixa; patrimônio aumenta/diminui conforme a variação informada. Não há cotação automática, custo médio, cálculo fiscal ou medida auditada de rentabilidade. Um rendimento efetivamente distribuído e recebido em conta é receita com fonte/categoria próprias, sem também registrar resgate do mesmo valor. Resgates da posição avaliada apenas convertem ativo em caixa, sem fabricar renda nova.

### Empréstimos

Conceder principal: débito em `loanAsset`, crédito em caixa. Receber principal emprestado: débito em caixa, crédito em `loanDebt`. Não são consumo nem renda.

Pagamento de principal reduz o ativo/passivo correspondente; juros são lançados separadamente como receita/despesa. Juros recebidos podem acionar contribuição se sua fonte for elegível. Principal não aciona a regra. Não há capitalização ou amortização automática; juros são informados pelo usuário no pagamento.

Patrimônio atual = caixa + recebíveis de compras + principal emprestado + investimentos − faturas − principal devido. Reservas não são somadas outra vez. Projeções e limite de crédito não entram como ativos.

## Correção integral por estorno — versão 0.9

O comando `reverseMovement` aceita receita, despesa ou transferência e um motivo obrigatório. Preserva o original e inverte integralmente seus lançamentos, com vínculo e chave idempotente. A data original é mantida para corrigir o período afetado; não representa uma devolução comercial recebida em outro mês.

Estorno de receita: débito em receita e crédito em caixa. Estorno de despesa: débito em caixa e crédito em despesa. Estorno de transferência: retorno da conta de destino à de origem, sem receita/despesa consolidada. Relatórios e orçamento usam os saldos líquidos, incluindo as inversões; nunca classificar o crédito de uma despesa como renda nova.

Sugestões/reservas de contribuição da receita são canceladas e vinculadas ao estorno; reservas ficam inativas. Pagamentos já realizados permanecem como despesa. Uma receita corrigida cadastrada depois é um novo fato e segue as regras atuais; não há compensação automática entre suas contribuições e as já pagas da anterior.

A previsão realizada permanece encerrada com referência ao original e identificação derivada de realização estornada. Contas envolvidas precisam estar ativas. Reservas de metas devem continuar cobertas após a correção; se necessário, ajustar previamente. Corrigir renda incorreta pode revelar saldo negativo, que é aceito para representar a situação registrada.

O estorno é único, com inversão exata conferida também ao importar backup. Falha parcial ou concorrência não duplica o ajuste. Estorno de estorno e alteração arbitrária de sua data/valor são recusados. Para corrigir os dados de um fato válido, criar um novo lançamento revisado após estornar o incorreto.

## Subcategorias, extratos e conferência — versão 0.10

Categorias podem pertencer a um grupo da mesma natureza. A hierarquia recusa ciclos, referências ausentes e categoria ativa sob grupo arquivado. Arquivar um grupo com descendentes ativos é recusado. Mudar o grupo preserva IDs, valores e lançamentos: reinterpreta o agrupamento de todo o histórico, com prévia e confirmação.

O orçamento de uma categoria inclui o consumo de seus descendentes, cada lançamento uma única vez. Orçamentos simultâneos para grupo e subcategoria são comparações independentes e não devem ser somados como gastos distintos. A distribuição do dashboard mantém a categoria direta do lançamento para não duplicar o consumo entre pai e filho.

A conferência de uma conta calcula seu caixa até a data de corte inclusive, usando os lançamentos assinados e o lado correto das transferências e estornos. A diferença é o saldo informado no extrato menos o calculado. Ela não grava uma sessão nem cria ajuste para fazer os saldos coincidirem; limite de crédito e aplicações separadas não compõem o saldo bancário a conferir.

OFX importa somente receitas/despesas realizadas depois de selecionar a conta correspondente, classificar os registros, revisar a prévia e confirmar. Transferências, pagamentos de fatura, reembolsos e outros movimentos ambíguos exigem decisão individual; o importador não os converte automaticamente em renda/consumo. Importação de receitas segue as regras de contribuição vigentes. Datas anteriores à abertura da conta e demais violações do domínio impedem o lote inteiro.

A identidade de importação combina a conta DexFin com o FITID bancário. Repetir o mesmo registro não duplica operações, inclusive após recarga; usar a mesma identidade com dados/classificação diferentes é conflito e exige revisão. Não se presume equivalência com lançamentos já digitados ou importados por CSV. O saldo inicial deve corresponder ao início do período importado, para não contabilizar o extrato duas vezes.
