# Progresso

## Etapa 1 — concluída e aprovada

Especificação preservada em `ESPECIFICACAO.md`; arquitetura, modelo e escopo definidos em `PLANO.md`.

## Etapa 2 — estrutura

- Projeto React/TypeScript/Vite com npm e versões exatas no lockfile.
- Node 24 LTS declarado em `.nvmrc` e `package.json`.
- Nome do produto e padrões de localidade centralizados; exemplo público sem segredos.
- Base visual responsiva escura, navegação funcional, foco visível e redução de movimento.
- Páginas de apresentação, estado do projeto e limites de privacidade. Sem números fictícios.
- Separação das camadas futuras documentada, sem implementar o domínio prematuramente.
- Testes RTL/Vitest e scripts de tipagem, build e execução.

Decisão: adiar Dexie, Zod, gráficos e PWA até as etapas que os utilizam. Não antecipar um dashboard sem persistência ou motor financeiro.

Verificação: três testes de interação aprovados; tipagem e build aprovados; auditoria sem vulnerabilidades conhecidas na execução desta etapa. A verificação de interface foi feita em DOM simulado, sem afirmar validação visual em navegador real.

## Escopo aprovado para a etapa 3

Etapa 3: entidades e esquemas, dinheiro em centavos, operações balanceadas, contratos de repositório, persistência Dexie e transações atômicas; testes das regras fundamentais antes de formulários financeiros.

## Etapa 3 — aprovada e concluída

- Esquemas Zod estritos, dinheiro em centavos e percentuais em pontos-base.
- Datas civis, fechamento de faturas e arredondamentos testados.
- Motor contábil puro com partidas balanceadas e consultas de saldo/patrimônio.
- Contas, categorias, pessoas, fontes, cartões, faturas, compras/divisões e recebíveis no domínio.
- Reembolso e pagamento parcial de fatura sem duplicação de receita/despesa.
- Regras configuráveis de contribuição com sugestão/reserva, pagamento e cancelamento.
- Contrato FinanceRepository e serviço independente de React/Dexie.
- IndexedDB versão 1 com transações atômicas, idempotência persistente e concorrência entre conexões.
- Interface atualizada para indicar etapa 3 e disponibilidade do banco, com erro seguro e retentativa.
- Documentos ARQUITETURA.md, MODELO-DE-DADOS.md, REGRAS-FINANCEIRAS.md e SEGURANCA.md.

Validação: 60 testes unitários/de integração/interface; dois testes Playwright (desktop e viewport móvel) com IndexedDB nativo; tipagem e build. Os exemplos A, B, C, D e H estão cobertos. E (parcelamento completo), F (backup/restauração) e G (importação de extrato) continuam pendentes nas etapas correspondentes.

O download do Chromium gerenciado pelo Playwright foi negado pela política de rede. Usado o Chromium já instalado em `/usr/bin/chromium`, mantendo as verificações de segurança; os testes reais passaram com esse navegador. A configuração agora o detecta automaticamente, sem exigir download ou alteração da rede neste ambiente.

As operações financeiras estão no domínio e nos casos de uso; os formulários e cadastros na interface não estão implementados. Não há backup, migração de uma versão financeira anterior, sincronização ou PWA offline. O helper de distribuição de centavos não representa parcelamento completo implementado.

## Escopo aprovado para a etapa 4: movimentações

Escopo posteriormente aprovado pelo usuário: criar formulários de contas e categorias e fluxos de receitas, despesas e transferências, usando os casos de uso existentes; validar interações e recarga sem dados fictícios. Manter cartões/recebíveis na interface para a etapa 5.


## Etapa 4 — aprovada e concluída

- Páginas Contas e saldos, Movimentações e Categorias e fontes, mantendo o tema e a navegação responsiva.
- Criação e edição de contas: nome, instituição e tipo; saldo inicial em centavos e data de abertura. Edição não altera saldo/histórico.
- Cadastro, renomeação, arquivamento e reativação de categorias/fontes. Contas só podem ser arquivadas com saldo zero.
- Sugestões opcionais: 15 categorias e 6 fontes, com IDs estáveis e instalação sem duplicações. Não criam renda confirmada, contas ou saldos.
- Receitas recebidas, despesas pagas em conta e transferências, com validações de datas e valores, fonte/categoria e vínculos.
- Campos preservados ao alternar tipo e após erros. Botão bloqueado durante envio e chave mantida na retentativa da mesma ação/conteúdo.
- Saldos calculados, extrato por conta e histórico com busca, período e filtros de tipo/conta. Transferência mostra origem → destino.
- LiveQuery acompanha alterações entre abas do mesmo perfil/origem. Não é sincronização remota.
- Modais nativos com rótulos associados por ID, foco e fechamento; layout móvel mantém os valores visíveis sem rolagem lateral da tabela.
- Metadados opcionais adicionados ao esquema de contas/categorias/fontes sem alterar índices ou apagar dados. Banco continua na versão 1; registros da etapa anterior continuam válidos.
- Documentação de uso e atualização das limitações atuais.

