# Como usar — versão 0.10.0

O DexFin é local. Seus dados pertencem ao perfil e à origem do navegador; não há conta externa, integração bancária ou sincronização. Faça backups: limpar os dados do site, mudar porta/perfil ou perder o dispositivo pode retirar o acesso aos registros.

## Contas, categorias e movimentações

1. Em **Contas e saldos → Nova conta**, informe nome, instituição opcional, tipo, saldo inicial e data de abertura. Escolha data anterior ou igual à primeira movimentação que pretende registrar. Saldo inicial não é renda.
2. Em **Categorias e fontes**, adicione sugestões ou crie seus nomes. Uma fonte cadastrada não confirma receita. Edite nomes ou arquive sem apagar o histórico; a natureza da categoria não muda depois da criação.
3. Em **Movimentações → Nova movimentação**, escolha receita recebida, despesa paga em conta ou transferência entre contas próprias distintas. Valores como `12,50` ou `1.234,56`; datas realizadas até hoje no fuso configurado.
4. Busque no histórico, filtre tipo/conta/período ou use **Ver extrato** na conta. Filtros não alteram saldos atuais. No celular, os valores permanecem visíveis sem rolagem lateral.

Editar conta altera somente nome/instituição/tipo, não saldo inicial ou lançamentos. Conta só pode ser arquivada com saldo zero. **Mostrar arquivadas** permite reativar. Para fatos futuros, use Planejamento; para compras no cartão, use a seção de cartões. Receitas, despesas e transferências registradas por engano podem ser corrigidas por estorno integral, conforme a seção seguinte.

## Subcategorias e grupos

Em **Categorias e fontes**, use **Nova subcategoria**, informe nome, natureza e grupo ativo, confira o caminho e confirme. **Organizar grupos** move uma categoria ou a deixa sem grupo; seus filhos acompanham a mudança. Não é permitido formar ciclos ou misturar receita e despesa.

Os seletores mostram o caminho completo, por exemplo **Alimentação / Restaurantes**. Orçamento do grupo inclui suas subcategorias; o dashboard lista o consumo direto de cada categoria sem somar pai e filho duas vezes. Mover um grupo altera a organização dos relatórios existentes, preservando os lançamentos e os valores. Confira os orçamentos ao reorganizar. Arquive primeiro os filhos antes de arquivar um grupo; reative o grupo antes de reativar os filhos.

O assistente aceita o caminho completo ou um nome simples não ambíguo. Nomes/caminhos iguais exigem esclarecimento; personalize os nomes para distingui-los.

## Conferir saldo com o extrato

Em **Contas e saldos**, escolha **Conferir saldo** na conta. Informe a data de corte e o saldo final que aparece no extrato. A diferença é **extrato − calculado**; a lista mostra os lançamentos de caixa daquela conta até o corte, incluindo o lado correto de transferências e estornos.

A comparação não altera o saldo, não cria receita/despesa e não acessa o banco. Valores digitados e a comparação não ficam salvos ao fechar. Uma coincidência de saldos não prova que todos os lançamentos estejam corretos; diferenças de mesmo valor podem se compensar. Confira saldo inicial, registros faltantes, duplicados e datas antes de corrigir os fatos pelo fluxo apropriado.

## Corrigir um lançamento com estorno

1. Em **Movimentações**, localize a receita, despesa ou transferência incorreta e escolha **Estornar**.
2. Confira o original, os ajustes em cada conta e os saldos previstos. Informe o motivo e confirme que o lançamento foi registrado por engano.
3. Use **Confirmar estorno**. O original ganha a indicação **Estornada** e permanece no histórico, acompanhado do ajuste inverso.
4. Use **Ver estorno** ou **Ver original** para consultar os dois registros, o motivo e quando a correção foi criada.
5. Se o fato existiu com outros dados, crie uma **Nova movimentação** com os dados corretos. Ela exige uma nova confirmação e segue as regras vigentes de contribuição.

O estorno usa a mesma data financeira do original para retirar seu efeito daquele período. O instante de criação registra quando você corrigiu. Por exemplo, uma despesa incorreta de R$ 50 em janeiro e seu estorno somam zero no consumo de janeiro, sem virar receita de outro mês. Histórico, relatório e CSV preservam ambos os registros; seus valores brutos não devem ser somados como duas despesas.

Contribuições sugeridas/reservadas da receita são canceladas e as respectivas reservas liberadas. Contribuições já pagas continuam como despesa, pois o dinheiro foi efetivamente pago. Se registrar uma receita corrigida, revise as regras antes: ela pode gerar novas contribuições, e o app não compensa automaticamente pagamentos da receita anterior.

