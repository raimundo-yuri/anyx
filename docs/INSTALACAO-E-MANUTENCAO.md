# Instalação, primeiros passos e manutenção — 0.11.0

O DexFin está preparado para uso pessoal local no navegador. A publicação no GitHub Pages já está ativa em https://raimundo-yuri.github.io/anyx/ para computador e celular. Não há nova ativação a cada versão. Não há cadastro externo, serviço pago ou credencial bancária a configurar. O ambiente de desenvolvimento já preparado pode continuar sendo usado; publicar configurações desse ambiente não publica o aplicativo nem transfere os registros do navegador.

## Executar em outro computador

Requisitos: Node.js 24 LTS, npm e navegador moderno com IndexedDB e Web Crypto. A validação automatizada foi feita no Chromium em desktop e viewport móvel; Safari, Firefox e dispositivos físicos ainda precisam de validação própria.

Na pasta do repositório:

```sh
npm ci
npm run dev
```

O desenvolvimento usa a porta 5173, sem cache offline. O comando escuta todas as interfaces para atender ao ambiente de nuvem. Em um computador pessoal, limite o acesso com `npm run dev -- --host 127.0.0.1`. Não exponha o servidor de desenvolvimento diretamente à internet.

Para validar a versão instalável:

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

O preview usa a porta 4173 e serve o conteúdo de `dist/`; é uma ferramenta de validação. Abrir `dist/index.html` diretamente pelo explorador de arquivos não oferece a origem HTTP necessária à aplicação. A PWA exige HTTPS ou localhost. O Node é necessário para construir/servir localmente, não para executar o aplicativo em uma hospedagem estática.

Não é necessário criar `.env` para usar os padrões. Para personalizar, copie `.env.example` para `.env`, ajuste apenas o nome e um fuso IANA válido e gere outro build. Variáveis `VITE_` são públicas; nunca inclua segredos nelas. A versão mostrada na interface vem do `package.json`.

## Começar a usar

1. Abra **Contas e saldos** e cadastre sua primeira conta com o saldo real e a data de abertura. Não use o limite do cartão como saldo.
2. Em **Categorias e fontes**, crie seus cadastros ou use **Adicionar sugestões**. Isso não cria renda ou movimentações.
3. Registre uma receita/despesa real em **Movimentações**; para cartão, use **Cartões e faturas**. Confira os saldos e recarregue a página para verificar a persistência.
4. Faça um backup com senha em **Relatórios e backup**. Guarde o arquivo e a senha em locais protegidos e teste a restauração em outro perfil do navegador.

Se registrar uma receita, despesa ou transferência por engano, use **Movimentações → Estornar**, revise os efeitos e confirme com um motivo. Depois registre os dados corretos, se necessário. O original permanece no histórico.

A atualização para 0.11 usa esquema local 5 e backups v5, preservando leitura de backups v2/v3/v4. Faça um backup antes de atualizar e feche formulários/abas antigas; versões anteriores não entendem as novas devoluções comerciais ou o esquema novo. Não retorne código antigo sobre um banco atualizado sem avaliar compatibilidade.

O [guia de uso](USO.md) explica contribuições, parcelas, recebíveis, previsões, metas, empréstimos e investimentos. A tela inicial fica vazia até você cadastrar dados reais.

Mantenha a mesma origem e perfil: protocolo, domínio e porta identificam o armazenamento. Desenvolvimento, preview e hospedagem são origens diferentes. A migração entre elas usa backup/restauração. Instalar a PWA não cria uma cópia remota; limpar os dados do site pode apagar também os registros usados pela aplicação instalada.

## Usar a publicação no GitHub Pages