Verificado: `npm run check` passou com 72 testes, tipagem e build; `npm run test:browser` passou com 12 testes no Chromium (desktop e viewport móvel); `npm audit --audit-level=moderate` não encontrou vulnerabilidades conhecidas. Browser tests confirmaram saldos depois de receita/despesa/transferência, preservação após recarga, renomeação sem alterar valores, arquivamento, filtros, duas abas e falha após commit sem duplicação ao repetir.

A primeira rodada de navegador detectou que os rótulos dos selects precisavam de vínculos explícitos. Corrigido com IDs únicos e `htmlFor`; a rodada final completa passou. Ajustado o layout móvel para mostrar os valores sem precisar deslocar a tabela horizontalmente.

Limitações: rascunhos de formulários são mantidos apenas enquanto o formulário está aberto; não sobrevivem a fechar/recarregar a página. Não alterar campos após falha de confirmação antes de tentar novamente. Não há previsão de renda ou despesa: formulários aceitam fatos realizados com data até hoje no fuso configurado. Movimentações não são editadas/apagadas; reversões são uma etapa futura. Backup, PWA e conexões bancárias permanecem pendentes.

## Autorização ampliada — etapas 5 a 8

O usuário liberou o desenvolvimento até a etapa 8, dispensando confirmações intermediárias nesse escopo. As etapas 9 e 10 não foram autorizadas por essa ampliação.


## Etapa 5 — cartões e recebíveis

Cadastro e edição de cartões e pessoas; comprador identificado; compra única dividida por responsável/categoria; seleção da primeira fatura; pagamento parcial/total e histórico; recebíveis por pessoa, vencidos/pendentes/quitados e reembolso parcial. Nenhuma conexão bancária simulada. Compra R$ 300/R$ 120 pessoais/R$ 100 e R$ 80 de terceiros validada pela interface.

## Etapa 6 — dashboard e contribuições

Cinco indicadores com definições explícitas e distinção entre fluxo do período e estoque atual. Gráfico SVG mensal, valores acessíveis em tabela, categorias por ID, faturas e recebíveis. Estado vazio preservado para banco sem dados. Regras de contribuição por fonte/percentual, ativação, sugestão/reserva, edição, ajuste de valor, cancelamento e pagamento sem dupla contagem.

## Etapa 7 — portabilidade e PWA

Backup JSON completo com opção AES-GCM/PBKDF2, prévia, senha não armazenada e restauração atômica com detecção de mudança desde a prévia. CSV de tabelas relacionáveis por UUID, proteção contra fórmulas e documentação Power BI. Adaptador CSV DexFin para extratos com mapeamento, prévia e confirmação, rejeição de datas futuras e deduplicação por conta/ID externo. Relatório imprimível para PDF. Exclusão local exige digitar APAGAR.

PWA própria, sem dependência nova: manifesto e ícones, precache explícito de arquivos estáticos, atualização manual e proteção de formulário aberto na aplicação de atualização. CSP no build, sem scripts/serviços externos. Versão dev sem service worker; versão de produção testada offline, incluindo recarga, rota carregada sob demanda e escrita em IndexedDB. Não é sincronização remota nem criptografia do banco local.

## Etapa 8 — recursos avançados locais

- Parcelas no cartão com soma exata, restos de centavos nas primeiras parcelas e primeira fatura configurável.
- Plano de reembolso independente, com alocação FIFO dos pagamentos e sem duplicar o ativo.
- Metas com caixa reservado, liberação sem renda/despesa e orçamento mensal por categoria.
- Receitas/despesas previstas e recorrências mensais, geração explícita/idempotente e realização somente após confirmação.
- Projeção conservadora, calendário e indicação de vencidos/limites ultrapassados, sem prometer recebimentos.
- Investimentos manuais: aporte/resgate patrimonial e avaliação separada de renda/caixa; patrimônio com ativos menos passivos.
- Empréstimos concedidos/recebidos, principal pendente, juros informados separadamente e pagamentos parciais.
- Assistente local por regras e consultas, comparações mensais, simulação e lançamento limitado de receita/despesa com prévia editável e confirmação.
- Navegação móvel compacta e módulos carregados sob demanda; nome centralizado também no manifesto e fuso público configurável.

Banco elevado de v1 para v2 com migração que preserva as compras antigas como uma parcela. Recibos e chaves de idempotência não são reescritos. Migração, conflito durante restauração e rollback de lote/backup têm testes.

Verificação da etapa 8: 95 testes de domínio/persistência/interface aprovados, tipagem e build. Fluxos novos de compra parcelada/compartilhada, contribuição, backup criptografado, CSV, metas, recorrência e assistente passaram no Chromium desktop e viewport móvel. A rodada anterior de navegador encontrou ambiguidade entre dois estados de carregamento; foi adicionada identificação acessível ao estado de armazenamento e o cenário original voltou a passar. Os testes de produção comprovaram manifesto, CSP, precache, recarga e salvamento offline.