Uma previsão realizada vinculada ao original passa a mostrar **Realização estornada** e continua encerrada. Crie outra previsão quando necessário. Contas arquivadas precisam ser reativadas. Ajuste reservas de metas se elas ficarem sem cobertura; a operação inteira será recusada até resolver a condição. Saldo devedor pode aparecer quando a correção revela que a renda registrada não existiu.

Cada original aceita um estorno. Repetição da mesma ação é idempotente; outra aba acompanha o resultado e não cria um segundo estorno. Não há estorno de estorno: para registrar um fato válido, crie um novo lançamento revisado.

Este fluxo atende à correção integral de registros incorretos de caixa. Devoluções comerciais, estornos de compras no cartão, pagamentos de fatura/reembolso/contribuição, empréstimos, investimentos e saldo inicial ainda exigem evolução específica; não possuem botão de estorno nesta versão.

## Cartões, compras compartilhadas e recebíveis

1. Cadastre pessoas em **Pessoas e recebíveis**.
2. Em **Cartões e faturas**, cadastre nome, limite, fechamento e vencimento. O limite nunca é dinheiro em conta.
3. Use **Nova compra**, informe total, data, comprador, primeira fatura opcional e quantidade de parcelas no cartão.
4. Adicione divisões, escolhendo Eu ou uma pessoa. A divisão pessoal exige categoria; divisões de terceiros viram recebíveis. A soma deve bater com o total.
5. Confira as faturas e use **Pagar fatura** para um pagamento total ou parcial em conta. O pagamento não gera a despesa novamente.
6. Em Pessoas, filtre o extrato individual e use **Registrar reembolso**. O reembolso reduz o que a pessoa deve, sem gerar nova receita.

Uma compra de R$ 300 com R$ 120 próprios, R$ 100 de João e R$ 80 de Ana mantém uma compra, três divisões, R$ 120 de consumo e R$ 180 a receber. O exemplo explica a regra; não é inserido automaticamente no banco.

O parcelamento do cartão distribui o passivo nas faturas. **Parcelar reembolso** cria outro cronograma para a pessoa, antes de receber pagamentos; ele não duplica o recebível. Pagamentos parciais quitam primeiro as parcelas prometidas mais antigas. Alterar dias do cartão não reescreve faturas existentes.

## Dashboard e contribuições

Depois de cadastrar contas/registros, Visão geral mostra indicadores reais e seleção mensal. Receitas/despesas/categorias são fluxos do período. Disponível, reservas e faturas são estoques atuais. Disponível = caixa menos reservas, sem descontar novamente faturas e compromissos. Use Planejamento para cenários conservadores.

Em **Contribuições**, crie uma regra, informe seu percentual, fontes elegíveis e modo sugestão/reserva. Ative explicitamente. Novos recebimentos elegíveis geram sugestão ou reserva; não recalcula automaticamente rendas anteriores. Transferências/reembolsos ficam de fora. Ajuste, cancele ou pague; somente o pagamento gera despesa e libera a reserva correspondente. Se regras/reservas excederem o caixa da conta, o registro inteiro é rejeitado e as regras devem ser revistas.

## Planejamento e metas

- **Orçamento:** limite por categoria/mês; compras parceladas contam como consumo na data original.
- **Meta:** alvo, conta e prazo. Ajustar reserva informa o total, não um acréscimo. Zero libera o caixa sem renda. Não representa despesa nem dinheiro novo.
- **Previsão:** receita/despesa esperada, separada do realizado. Confirme somente ao receber/pagar. Libere previamente uma reserva destinada ao pagamento, se houver.
- **Recorrência:** assinatura ou receita mensal; o comando **Gerar previsões do mês** é manual e não duplica ocorrências. Não paga automaticamente. Pausar impede novas gerações.
- **Projeção:** por padrão exclui receitas incertas. Confira a fórmula exibida e evite registrar a mesma obrigação como fatura/previsão/reserva duplicadas.

## Investimentos e empréstimos

Em **Investimentos**, cadastre a identificação, registre aportes/resgates entre conta e investimento ou atualize a avaliação manual. Aporte/resgate não é consumo/renda. Avaliação não é caixa recebido. Valores podem estar defasados; não há cotação, custo médio ou cálculo fiscal. Um rendimento distribuído em conta pode ser receita, mas não registre o mesmo recebimento também como resgate.

