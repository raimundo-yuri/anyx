# DexFin

Gestão financeira pessoal em português, com modos local e nuvem, valores em centavos e regras contábeis independentes da interface. Versão 0.13.1 (corrige o carregamento dos módulos do servidor na Vercel): acrescenta o modo nuvem para Vercel/Supabase, com login restrito, sincronização e estornos de pagamentos/reembolsos/devoluções. Mantém o modo local, agenda, OFX, subcategorias e backups. A infraestrutura externa ainda precisa ser configurada pelo proprietário. Recursos ainda ausentes estão listados explicitamente.

## Publicar na Vercel e sincronizar PC/tablet

Siga [Vercel e Supabase](docs/VERCEL-E-SUPABASE.md). O código inclui API de servidor, login por e-mail/senha, recuperação por código, sessões revogáveis e banco compartilhado. O proprietário precisa criar um projeto gratuito Supabase e inserir as configurações no painel Vercel; nenhuma chave deve ser enviada na conversa ou colocada no frontend. Sem configuração o acesso é bloqueado.

Na nuvem, conexão é necessária para consultar/salvar; não há base financeira persistente no navegador nem fila offline. Dois dispositivos da mesma conta consultam a mesma base, com atualização automática a cada 20 segundos enquanto visível, ao retomar a aba ou por **Atualizar dados**. Restauração e exclusão afetam a base compartilhada. A versão é pessoal, limitada inicialmente a 2 MiB de dados e 100 comandos por lote. Não há criptografia de ponta a ponta ou backup remoto automático. A implantação real e o envio de e-mail precisam ser conferidos no projeto do proprietário.

## Testar o modo local no computador ou celular