Limitações mantidas explícitas no app e README: estornos/renegociações, anexos, OFX/XLSX, subcategorias e conciliação não implementados; sem amortização automática, custo médio/fiscal de investimentos, cotação online, sincronização ou Open Finance. Esses recursos não são simulados ou declarados prontos. Na entrega da etapa 8, a revisão de segurança e a preparação para distribuição ainda eram as etapas 9 e 10.

Validação de entrega: 95 testes de domínio/persistência/interface, 20 cenários completos de navegação e quatro cenários de produção aprovados (offline, PDF e exclusão, em desktop/viewport móvel), com tipagem e build. Nenhum dado de teste foi inserido no perfil pessoal do aplicativo.

Auditoria da etapa 8: `npm audit --audit-level=moderate` retornou zero vulnerabilidades conhecidas. O sandbox bloqueou inicialmente portas locais e o endpoint npm; os testes/auditoria foram concluídos pelo fluxo autorizado de execução fora dessa restrição, sem desativar TLS ou verificações. Não há bloqueio externo remanescente para o escopo local entregue.

## Continuação autorizada — etapas 9 e 10

Após a entrega até a etapa 8, o usuário autorizou continuar sem exigir intervenção dele. A continuação abrangeu a revisão de segurança/validação e a preparação do aplicativo local para uso. A autorização não exige contratar hospedagem ou integrar serviços remotos.

## Etapa 9 — segurança, recuperação e validação

- A tela de falha de leitura agora oferece recuperação por backup, mesmo quando o estado existente é inconsistente. O backup é validado antes de qualquer gravação; há prévia, cópia de diagnóstico legível e confirmação da substituição.
- A recuperação compara o snapshot bruto com o da prévia, recusa alterações concorrentes/banco já válido e faz rollback completo se a escrita falhar. Não apaga o banco para contornar erros e não promete recuperar armazenamento inacessível ou dados removidos.
- Ausência de Web Crypto passa a informar a exigência de HTTPS/localhost e suporte, sem confundir o problema com senha errada ou falha de armazenamento. Não há exportação sem criptografia silenciosa.
- A atualização da PWA preserva um modal aberto quando a troca do controlador é recebida por outra aba. A recarga fica disponível como ação explícita depois de salvar/fechar o formulário.
- O pedido de armazenamento persistente informa quando a API não é oferecida pelo navegador.
- Regressões adicionais cobrem recuperação/rollback/conflito e ausência de Web Crypto. No Chromium real, incluem nomes importados com HTML como texto, diagnóstico, confirmação e preservação do formulário em uma notificação de atualização.

A primeira rodada de regressão após a extração da leitura para recuperação encontrou `PrematureCommitError` ao iniciar testes avançados com IndexedDB nativo. Corrigida a composição da leitura para encadear promessas do Dexie e preservar o contexto transacional. Os erros do helper de dados sintéticos agora expõem nome/mensagem para diagnóstico. Os quatro fluxos avançados passaram na verificação direcionada; a entrega exige também a rodada completa registrada abaixo.

## Etapa 10 — preparação para uso

Versão 0.8.0 no pacote e lockfile, mostrada pela configuração central na interface. Textos de apresentação e a página Sobre o projeto refletem as funções disponíveis e as limitações locais.

Criado `INSTALACAO-E-MANUTENCAO.md`: execução, primeiros passos, origens/perfis, build estático, HTTPS, cabeçalhos de hospedagem, cache, atualização, backup, rollback e diagnóstico. README, guia de uso, portabilidade, arquitetura e segurança atualizados. O build está preparado para servir na raiz de uma origem; nenhum domínio público ou serviço remoto foi publicado automaticamente.

Permanecem explícitas as limitações: banco local sem criptografia/autenticação, ausência de sincronização/Open Finance e recursos financeiros avançados ainda não implementados. Revisão interna e auditoria de dependências não equivalem a auditoria externa nem a validação em todos os navegadores/dispositivos.

## Validação final da versão 0.8.0

- `npm run check`: 98 testes aprovados, tipagem e build aprovados.
- `npm run test:browser`: 20 testes aprovados, incluindo compra compartilhada/parcelada, contribuição, backup/CSV, planejamento/assistente, recarga, idempotência e duas abas.
- `npm exec -- playwright test --config playwright.production.config.ts`: 10 testes aprovados contra o build final, nos projetos desktop e viewport móvel. Mesma configuração usada por `npm run test:pwa`, sem repetir o build já validado.
- `npm audit --audit-level=moderate`: zero vulnerabilidades conhecidas.
- Total: 128 testes na rodada final. Capturas da recuperação conferidas visualmente; teste de largura confirma ausência de rolagem horizontal nessa tela.
- Pacote `releases/dexfin-0.8.0-web.tar.gz` e checksum SHA-256 gerados. Os 17 arquivos foram comparados byte a byte com o build e as licenças; não incluem fontes, configurações privadas, dados sintéticos ou registros do navegador. Checksum verificado com sucesso.