Em **Dívidas e empréstimos**, escolha principal emprestado ou recebido, pessoa, conta, data e vencimento. Pagamentos separam principal e juros; somente juros são renda/despesa. São aceitos pagamentos parciais; não há amortização ou contratação automática de crédito.

## Assistente

O assistente consulta seus dados sem enviá-los a serviços externos. Perguntas predefinidas explicam saldo, recebíveis, faturas, aumentos mensais, vencimentos e patrimônio. Simulações não tomam decisões por você.

Formatos de lançamento com prévia:

```text
gastei 12,50 em Alimentação na conta Nubank
recebi 100,00 de Estágio na conta Nubank categoria Trabalho
```

Use nomes exatos dos seus cadastros. Se o nome for ausente/ambíguo, haverá pedido de esclarecimento. Revise os campos e confirme antes de salvar; o botão daquela prévia é removido após confirmação. Para divisão complexa, use o formulário de cartões. Conversas/rascunhos não sobrevivem à recarga.

## Backup, CSV, PDF e exclusão

Use **Relatórios e backup** para CSV por tabela, backup com senha, prévia/restauração e importação CSV com mapeamento. O importador aceita o modelo DexFin, não qualquer extrato bancário. Em relatório, selecione o mês e use **Imprimir / salvar PDF**. Consulte [PORTABILIDADE.md](PORTABILIDADE.md) para unidades, relacionamentos e recuperação.

Se o banco inconsistente impedir carregar as telas, use **Abrir recuperação de dados**, valide um backup, baixe a cópia de diagnóstico e confirme a substituição. A cópia contém dados legíveis e não é um backup restaurável. O aplicativo recarrega após recuperar. Veja [PORTABILIDADE.md](PORTABILIDADE.md).

Em **Relatórios e backup → Lembretes de backup**, escolha 7, 14 ou 30 dias e ative/desative o aviso. Você pode adiá-lo por 24 horas. O lembrete considera cadastros, planejamento e todo o estado financeiro; sem mudanças não insiste em gerar uma cópia igual. O registro é de **download solicitado**, não prova de arquivo guardado. Confira o arquivo na pasta de downloads e proteja-o junto com a senha. Restauração não conta como nova exportação; o aviso é adiado por 24 horas. As preferências são locais e não vão dentro do backup financeiro.

Em **Privacidade**, solicite armazenamento persistente quando o navegador permitir. Isso não substitui backup. Excluir todos os registros exige digitar APAGAR e não remove cópias externas.

## Importar extrato OFX bancário

Em **Relatórios e backup → Importar extrato OFX**, selecione um arquivo de conta bancária BRL, escolha a conta correspondente e confirme que conferiu a identificação do extrato. Defina categorias/fontes e classifique os lançamentos. **Classificar lançamentos comuns pendentes** usa as escolhas padrão apenas nos movimentos considerados comuns; transferências, PIX e outros movimentos especiais continuam pendentes para sua decisão.

Revise cada lançamento pendente. Transferências entre contas próprias, pagamento de fatura, reembolso e estorno precisam de seus fluxos específicos: ignore-os neste adaptador e registre nas seções apropriadas. Não transforme esses movimentos em renda/consumo só para concluir a importação. Você também pode ignorar explicitamente todos os pendentes.

Use **Validar e visualizar importação OFX**, revise a conta e os valores e confirme. O lote é atômico. Repetir conta+FITID reconhece duplicatas; mudar a classificação de um FITID já importado gera conflito. Corrija o original pelo fluxo apropriado; não invente outro ID para forçar a importação. O adaptador não identifica equivalência com CSV ou lançamentos manuais, então confira para evitar registrar o mesmo fato por dois caminhos. Consulte PORTABILIDADE.md para o subconjunto e limites aceitos.

## Offline

A PWA funciona no build de produção, após a primeira carga completa conectada. Instale pelo botão/menu oferecido pelo navegador. A mensagem de offline não significa perda de acesso ao IndexedDB. Atualizações são aplicadas explicitamente; salve ou feche formulários em todas as abas antes de aplicar uma nova versão. Uma aba com modal aberto adia a recarga; depois de fechar, use **Recarregar aplicação**. O servidor de desenvolvimento não ativa service worker.

## Limitações

Sem Open Finance/sincronização, XLSX, anexos, conciliação automática ou sessões de conferência salvas, estornos parciais/comerciais ou de outros módulos, renegociações, edição financeira no original, amortização automática ou controles fiscais de investimentos. O banco local não é criptografado; o backup pode ser. Consulte [instalação e manutenção](INSTALACAO-E-MANUTENCAO.md) para primeiros passos, atualização e recuperação.