Abra https://raimundo-yuri.github.io/anyx/ no navegador. O GitHub Pages já foi ativado pelo proprietário; envios para `main` executam testes/build e publicam automaticamente. Se precisar repetir uma publicação válida, use **Actions → Publicar DexFin no GitHub Pages → Run workflow** com a branch `main`. Uma execução só deve ser considerada publicada quando concluir com sucesso e o endereço tiver sido verificado. Para Android, use a opção de instalar o app oferecida pelo navegador; no Safari do iPhone, Compartilhar → Adicionar à Tela de Início. O site pode ser testado sem instalação. Aguarde a indicação de disponibilidade offline antes de testar sem rede.

O fluxo `.github/workflows/pages.yml` é acionado por envios para `main` ou manualmente em GitHub → Actions. Ele usa Node 24, `npm ci`, os testes, o build com o caminho do Pages e o artefato estático. Credenciais temporárias de publicação são fornecidas pelo GitHub; nenhum segredo é incorporado ao app.

Os dados continuam em cada navegador, separados entre computador e celular. Caminhos diferentes dentro do mesmo domínio GitHub Pages compartilham a origem e o IndexedDB; evite executar outros apps não confiáveis nesse domínio. Use backup/restauração para transferir registros conscientemente entre perfis.

## Hospedar a versão estática

O build em `dist/` está pronto para uma hospedagem estática com HTTPS, na raiz do domínio (`/`) por padrão. Copie todos os arquivos e subdiretórios, incluindo `sw.js`, manifesto e ícones. Para um subdiretório, gere com `npm run build -- --base=/caminho/`. O GitHub Pages usa `/anyx/`; o manifesto, os ícones, o escopo do service worker e o precache acompanham a base escolhida.

Não envie `node_modules`, `.env`, fontes, backups ou diagnósticos para a pasta pública. A hospedagem não precisa receber nem armazenar seus registros financeiros. A publicação deste repositório é feita pelo fluxo do GitHub Pages, autorizado pelo proprietário. Outros provedores podem receber o mesmo build estático com a base adequada.

Configure estes cabeçalhos na hospedagem:

| Resposta | Cabeçalho recomendado |
| --- | --- |
| Todas | `X-Content-Type-Options: nosniff` |
| Todas | `Referrer-Policy: no-referrer` |
| Todas | `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| HTML | `Content-Security-Policy` abaixo |
| `/`, `/index.html`, `/sw.js`, manifesto e ícones | `Cache-Control: no-cache` |
| `/assets/` com nomes contendo hash | `Cache-Control: public, max-age=31536000, immutable` |

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

A CSP já existe no HTML do build; a diretiva `frame-ancestors` só funciona por cabeçalho HTTP. O estilo inline é necessário aos gráficos/indicadores atuais. Não injete scripts de analytics/widgets nem desative a CSP para contornar uma falha. Manifesto deve usar tipo JSON apropriado; `sw.js` deve ser JavaScript da mesma origem. Arquivos inexistentes em `/assets/` e `/sw.js` devem retornar erro real, não HTML com status 200.

Antes de substituir a versão publicada, envie todos os novos assets; mantenha os assets antigos durante a transição de abas. Depois atualize HTML, manifesto e service worker de forma consistente. Nunca sobrescreva um asset com hash reutilizando seu nome para conteúdo diferente.

Após a publicação, valide HTTPS, cabeçalhos, instalação, navegação, recarga offline e gravação num perfil de teste vazio. As configurações de cabeçalho dependem do provedor. O GitHub Pages serve o build com a CSP em HTML; cabeçalhos personalizados não são configurados por esse fluxo.

## Atualização e backup

1. Exporte um backup e confirme que consegue abri-lo em outro perfil antes de atualizar código ou esquema do banco.
2. Use `npm ci` com o lockfile revisado. Atualize `docs/LICENCAS-TERCEIROS.txt` a partir das licenças/avisos das bibliotecas incluídas no site ao mudar dependências. Não aplique `npm audit fix --force` automaticamente.
3. Execute os comandos de validação abaixo. Migrações precisam de um teste com a versão anterior; nunca apague o banco para fazer uma migração passar.
4. Gere e distribua o novo `dist/`. Confira a versão em **Sobre o projeto**/cabeçalho e o funcionamento no destino.
5. Na PWA, salve ou feche formulários em todas as abas antes de **Aplicar atualização**. Uma aba que receber a atualização enquanto tem um modal aberto mantém o preenchimento e oferece **Recarregar aplicação** depois de fechá-lo.

Não volte cegamente para código antigo após uma migração: ele pode não entender o esquema novo. Preserve os arquivos de backup e a versão anterior; avalie compatibilidade do esquema e, se necessário, restaure um backup compatível em um perfil separado. Restaurar um arquivo antigo substitui dados mais novos.

## Verificar uma entrega

```sh
npm run check
npm run test:browser
npm run test:pwa
npm run test:pages
npm audit --audit-level=moderate
```

Os testes usam dados sintéticos em bancos/perfis isolados. Os runners precisam das portas locais 5174, 4174 e 4175 livres e de Chromium. Consulte o README para a configuração do executável neste ambiente. Falhas não autorizam apagar o perfil pessoal ou desligar TLS/verificações de dependências.

Para distribuir um arquivo no ambiente Linux, após validar o build:

```sh
mkdir -p releases
tar -czf releases/dexfin-0.11.0-web.tar.gz -C dist . -C .. LICENSE docs/LICENCAS-TERCEIROS.txt
(cd releases && sha256sum dexfin-0.11.0-web.tar.gz > dexfin-0.11.0-web.tar.gz.sha256)
(cd releases && sha256sum -c dexfin-0.11.0-web.tar.gz.sha256)
```

O arquivo contém o site estático e as licenças de distribuição, sem incluir o IndexedDB do navegador. O checksum detecta alterações em relação ao arquivo original recebido; sozinho não autentica a origem. Preserve também o código-fonte/lockfile da versão para manutenção.

## Se algo falhar

- **Erro ao salvar:** mantenha os campos e tente novamente sem alterá-los. A mesma ação conserva sua chave de idempotência enquanto o formulário está aberto.
- **Erro ao carregar:** use **Tentar novamente**. Não limpe o site. Se o banco estiver inconsistente e você tiver um backup, use **Abrir recuperação de dados**. O processo permite baixar a cópia de diagnóstico antes da substituição confirmada e recarrega a aplicação após concluir.
- **Armazenamento inacessível ou bloqueado:** a recuperação também depende de conseguir ler/gravar o IndexedDB. Corrija a disponibilidade do navegador/dispositivo antes de tentar restaurar; sem backup não existe recuperação garantida.
- **Web Crypto indisponível:** acesse por HTTPS ou localhost em um navegador compatível. Senha incorreta exige a senha original do backup; ela não pode ser recuperada pelo aplicativo.
- **Offline indisponível:** conecte-se e aguarde a indicação de disponibilidade offline antes de testar sem rede. Isso não substitui backup.

Ao relatar um problema, informe versão, navegador, ação e mensagem observada. Não publique backups, senhas, diagnósticos ou histórico financeiro em issues. A cópia de diagnóstico contém dados legíveis e pode estar inconsistente; ela não deve ser importada como backup comum.

## Atualizações e responsabilidades

O desenvolvimento, os testes, o incremento de versão e o envio ao GitHub podem ser realizados nas rodadas desta conversa dentro do escopo autorizado. O fluxo do Pages publica o commit depois que suas verificações passam. Isso não implica trabalho de desenvolvimento em segundo plano após encerrar uma rodada.

O usuário mantém suas cópias de backup, confere os lançamentos reais e aplica a atualização da PWA quando o navegador oferecer o botão, com formulários salvos/fechados. Uma nova configuração ou permissão exclusiva da conta pode exigir intervenção pontual; não é necessário reconfirmar cada melhoria gratuita já autorizada. O site pode ser instalado pelo navegador sem Play Store e sem taxa de cadastro de loja.