A falha transacional encontrada durante esta revisão foi corrigida antes da rodada final; nenhum teste permanece falhando. Testes e verificações não alteraram o perfil pessoal do aplicativo. As limitações documentadas continuam válidas: o resultado é uma aplicação pessoal local, sem sincronização e sem autenticação/criptografia do IndexedDB.

## Evolução após as dez etapas — estorno de correção, versão 0.9.0

Ao continuar o projeto, o usuário escolheu a prioridade **Corrigir lançamentos com estorno e histórico preservado**. Implementado o estorno integral de receitas, despesas e transferências registradas por engano, com prévia dos saldos, motivo e confirmação. O original permanece intacto e ligado ao ajuste inverso. Para registrar os dados corretos, o usuário cria uma nova movimentação revisada.

A correção usa a mesma data financeira do original para anular seu efeito no período, mantendo o instante de criação para indicar quando foi registrada. Histórico, relatório e busca mostram o vínculo e identificam o original estornado. O formulário permite consultar o motivo pelos dois registros. Não há alteração financeira no registro original nem estorno de estorno.

Contribuições sugeridas/reservadas da receita são canceladas, com `cancelledById` apontando para o ajuste e liberação das reservas correspondentes. Contribuições pagas continuam como despesa e a prévia explica esse efeito. Uma previsão realizada fica identificada como realização estornada e permanece encerrada; não é gerada/confirmada novamente. Contas precisam estar ativas, e reservas de metas devem continuar cobertas. Saldo devedor pode ser revelado pela retirada de uma renda incorreta.

O comando é transacional e idempotente. A integridade exige um único estorno por original, mesma data e inversão exata de valores, referências e categorias, inclusive ao importar backup. As migrações v1/v2→v3 preservam dados e acrescentam o índice `operations.relatedId`. Backups novos usam envelope v3 estrito; o leitor aceita v2 e adapta estados legados. Versões antigas do app não leem os novos estornos/backups: manter backup anterior antes de atualizar e avaliar compatibilidade para qualquer retorno de versão.

Arquivos centrais: `domain/model.ts`, `engine.ts`, `integrity.ts`, `queries.ts`; `application/reversal-preview.ts` e `finance-view.ts`; `features/finance/ReversalForm.tsx`, histórico, contribuições, planejamento e relatórios. Casos de domínio em `domain/reversal.test.ts`, concorrência/rollback em `infrastructure/database.test.ts`, migrações históricas em `migration.test.ts`, portabilidade e fluxos reais em `tests/production/reversal.spec.ts`. Guias e avisos antigos sobre previsões/dashboard indisponíveis foram atualizados.

Validação executada:

- 113 testes unitários/de integração/interface, com tipagem e build aprovados.
- 20 testes de navegação/regressão no Chromium desktop e viewport móvel, aprovados.
- 18 testes de produção, aprovados. Incluem confirmação/cancelamento, vínculo, relatório/orçamento, restauração com estorno, contribuições pagas/pendentes, previsão encerrada, outra aba com formulário aberto e reserva sem cobertura, além de offline/recuperação/PDF/exclusão já existentes.
- Total: 151 testes na entrega. Capturas do formulário de estorno conferidas em desktop e viewport móvel; ausência de rolagem horizontal validada.
- `npm audit --audit-level=moderate`: zero vulnerabilidades conhecidas; nenhuma dependência adicionada.
- Pacote `releases/dexfin-0.9.0-web.tar.gz` e checksum SHA-256 gerados e verificados. Os 17 arquivos correspondem ao build e às licenças, sem dados financeiros. O pacote 0.8.0 foi preservado.

Limites desta evolução: correção integral de registros incorretos de receita/despesa/transferência. Devolução comercial, estorno parcial, compra de cartão, pagamento de fatura/reembolso/contribuição, empréstimos, investimentos e saldo inicial continuam sem estorno específico. Uma receita nova registrada após a correção segue as regras vigentes de contribuição, sem compensar automaticamente pagamentos da receita anterior. Detalhes e orientações estão em USO.md e INSTALACAO-E-MANUTENCAO.md.

## Publicação solicitada no GitHub — versão 0.9.1

O usuário autorizou publicar no repositório `raimundo-yuri/anyx` para testar no computador e no celular. A entrega inclui o código-fonte e o fluxo `.github/workflows/pages.yml`, que usa ações oficiais fixadas por SHA, Node 24, instalação com lockfile, testes e build com a base do GitHub Pages.

Manifesto, ícones, registro/escopo do service worker, lista de precache e fallback offline passaram a respeitar a base do build. O cache estático recebe um namespace por caminho e o worker ignora requisições fora de sua base. O indicador de atualização é limpo quando não há worker aguardando. O build padrão continua funcionando na raiz; `/anyx/` é validado para o Pages.

Validação local antes da publicação: 113 testes unitários/de integração/interface, 20 fluxos de navegador, 18 testes de produção e dois testes específicos do caminho do Pages, todos aprovados (153 no total). Tipagem e builds da raiz e de `/anyx/` passaram. O teste de Pages inclui manifesto, escopo, assets, recarga e gravação offline em desktop/viewport móvel.

