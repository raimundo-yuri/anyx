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
