# DexFin

Gestão financeira pessoal em português, com persistência local, valores em centavos e regras contábeis independentes da interface. Versão 0.10.0: acrescenta subcategorias, importação OFX bancária, conferência manual de saldo e lembretes de backup, mantendo os estornos de correção e o funcionamento local/offline. Recursos ainda ausentes estão listados explicitamente.

## Testar no computador ou celular

[Abrir o DexFin](https://raimundo-yuri.github.io/anyx/), publicado no GitHub Pages com HTTPS. Os próximos envios para `main` executam os testes e atualizam o site pelo fluxo já ativado. Os registros ficam no perfil do navegador de cada dispositivo; não há sincronização automática. Para instalar, use a opção do navegador de adicionar o site à tela inicial.

## O que funciona

- Contas, instituições manuais, categorias e subcategorias por grupos da mesma natureza; receitas recebidas, despesas e transferências.
- Conferência manual de saldo com extrato por data de corte, sem criar ajustes financeiros automáticos.
- OFX bancário BRL (XML/SGML), com conta e classificação explícitas, prévia, confirmação, deduplicação por FITID e lote atômico.
- Estorno integral desses lançamentos quando registrados por engano, com motivo, prévia, confirmação e histórico vinculado. O ajuste corrige o período original; contribuições pendentes são canceladas e pagamentos realizados preservados.
- Cartões, ciclos de fatura, compras pessoais/compartilhadas, parcelas e primeira fatura configurável.
- Pessoas, valores a receber, plano independente de reembolso e pagamentos parciais, sem duplicar consumo/renda.
- Dashboard com cinco indicadores, gráficos SVG acessíveis, categorias, evolução mensal, vencimentos e recebíveis reais.
- Contribuições por fonte, percentual em pontos-base, sugestão/reserva, ajuste, cancelamento e pagamento.
- Orçamentos por categoria/mês, metas com reserva de caixa, previsões e recorrências mensais geradas explicitamente.
- Investimentos manuais (aporte, resgate e avaliação), patrimônio e empréstimos com principal e juros separados.
- Assistente local com consultas estruturadas, simulação conservadora e lançamento de receita/despesa com prévia e confirmação.
- CSV relacionável, importador CSV DexFin com mapeamento/prévia/deduplicação e relatório imprimível para salvar como PDF.
- Backup JSON restaurável, opção de AES-GCM com senha, substituição atômica com confirmação e exclusão explícita dos dados locais. Lembretes configuráveis consideram a última solicitação de download e mudanças posteriores; não fazem backup automático.
- PWA de produção: manifesto, ícones, cache de recursos estáticos, atualização manual e operação offline após a primeira carga completa.

O banco começa vazio, sem contas ou saldos fictícios. Categorias e fontes sugeridas só são adicionadas ao acionar **Adicionar sugestões**; cadastrar uma fonte não confirma renda. Não há backend, analytics, conexão bancária, API paga ou IA externa.

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
npm run test:pages   # build e offline no caminho /anyx/, desktop e viewport móvel
npm audit            # vulnerabilidades conhecidas; não é garantia de segurança
```

Os runners iniciam/encerram seus próprios servidores em loopback, nas portas 5174, 4174 e 4175. Mantenha-as livres. Neste ambiente, usam `/usr/bin/chromium`; alternativamente configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou instale o navegador gerenciado com `npx playwright install chromium` quando a rede permitir. Um sandbox que bloqueie portas/processos exige a autorização da plataforma para esses testes; não desative TLS ou a verificação de dependências.

Os testes usam bancos/contextos isolados e dados sintéticos, sem semear a instalação pessoal. Não equivalem a testes em Android físico, Safari ou Firefox. O build gera `dist/`, manifesto e service worker, com bibliotecas e seções divididas em chunks.

## Publicação no GitHub Pages

O fluxo [.github/workflows/pages.yml](.github/workflows/pages.yml) valida os testes, gera o build com a base informada pelo Pages e publica os arquivos estáticos após cada envio para `main`. As ações oficiais estão fixadas por SHA. Não há credencial no código do app; o fluxo usa o token temporário do próprio GitHub.

Para validar localmente o subdiretório do projeto: `npm run test:pages`. O build normal continua disponível para a raiz de uma hospedagem. Manifesto, ícones, service worker e precache respeitam a base; cada caminho usa seu próprio namespace de cache.

## Dados, privacidade e recuperação

Banco IndexedDB `dexfin`, esquema 4, com migrações testadas a partir dos esquemas 1, 2 e 3. Nunca excluir/recriar o banco para contornar um erro. Operações relacionadas são atômicas; a chave da mesma ação é preservada durante a retentativa sem alterar campos. Rascunhos de formulário não sobrevivem a fechar/recarregar a página.

**IndexedDB não é criptografado.** Quem controla o perfil/dispositivo pode acessar os dados. O backup com senha usa PBKDF2-SHA-256 e AES-GCM; a senha não é salva. Perder a senha impede recuperar o arquivo. Backup sem senha contém dados legíveis. Exportar/publicar o ambiente de desenvolvimento não é backup dos registros do navegador.

Limpar o site ou perder o dispositivo pode remover o banco. Faça backups e teste a restauração em um perfil separado. A restauração substitui todos os dados após prévia e confirmação, recusando a operação se o banco mudou desde a prévia. Se um estado inconsistente bloquear a tela normal, **Abrir recuperação de dados** permite validar um backup e preservar uma cópia de diagnóstico antes da troca confirmada. Armazenamento inacessível ainda precisa ser restabelecido. Backups novos usam envelope v4; o leitor mantém compatibilidade com v2/v3. Subcategorias exigem v4. Versões antigas não entendem o novo esquema; guarde um backup antes de atualizar e avalie compatibilidade antes de retornar o código. Arquivos até 20 MiB; CSV até 5.000 linhas. Consulte [backup e Power BI](docs/PORTABILIDADE.md).

## Limitações explícitas

Sem sincronização remota ou Open Finance; sem coleta de senhas bancárias. XLSX e anexos/comprovantes ainda não estão implementados. OFX aceita o subconjunto bancário BRL documentado; a conferência manual compara saldos e não salva sessões nem cria ajustes. Não há conciliação automática com bancos. A correção de receita/despesa/transferência usa estorno integral e um novo lançamento revisado; não há edição financeira no registro original. Estornos parciais/comerciais, estornos de cartão, pagamentos, empréstimos ou investimentos e renegociações permanecem pendentes. Cadastros têm edição/arquivamento; o histórico financeiro é preservado.

Recorrências geram previsões por ação manual, sem cron em segundo plano. Projeções são cenários incertos e não reconhecem automaticamente registros diferentes do mesmo compromisso; não duplique uma obrigação como fatura/previsão/reserva. Empréstimos têm principal e juros informados no pagamento, sem amortização automática. Investimentos são manuais, sem cotações ou controle fiscal/custo médio; a avaliação não cria caixa e um rendimento recebido não deve ser registrado também como resgate do mesmo valor.

O assistente interpreta formatos limitados e exige nomes exatos e confirmação. Não é um modelo de linguagem nem decide compras por você. Os adaptadores CSV/OFX não afirmam compatibilidade universal com bancos; importações de cartão/investimentos, correções OFX e câmbio não são suportadas. A deduplicação de OFX não adivinha equivalência com registros manuais/CSV. PDF usa a impressão do navegador. A validação completa do histórico favorece integridade, mas pode ser lenta com bancos grandes; medir antes de ampliar o volume de importação.

## Documentação

- [Instalação, primeiros passos e manutenção](docs/INSTALACAO-E-MANUTENCAO.md), incluindo distribuição estática e atualização.
- [Licença do projeto](LICENSE) e [avisos das bibliotecas distribuídas](docs/LICENCAS-TERCEIROS.txt).
- [Como usar](docs/USO.md), [progresso e etapas](docs/PROGRESSO.md).
- [Arquitetura](docs/ARQUITETURA.md), [modelo de dados](docs/MODELO-DE-DADOS.md), [regras financeiras](docs/REGRAS-FINANCEIRAS.md).
- [Backup, CSV e Power BI](docs/PORTABILIDADE.md), [segurança](docs/SEGURANCA.md).
- [Plano original](docs/PLANO.md), [especificação](docs/ESPECIFICACAO.md) e [plano de estornos comerciais de cartão, ainda não implementado](docs/PLANO-ESTORNOS-CARTAO.md).

Dependências exatas e lockfile preservados. Use `npm ci`; revise `npm outdated` e `npm audit`. Atualizações principais e migrações exigem testes, build e backup; não aplicar correções forçadas automaticamente.