Os arquivos de publicação incluem somente o site e as licenças; não publicam o IndexedDB do usuário, backups, diagnósticos, configurações privadas ou resultados dos testes. O uso em dispositivos diferentes continua sem sincronização. Repositórios no mesmo domínio GitHub Pages compartilham origem; essa limitação está descrita no guia. O status de publicação pode ser acompanhado em GitHub → Actions.

### Resultado do envio e configuração externa pendente

O código foi enviado com sucesso para `main` no GitHub (commit inicial de publicação `45853f1`). A execução remota instalou as dependências e aprovou os testes; parou ao consultar o Pages porque o site ainda não está habilitado. A tentativa de ativar pela API retornou `403 Resource not accessible by integration`; a integração não dispõe das permissões de ativação inicial exigidas pelo GitHub.

Ação do proprietário: Settings → Pages → Build and deployment → Source → GitHub Actions. Depois reexecutar o fluxo de publicação em Actions, ou retomar a conversa para concluir a execução e verificar o endereço público. Código publicado não significa que o site já esteja no ar. O endereço previsto é `https://raimundo-yuri.github.io/anyx/`; ele só deve ser informado como disponível após publicação e verificação.

## Ativação do Pages concluída pelo proprietário

O proprietário ativou a publicação e informou que já conseguia usar o app. A consulta posterior confirmou `build_type: workflow`, HTTPS e execução `40046522110` concluída com sucesso no commit `1588070`. O endereço `https://raimundo-yuri.github.io/anyx/` respondeu com HTTP 200. A restrição anterior de ativação inicial está resolvida; novos envios para `main` usam a automação existente.

## Evolução gratuita — versão 0.10.0

O usuário autorizou continuar as etapas gratuitas e as atualizações de versão/publicação. Não foram adicionados serviços pagos, dependências, credenciais ou sincronização. O desenvolvimento ocorre durante as rodadas de trabalho; a automação de Pages publica os commits enviados, mas não desenvolve funcionalidades em segundo plano.

### Etapa 12 — importação OFX bancária

Parser local de OFX XML/SGML para uma conta bancária BRL, com suporte a UTF-8/Windows-1252, limites de 20 MiB/5.000 transações e leitura exata de centavos/datas civis. Recusa DTD/entidades externas, correções OFX, câmbio, cartão/investimento e estruturas não suportadas. A interface exige correspondência da conta, classificação de receitas/despesas ou descarte explícito, prévia e confirmação. PIX/transferências e destinos de conta/cartão ficam pendentes de revisão individual. O lote é atômico e idempotente por conta DexFin + FITID; conflitos e equivalência com registros manuais/CSV não são resolvidos por adivinhação.

### Etapa 13 — conferência manual de saldo

Cada conta oferece **Conferir saldo**, com data de corte e saldo do extrato, inclusive negativo. A consulta calcula o caixa, a diferença em centavos e as movimentações correspondentes, considerando transferências e estornos. Não altera o banco, não cria ajuste e não conecta ao banco do usuário. Os testes comparam todo o snapshot antes e depois da conferência.

### Etapa 14 — subcategorias e agrupamento de orçamentos

Categorias recebem `parentId` opcional, criação de subcategoria e organização com prévia/confirmação. Validação impede ciclos, natureza incompatível e categoria ativa sob grupo arquivado. IDs e lançamentos são preservados ao mover um grupo; o usuário é informado da reinterpretação do histórico. Orçamentos agregam descendentes sem duplicar lançamentos, enquanto o dashboard mantém a distribuição direta. Seletores, relatórios e assistente usam o caminho completo; nomes ambíguos no assistente são recusados.

### Etapa 15 — lembretes de backup

Lembretes locais configuráveis de 7/14/30 dias, com adiamento de 24 horas e detecção de alterações no estado completo. A marca registra somente **download solicitado**, sem afirmar que o arquivo foi salvo ou que existe uma cópia recuperável. Configuração guarda data e assinatura, sem nomes, lançamentos ou senha. Falha desse armazenamento não bloqueia o aplicativo. Restauração reinicia o acompanhamento sem fingir novo backup; exclusão financeira limpa a marca, preservando preferências. Avisos não aparecem no relatório impresso.

### Migração e validação

Esquema IndexedDB 4 adiciona o índice de grupo das categorias, sem novas tabelas financeiras. Migrações dos esquemas 1/2/3 preservam histórico e recibos idempotentes. Backups novos têm envelope v4; leitura de v2/v3 permanece, com validação explícita das compras legadas antes de derivar parcelas. O envelope criptografado permanece v1. Código antigo não deve ser recolocado sobre um banco atualizado sem avaliar compatibilidade.