[Abrir o DexFin](https://raimundo-yuri.github.io/anyx/), publicado no GitHub Pages com HTTPS. Os próximos envios para `main` executam os testes e atualizam o site pelo fluxo já ativado. Os registros ficam no perfil do navegador de cada dispositivo; não há sincronização automática. Para instalar, use a opção do navegador de adicionar o site à tela inicial.

## O que funciona

- Contas, instituições manuais, categorias e subcategorias por grupos da mesma natureza; receitas recebidas, despesas e transferências.
- Conferência manual de saldo com extrato por data de corte, sem criar ajustes financeiros automáticos.
- OFX bancário BRL (XML/SGML), com conta e classificação explícitas, prévia, confirmação, deduplicação por FITID e lote atômico.
- Estorno integral de receitas, despesas, transferências, pagamentos de fatura, reembolsos, devoluções comerciais, aplicação de crédito e devoluções a pessoas quando registrados por engano, com motivo, prévia, confirmação e histórico vinculado. O ajuste corrige o período original; contribuições pendentes são canceladas e pagamentos realizados preservados.
- Cartões, ciclos de fatura, compras pessoais/compartilhadas, parcelas e primeira fatura configurável.
- Devolução comercial por divisão, redução de fatura e crédito excedente no cartão; aplicação explícita desse crédito e devolução do dinheiro já recebido de terceiros.
- Pessoas, valores a receber, plano independente de reembolso e pagamentos parciais, sem duplicar consumo/renda.
- Dashboard com cinco indicadores, gráficos SVG acessíveis, categorias, evolução mensal, vencimentos e recebíveis reais.
- Contribuições por fonte, percentual em pontos-base, sugestão/reserva, ajuste, cancelamento e pagamento.
- Agenda com faturas, previsões, reembolsos, empréstimos, metas e contribuições; filtros, datas ultrapassadas, itens sem data e acesso ao módulo de origem.
- Exportação iCalendar (.ics) da seleção, com lembrete opcional para eventos futuros; arquivo local sem sincronização ou confirmação financeira.
- Orçamentos por categoria/mês, metas com reserva de caixa, previsões e recorrências mensais geradas explicitamente.
- Investimentos manuais (aporte, resgate e avaliação), patrimônio e empréstimos com principal e juros separados.
- Assistente local com consultas estruturadas, simulação conservadora e lançamento de receita/despesa com prévia e confirmação.
- CSV relacionável, importador CSV DexFin com mapeamento/prévia/deduplicação e relatório imprimível para salvar como PDF.
- Backup JSON restaurável, opção de AES-GCM com senha, substituição atômica com confirmação e exclusão explícita dos dados locais. Lembretes configuráveis consideram a última solicitação de download e mudanças posteriores; não fazem backup automático.
- PWA de produção: manifesto, ícones, cache de recursos estáticos e atualização manual; operações offline no modo local após a primeira carga completa.

O banco começa vazio, sem contas ou saldos fictícios. Categorias e fontes sugeridas só são adicionadas ao acionar **Adicionar sugestões**; cadastrar uma fonte não confirma renda. O modo local não envia dados ao servidor. No modo nuvem, Vercel e Supabase processam autenticação e registros. Não há analytics, conexão bancária, API paga ou IA externa.

## Executar

Node.js 24 LTS e npm. Use `nvm use` se utilizar nvm. O cache npm fica em `.npm-cache/`, ignorado pelo Git.

```sh
npm ci
npm run dev
```

Desenvolvimento: porta 5173, sem service worker para evitar código antigo em cache. O script padrão escuta em todas as interfaces para o ambiente de nuvem; execute em rede confiável. Para limitar ao computador local: `npm run dev -- --host 127.0.0.1`.

Para experimentar a PWA/offline no build de produção:

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

Preview usa porta 4173. Não é hospedagem de produção. Instalação e service worker exigem HTTPS ou localhost; use o botão de instalação quando oferecido, ou o menu de instalação do navegador. Os dados são separados por origem/perfil: mudar porta, domínio ou perfil não transfere o IndexedDB. Use backup/restauração para levar os registros a outra origem.

Configuração pública: nome em `src/config/app.ts`, padrão em `src/config/identity.ts`; `.env.example` contém `VITE_APP_NAME` e `VITE_TIME_ZONE`. Variáveis `VITE_` são incorporadas ao frontend e **não podem conter segredos**. O nome também é aplicado ao manifesto no build. Use um fuso IANA válido, como `America/Sao_Paulo`.

## Validar

```sh
npm run check        # testes de domínio, persistência/interface, TypeScript e build
npm run test:browser # fluxos de interface no Chromium desktop e viewport móvel
npm run test:pwa     # build + testes de produção, incluindo operação offline
npm run test:cloud   # API local de teste + login, revogação e duas sessões, desktop/móvel
npm run test:pages   # build e offline no caminho /anyx/, desktop e viewport móvel
npm audit            # vulnerabilidades conhecidas; não é garantia de segurança
```

Os runners iniciam/encerram seus próprios servidores em loopback, nas portas 5174, 4174, 4175 e 4186. Mantenha-as livres. Neste ambiente, usam `/usr/bin/chromium`; alternativamente configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou instale o navegador gerenciado com `npx playwright install chromium` quando a rede permitir. Um sandbox que bloqueie portas/processos exige a autorização da plataforma para esses testes; não desative TLS ou a verificação de dependências.

Os testes usam bancos/contextos isolados e dados sintéticos, sem semear a instalação pessoal. Não equivalem a testes em Android físico, Safari ou Firefox. O build gera `dist/`, manifesto e service worker, com bibliotecas e seções divididas em chunks.

Em shells com proxy, a configuração do Playwright preserva o proxy externo e acrescenta exceções apenas para localhost/loopback nos processos de teste. Isso evita que a checagem do servidor Vite seja encaminhada ao proxy e confundida com uma porta já ocupada; não altera a rede do aplicativo publicado.

## Publicação no GitHub Pages

O fluxo [.github/workflows/pages.yml](.github/workflows/pages.yml) valida os testes, gera o build com a base informada pelo Pages e publica os arquivos estáticos após cada envio para `main`. As ações oficiais estão fixadas por SHA. Não há credencial no código do app; o fluxo usa o token temporário do próprio GitHub.

Para validar localmente o subdiretório do projeto: `npm run test:pages`. O build normal continua disponível para a raiz de uma hospedagem. Manifesto, ícones, service worker e precache respeitam a base; cada caminho usa seu próprio namespace de cache.

## Dados locais, privacidade e recuperação

No modo local: banco IndexedDB `dexfin`, esquema 6, com migrações testadas a partir dos esquemas 1, 2, 3, 4 e 5. Nunca excluir/recriar o banco para contornar um erro. Operações relacionadas são atômicas; a chave da mesma ação é preservada durante a retentativa sem alterar campos. Rascunhos de formulário não sobrevivem a fechar/recarregar a página.

**IndexedDB não é criptografado.** Quem controla o perfil/dispositivo pode acessar os dados. O backup com senha usa PBKDF2-SHA-256 e AES-GCM; a senha não é salva. Perder a senha impede recuperar o arquivo. Backup sem senha contém dados legíveis. Exportar/publicar o ambiente de desenvolvimento não é backup dos registros do navegador.

Limpar o site ou perder o dispositivo pode remover o banco. Faça backups e teste a restauração em um perfil separado. A restauração substitui todos os dados após prévia e confirmação, recusando a operação se o banco mudou desde a prévia. Se um estado inconsistente bloquear a tela normal, **Abrir recuperação de dados** permite validar um backup e preservar uma cópia de diagnóstico antes da troca confirmada. Armazenamento inacessível ainda precisa ser restabelecido. Backups novos usam envelope v6; o leitor mantém compatibilidade com v2/v3/v4/v5. Subcategorias exigem v4; devoluções comerciais exigem v5 e suas correções/pagamentos corrigidos exigem v6. Versões anteriores à 0.13 não entendem todas as novas correções ou o esquema 6; guarde um backup antes de atualizar e avalie compatibilidade antes de retornar o código. Arquivos até 20 MiB; CSV até 5.000 linhas. Consulte [backup e Power BI](docs/PORTABILIDADE.md).

## Limitações explícitas

A sincronização remota exige o modo nuvem configurado; sem Open Finance; sem coleta de senhas bancárias. XLSX e anexos/comprovantes ainda não estão implementados. OFX aceita o subconjunto bancário BRL documentado; a conferência manual compara saldos e não salva sessões nem cria ajustes. Não há conciliação automática com bancos. A correção de receita/despesa/transferência usa estorno integral e um novo lançamento revisado; não há edição financeira no registro original. Devoluções comerciais de compras no cartão são aceitas no fluxo de crédito documentado, inclusive parciais. Cancelamento simples de parcelas, crédito direto em banco, contestação, correção de compras originais, contribuições, empréstimos/investimentos e renegociações permanecem pendentes. Cadastros têm edição/arquivamento; o histórico financeiro é preservado.

Recorrências geram previsões por ação manual, sem cron em segundo plano. Projeções são cenários incertos e não reconhecem automaticamente registros diferentes do mesmo compromisso; não duplique uma obrigação como fatura/previsão/reserva. Empréstimos têm principal e juros informados no pagamento, sem amortização automática. Investimentos são manuais, sem cotações ou controle fiscal/custo médio; a avaliação não cria caixa e um rendimento recebido não deve ser registrado também como resgate do mesmo valor.

A agenda usa os pendentes atuais nas datas cadastradas, inclusive quando você consulta um mês passado; não é uma reconstrução contábil naquela data. Metas, entradas esperadas e pagamentos aparecem identificados, sem uma soma que os confunda. O arquivo .ics é uma cópia local com até 5.000 itens datados da seleção e não sincroniza alterações/cancelamentos. Importação, atualização e lembretes dependem do calendário escolhido; itens sem prazo não recebem data fictícia. Exportar a agenda não substitui backup nem confirma fatos financeiros.

O assistente interpreta formatos limitados e exige nomes exatos e confirmação. Não é um modelo de linguagem nem decide compras por você. Os adaptadores CSV/OFX não afirmam compatibilidade universal com bancos; importações de cartão/investimentos, correções OFX e câmbio não são suportadas. A deduplicação de OFX não adivinha equivalência com registros manuais/CSV. PDF usa a impressão do navegador. A validação completa do histórico favorece integridade, mas pode ser lenta com bancos grandes; medir antes de ampliar o volume de importação.

## Documentação

- [Instalação, primeiros passos e manutenção](docs/INSTALACAO-E-MANUTENCAO.md), incluindo distribuição estática e atualização.
- [Licença do projeto](LICENSE) e [avisos das bibliotecas distribuídas](docs/LICENCAS-TERCEIROS.txt).
- [Como usar](docs/USO.md), [progresso e etapas](docs/PROGRESSO.md).
- [Arquitetura](docs/ARQUITETURA.md), [modelo de dados](docs/MODELO-DE-DADOS.md), [regras financeiras](docs/REGRAS-FINANCEIRAS.md).
- [Backup, CSV e Power BI](docs/PORTABILIDADE.md), [segurança](docs/SEGURANCA.md).
- [Plano original](docs/PLANO.md), [especificação](docs/ESPECIFICACAO.md) e [modelo e limites das devoluções comerciais de cartão](docs/PLANO-ESTORNOS-CARTAO.md).

Dependências exatas e lockfile preservados. Use `npm ci`; revise `npm outdated` e `npm audit`. Atualizações principais e migrações exigem testes, build e backup; não aplicar correções forçadas automaticamente.