- `npm run check`: 167 testes aprovados, TypeScript e build aprovados.
- `npm run test:browser`: 20 testes aprovados em Chromium desktop e viewport móvel.
- `npm exec -- playwright test --config playwright.production.config.ts`: 30 testes aprovados; inclui os novos fluxos e as regressões de offline, recuperação, impressão e estornos.
- `npm run test:pages`: dois testes aprovados no caminho `/anyx/`, com recarga e escrita offline.
- Total: 219 testes aprovados. Capturas de conferência/importação foram inspecionadas; os fluxos novos verificam a largura da tela móvel. Não equivale a teste em dispositivo físico ou em todos os navegadores.
- `npm audit --audit-level=moderate`: zero vulnerabilidades conhecidas. Nenhuma dependência adicionada.

Estorno comercial de cartão continua sem implementação. O plano `PLANO-ESTORNOS-CARTAO.md` especifica devolução compartilhada, crédito em cartão e valores a devolver a terceiros antes de expor qualquer ação financeira. Isso evita tratar devolução como renda ou apagar reembolsos já recebidos.


## Etapa 16 — devoluções comerciais de cartão, versão 0.11.0

O usuário autorizou continuar as melhorias gratuitas e publicar as versões. Implementadas devoluções integrais/parciais de compras já creditadas pelo emissor, com rateio explícito por divisão, data efetiva, motivo, prévia calculada pelo motor e confirmação. Não são correções de digitação na data original. Compra, divisões, parcelas, pagamentos e reembolsos originais são preservados.

O crédito reduz a fatura escolhida do mesmo cartão até zero; excedente vira ativo separado com o emissor. A utilização em outra fatura é explícita, com prévia e confirmação, sem fabricar caixa. A parte pessoal reduz consumo na data efetiva; a de terceiros reduz recebíveis e reconhece obrigação de devolver o excesso já recebido. O pagamento posterior à pessoa usa conta ativa, preserva reservas e não cria outra despesa.

`purchaseRefunds` e `refundAllocations` são adicionadas no esquema IndexedDB 5. Operações e ledgers próprios vinculam crédito no cartão e passivo por recebível. A integridade confere alocações, referências, limites acumulados, entradas exatas e saldos por corte diário. Estorno anterior a movimentos já registrados do cartão/divisões selecionadas é recusado para evitar reescrever a classificação de pagamentos; eventos do mesmo dia são agrupados. Aplicação de crédito e devolução à pessoa precisam de cobertura na data e no saldo atual.

`executeReviewed` compara o estado completo dentro da mesma transação que confirma o comando. Alteração por outra aba exige nova prévia, mesmo quando a operação ainda caberia no limite. Idempotência, concorrência entre conexões e falha de escrita nas alocações foram exercitadas sem gravação parcial.

Pessoas distingue dinheiro recebido, cancelamento e devolução realizada. O cronograma reduz as últimas parcelas e aplica pagamentos FIFO ao valor ajustado, sem renomear cancelamento como pagamento. Faturas distinguem pagamentos, devoluções e créditos aplicados. Dashboard, orçamento, patrimônio, planejamento, assistente, relatório e CSV reconhecem os novos ativos/passivos e consumo mensal assinado. O disponível permanece caixa menos reservas, com obrigações de devolução informadas separadamente; a projeção conservadora as desconta. Crédito no cartão nunca entra como dinheiro em conta.

Backups novos usam envelope v5 estrito, preservando leitura v2/v3/v4 e envelope criptografado v1. Migrações de bancos 1/2/3/4 preservam histórico e idempotência. Versões antigas não devem ser usadas sobre o banco atualizado sem avaliar compatibilidade. Guias de uso, portabilidade, manutenção, arquitetura, segurança e modelo foram atualizados; o plano anterior agora identifica o fluxo efetivamente implementado.

### Validação da entrega

- `npm run check`: 188 testes aprovados, tipagem e build aprovados.
- `npm run test:browser`: 20 cenários aprovados em desktop e viewport móvel.
- Regressão completa de produção: 36 testes aprovados, incluindo os seis cenários novos de devolução/crédito/pessoa, consumo negativo e prévia invalidada por outra aba.
- `npm run test:pages`: dois testes aprovados no caminho `/anyx/`, incluindo gravação offline.
- Total da regressão: 246 testes distintos aprovados. Depois do ajuste de foco/rolagem para a prévia, build e os seis fluxos novos foram novamente aprovados.
- `npm audit --audit-level=moderate`: zero vulnerabilidades conhecidas; nenhuma dependência ou serviço pago adicionado.
- A primeira execução da interface encontrou ordem instável das divisões ao ler os UUIDs do IndexedDB. A tela agora ordena parte própria e pessoas de forma estável; o cálculo continua vinculado ao ID exato da divisão. Os testes finais passaram após a correção. Captura móvel foi inspecionada; a prévia recebe foco para ser encontrada sem procurar no formulário longo.

Limites: crédito comercial efetivo no cartão. Cancelamento simples de parcelas, crédito direto em banco, contestação, juros/tarifas, correção de uma devolução comercial incorreta e sincronização entre dispositivos seguem sem implementação. O resultado não equivale a teste em todos os navegadores/dispositivos físicos ou auditoria externa. Não houve acesso ao perfil financeiro pessoal do usuário.


## Etapa 17 — agenda e central de pendências, versão 0.12.0

O usuário autorizou continuar as melhorias gratuitas e publicações. A nova seção reúne pendentes atuais de faturas, previsões abertas, reembolsos e seus planos, principal de empréstimos, metas e contribuições. Dashboard e assistente usam a mesma consulta. Não gera ocorrências recorrentes, confirma pagamentos/recebimentos nem reabre previsões encerradas ou com realização estornada.

A central mostra todos os meses, com contadores de datas ultrapassadas, itens para hoje e itens sem data. Oferece filtros por tipo/situação/texto, calendário mensal a partir de segunda-feira, seleção de dia, paginação de 20 itens e navegação ao módulo de origem. Metas, sugestões e entradas esperadas são identificadas separadamente, sem total que as confunda com dívida ou caixa. Datas de compra/recebimento não viram vencimentos fictícios.

Os valores são os saldos pendentes atuais nas datas prometidas; escolher mês passado não faz reconstrução contábil nem ressuscita itens quitados depois. O cronograma de reembolso usa os pagamentos/cancelamentos já validados na versão anterior, sem duplicar recebível. Valor a devolver a pessoa permanece sem data quando não há promessa. A referência civil considera o fuso do app e é revista ao retomar a aba e em intervalos de um minuto.

## Etapa 18 — exportação iCalendar

Download local .ics com todos os itens datados da seleção (inclusive outras páginas), limitado a 5.000 eventos. Itens sem prazo ficam fora, com quantidade informada. Eventos de dia inteiro mantêm datas civis, UID estável, DTSTAMP UTC e textos escapados/dobrados por octetos UTF-8. Não há convidados, convite por e-mail, conta externa ou conexão de calendário. Lembrete DISPLAY de um dia antes é opcional e limitado a datas futuras.

O arquivo é uma cópia, sem atualização/cancelamento automático. A tela explica que importar/reimportar e executar lembretes depende do cliente, pode gerar duplicatas e não confirma fatos financeiros. Descrições/valores estão legíveis; o usuário escolhe onde guardar/importar. Não é backup. A exportação lê um snapshot atual e não altera operações, reservas ou recibos; comparação do estado inteiro antes/depois foi exercitada em navegador real.

Esquema local 5 e envelope de backup v5 mantidos, sem migração nem dependências novas. Guias de uso, arquitetura, privacidade, portabilidade e manutenção refletem a entrega.

### Validação da versão 0.12.0

- `npm run check`: 213 testes aprovados, tipagem e build aprovados.
- `npm run test:browser`: 20 fluxos aprovados em desktop e viewport móvel.
- Regressão completa de produção: 44 testes aprovados, incluindo oito novos cenários de agenda vazia/bissexta, fontes/filtros/ICS/estado preservado, pagamento em outra aba, recarga offline, exportação de todas as páginas e referência ao retomar no dia seguinte.
- `npm run test:pages`: dois testes aprovados no caminho `/anyx/`, com manifesto, cache e escrita offline.
- Total: 279 testes distintos aprovados. Captura móvel do calendário inspecionada; largura da tela validada. Não equivale a validação em aparelho físico ou em todos os clientes de calendário.
- `npm audit --audit-level=moderate`: zero vulnerabilidades conhecidas. Nenhuma dependência ou serviço pago adicionado.

O primeiro teste de navegador foi impedido por um falso diagnóstico de porta ocupada: o proxy do shell recebia as requisições de checagem de localhost, apesar de não existir processo ouvindo. A configuração do Playwright agora preserva o proxy externo e as exceções herdadas, acrescentando exceções apenas de loopback nos processos de teste. Nenhum serviço foi interrompido e não houve alteração da rede do aplicativo publicado. Na primeira rodada da interface, um localizador por texto de label não identificou o select; a seleção passou a usar o papel/nome acessível do controle. A regressão final acima foi executada depois das correções, sem falhas.

Limites: agenda de pendências atuais, não extrato histórico; sem sincronização entre aparelhos ou calendários, push em segundo plano, Open Finance, XLSX, anexos ou amortização automática. A aplicação permanece local e o arquivo .ics não substitui um backup financeiro protegido.


## Etapa 18 — correção de pagamentos e devoluções, versão 0.13.0

A prioridade escolhida pelo proprietário para a conclusão do beta foi atendida: estorno integral de pagamentos de fatura, reembolsos, devoluções comerciais, utilização de crédito e dinheiro devolvido a pessoas. A correção mantém operações, lançamentos, rateios e recibos originais, cria entradas exatamente inversas na mesma data financeira e não fabrica receita ou consumo. As consultas descontam registros corrigidos sem apagá-los; cronogramas reabrem o valor correspondente.

A prévia mostra efeitos em caixa, fatura, crédito e direitos/obrigações com pessoas, exige motivo e confirmação e compara o estado revisado na gravação. O domínio bloqueia dependências sem cobertura: corrigir um crédito já utilizado requer revisar primeiro os registros dependentes que também estiverem errados. Não autoriza desfazer um fato real para liberar outro. Compra original, contribuição paga, saldo inicial, empréstimos e investimentos ainda não admitem o fluxo.

Esquema local 6 preserva dados dos esquemas 1–5 e fecha clientes antigos. Envelope de backup 6 preserva leitura 2–5 e recusa ocultar as novas correções sob formato antigo. Envelope criptografado segue em 1. Banco financeiro pessoal do usuário não foi acessado.

## Etapa 19 — preparação Vercel, autenticação e sincronização, versão 0.13.0

O proprietário solicitou explicitamente uso sincronizado entre tablet e PC do trabalho, com login e segurança de servidor, e informou já ter conta Vercel. O modo cloud usa funções Node.js da Vercel como API da mesma origem e Supabase para Auth/PostgreSQL. O modo local/GitHub Pages continua independente, com IndexedDB e offline. A Vercel recusa o build local; sem variáveis válidas a API bloqueia o acesso, sem enviar dados locais ou recuar para IndexedDB.

Login é restrito a um UUID proprietário com e-mail confirmado. Tokens do provedor ficam em cookie AES-GCM autenticado, HttpOnly/Secure/SameSite Strict, com limite absoluto de oito horas e registro revogável no banco. O cliente guarda CSRF somente em memória. Escritas verificam origem, JSON/cabeçalho de cliente, CSRF e identidade real no provedor. Logout atual/global e recuperação por código revogam sessões; fatores MFA já verificados são recusados enquanto não houver desafio implementado, evitando liberação somente por senha. Cadastro público deve ser desativado no painel.

A chave privilegiada fica apenas no servidor, em cliente separado do Auth. SQL cria RLS e revoga tabelas/RPCs de anon/authenticated. O servidor aplica o domínio validado e confirma por revisão atômica mais sessão ativa; conflitos são reavaliados e prévias desatualizadas exigem revisão. Limites iniciais: estado 2 MiB, lote 100 comandos e requisição 3 MiB. Lote inteiro é confirmado ou recusado. O navegador não persiste base financeira/tokens em IndexedDB/localStorage/cache; mantém snapshot em memória e consulta revisão a cada 20 segundos quando visível, ao retomar e manualmente. Offline bloqueia dados e não enfileira gravações. Logout offline usa marcador local sem dados financeiros para completar a revogação ao reconectar.

`vercel.json`, SQL, exemplo de variáveis sem credenciais e [guia de configuração/migração/aceitação](VERCEL-E-SUPABASE.md) estão prontos. Recursos estáticos incluem licenças de distribuição nos dois builds. Dependências adicionadas: SDK oficial Supabase no servidor, PGlite e tsx somente para desenvolvimento/testes. Nenhuma chave real foi incluída ou solicitada na conversa.

### Validação da versão 0.13.0

- 244 testes de domínio, persistência, migrações, interface, API, contrato do SDK e SQL aprovados. O SQL foi executado em PostgreSQL via PGlite, incluindo bloqueio de acesso direto, revisão, revogação e limite de tentativas.
- 20 testes de interface com IndexedDB nativo, desktop e viewport móvel, aprovados.
- 48 testes distintos de produção local aprovados, incluindo quatro casos novos de correções financeiras; os testes de estorno/offline foram repetidos após ajuste de um seletor que exigia texto exato em um elemento com detalhes adicionais. Não houve perda de registros nesse diagnóstico.
- 10 testes de nuvem, desktop/móvel, aprovados: autenticação, sessão protegida, duas sessões independentes compartilhando registros, logout atual/global, tentativa de reutilizar cookie revogado, reconexão e recuperação. Provedor Auth e armazenamento desses cenários são simulados; passam pelo servidor e motor reais do aplicativo.
- 2 testes do caminho GitHub Pages e offline aprovados. Total: 324 testes distintos aprovados.
- TypeScript e builds local, /anyx/ e cloud aprovados; npm audit sem vulnerabilidades conhecidas. Captura móvel do modo nuvem inspecionada. Os bundles públicos foram verificados para ausência de nomes de variáveis secretas, SDK Supabase e credenciais fictícias de teste.

### Pendências externas para concluir o beta na nuvem

Não há projeto Supabase ou implantação Vercel configurados por este ambiente. O proprietário precisa criar o projeto gratuito, executar o SQL, criar/confirmar seu usuário, desativar cadastro público, inserir variáveis somente no painel Vercel e importar o repositório. Recuperação depende do template numérico e da entrega real de e-mail, sujeita às restrições do remetente gratuito. Nenhuma contratação foi feita.

A aceitação final exige conferir HTTPS/cabeçalhos, autenticação, e-mail e sincronização no domínio real com PC/tablet, além de migrar uma única vez o backup. Não se afirma teste em aparelhos físicos, todos os navegadores, auditoria externa, criptografia de ponta a ponta ou backup remoto automático. A preparação de código não equivale à publicação real na Vercel. O objetivo aprovado de nuvem está registrado e passa a orientar as próximas versões.
