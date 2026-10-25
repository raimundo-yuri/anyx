# DexFin na Vercel, com login e sincronização

O código da versão 0.13 está preparado para a Vercel e um projeto Supabase dedicado. A publicação na Vercel e a configuração real do Supabase ainda dependem dos passos abaixo na conta do proprietário. Os testes automatizados usam dados fictícios; não comprovam entrega de e-mail ou funcionamento de um projeto que ainda não foi configurado.

Você já tem Vercel. Comece pelo Supabase: [criar conta e projeto](https://supabase.com/dashboard). Escolha o plano gratuito e uma região próxima. Os serviços gratuitos têm limites e podem mudar suas condições ou pausar projetos; não há garantia de disponibilidade. Não é necessário contratar domínio, loja de aplicativos ou API paga para este fluxo pessoal.

## 1. Criar o banco

No projeto Supabase, abra **SQL Editor**, crie uma consulta, cole o conteúdo completo de [001_cloud.sql](../supabase/001_cloud.sql) e execute. Use um projeto dedicado ao DexFin. O script cria as tabelas e funções, ativa RLS e impede acesso direto pelos papéis públicos e de usuários autenticados. Somente o servidor do DexFin acessa essas tabelas.

Guarde a senha do banco em seu gerenciador de senhas. Ela não é a senha de login do aplicativo e não precisa ser informada no código ou nesta conversa.

## 2. Criar seu acesso

Em **Authentication → Users → Add user**, crie seu usuário com e-mail e uma senha exclusiva e forte, de pelo menos 12 caracteres. Se a tela oferecer **Auto Confirm User**, ative para este usuário criado pelo administrador. Caso contrário, conclua a confirmação antes de usar o app. Copie o **User UID/ID** desse usuário; será o `DEXFIN_OWNER_ID`.

Em **Authentication → Sign In / Providers**, mantenha o acesso por e-mail/senha e desative **Allow new users to sign up**. Os nomes dos menus podem variar. Não há cadastro público no DexFin, e o servidor aceita apenas o ID configurado, com e-mail confirmado. Criar outra conta no Supabase não libera os registros.

Proteja também as contas administrativas da Vercel, Supabase e GitHub com autenticação em duas etapas. Isso é separado do login do DexFin. Esta versão do app ainda não oferece cadastro/desafio MFA: se houver um fator verificado no usuário do **aplicativo**, o acesso é recusado, inclusive a recuperação, para não ignorar esse fator. Não desative MFA de uma conta já protegida para contornar isso; use um usuário dedicado ao app ou aguarde suporte ao desafio.

## 3. Separar as configurações do servidor

Em **Project Settings → API / API Keys**, obtenha o endereço do projeto, a chave **publishable** e a chave **secret**. Projetos com chaves legadas podem usar `anon` e `service_role`, respectivamente. A chave secret/service_role tem acesso privilegiado: mantenha-a apenas nas variáveis do servidor da Vercel, nunca em `VITE_`, GitHub, screenshots ou conversa.

As variáveis necessárias são:

| Nome na Vercel | Valor |
| --- | --- |
| `APP_ORIGIN` | Endereço HTTPS estável da produção, como `https://seu-projeto.vercel.app`, sem caminho |
| `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable ou anon do projeto |
| `SUPABASE_SECRET_KEY` | Chave secret ou service_role do projeto |
| `DEXFIN_OWNER_ID` | UUID do usuário criado no passo 2 |
| `SESSION_SECRET` | Segredo aleatório de 32 bytes, codificado em base64url |
| `VITE_TIME_ZONE` (opcional) | Fuso compartilhado; padrão `America/Sao_Paulo` |

Gere `SESSION_SECRET` **no seu próprio computador**, com Node.js instalado, e copie o resultado diretamente para a Vercel:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Não envie o resultado aqui. A saída tem 43 caracteres. Guarde uma cópia segura; trocá-lo invalida os cookies existentes. Nunca reutilize o exemplo de um tutorial. [server/.env.example](../server/.env.example) mostra apenas os nomes e placeholders; não contém chaves válidas. `VITE_` é sempre público. Não crie uma variável VITE para senha, chave ou token.

## 4. Importar o repositório na Vercel

Na Vercel, use **Add New → Project → Import Git Repository → raimundo-yuri/anyx**. Selecione `main`, diretório raiz do repositório e Node.js 24. O [vercel.json](../vercel.json) define o build `npm run build:cloud`, a saída `dist` e as funções `/api/auth` e `/api/finance`.

Adicione as variáveis no escopo **Production**. Não compartilhe as chaves de produção com Preview/Development; um preview precisa de projeto e origem próprios. Não habilite listagem de diretórios nem remova as políticas de segurança fornecidas.

Se ainda não souber o domínio definitivo, faça um primeiro deploy para descobrir o endereço estável do projeto. Sem configuração completa o app mostra o bloqueio de configuração e não libera dados. Depois defina `APP_ORIGIN` com o domínio de produção, confira as outras variáveis e use **Redeploy**. Alterar variáveis exige novo deploy. Evite URLs de deploy que mudam a cada commit; entre sempre pelo mesmo domínio estável nos dois dispositivos.

O build padrão local é recusado quando `VERCEL=1`. Isso evita publicar por engano uma versão sem autenticação nessa hospedagem. GitHub Pages continua usando o modo local, com dados independentes.

## 5. Configurar e testar recuperação de senha

Em **Authentication → Email Templates → Reset Password**, inclua o código numérico `{{ .Token }}` no corpo do e-mail. O DexFin pede esse código no formulário; ele não consome links de recuperação nem guarda tokens na URL. Ajuste o **Site URL** para o mesmo domínio de produção. Mantenha a expiração curta do código e os limites de envio do provedor.

O remetente padrão do Supabase tem restrições de destinatário e envio; ele pode atender somente endereços autorizados da equipe. Para uso pessoal, confira se seu e-mail é permitido e faça um teste real. Não há SMTP externo configurado pelo repositório. Caso precise de um provedor de e-mail, avalie limites e custo antes de habilitar; nenhuma contratação foi feita.

Entre, peça recuperação, confira o código, defina a nova senha e verifique que a sessão antiga em outro navegador foi encerrada. Só considere a recuperação pronta após receber o e-mail real. A primeira entrada com o usuário administrativo já confirmado não depende desse envio.

## 6. Levar seus dados e usar os dois aparelhos

1. No navegador onde estão seus registros atuais do GitHub Pages, abra **Relatórios e backup** e baixe um backup, preferencialmente com senha. Guarde esse arquivo antes da migração.
2. Abra o domínio da Vercel, entre com sua conta e restaure esse backup **uma vez**, revisando a prévia. A restauração substitui a base compartilhada de todos os dispositivos. Dados locais não são enviados automaticamente e não são mesclados.
3. No tablet, abra exatamente o mesmo endereço da Vercel e entre com a mesma conta. Use **Atualizar dados** ou aguarde a consulta automática, feita a cada 20 segundos enquanto a tela está visível e ao retomar a aba.
4. Faça um lançamento pequeno de teste e confira no outro dispositivo. Se estiver incorreto, use o fluxo de correção apropriado, preservando o histórico. Confirme backup e restauração em um projeto/perfil de teste antes de depender exclusivamente da nuvem.

No modo nuvem é preciso conexão. A PWA pode guardar os arquivos da interface, mas não salva registros financeiros em IndexedDB, localStorage ou cache do service worker. A base fica somente na memória da página enquanto aberta; sem rede a tela financeira é bloqueada. Não há fila offline. Se uma gravação falhar, mantenha os campos e tente novamente: a mesma chave evita duplicação quando a resposta se perde após a gravação. Fechar/recarregar perde o rascunho e essa chave.

Conflitos de gravação são reavaliados no servidor; uma prévia ou restauração desatualizada exige nova revisão. A interface não oferece edição simultânea de um mesmo rascunho. Limites iniciais da nuvem: base JSON de 2 MiB e até 100 comandos por lote de importação, confirmado integralmente. Arquivos locais maiores ainda podem ser lidos, mas a base/lote incompatível é recusado sem gravação parcial. Não divida automaticamente um lote cuja revisão foi recusada.

## Uso no computador do trabalho

Use apenas se permitido pelo trabalho. Ao terminar, acione **Sair deste dispositivo**. **Privacidade → Encerrar sessões em todos os dispositivos** revoga todas as sessões do app; em caso de perda de aparelho, entre em outro e use essa opção. A sessão tem duração máxima de oito horas, mesmo com renovação do token do provedor.

Se sair sem conexão, a tela é fechada imediatamente e o aplicativo pede reconexão para concluir a revogação no servidor. Até isso acontecer ou a sessão expirar, o cookie ainda pode ser válido; não interprete a tela fechada como confirmação de revogação. Um marcador local sem dados financeiros permite repetir essa saída antes de carregar a base.

Arquivos baixados (backup, CSV, PDF, .ics) continuam na pasta de downloads após sair. Proteja-os e remova cópias desnecessárias de máquinas compartilhadas. O navegador, extensões, sistema e administradores da máquina ainda podem observar uma sessão em uso; o app não oferece proteção contra quem controla o computador.

## Segurança e limites operacionais

O navegador usa somente a API da própria Vercel. Credenciais Supabase e tokens de acesso/renovação ficam no servidor ou em cookie autenticado e criptografado, HttpOnly, Secure e SameSite Strict. Requisições de escrita verificam origem e CSRF. O servidor confirma o usuário no provedor, restringe o ID do proprietário e valida novamente o motor financeiro; o banco aplica revisão atômica e validade da sessão.

Isso não é criptografia de ponta a ponta: o servidor e as contas administrativas têm acesso aos registros. O Supabase é a fonte compartilhada; o repositório não implementa backup automático externo nem recuperação ponto a ponto. Continue fazendo backups protegidos. Evite registrar corpos de requisições, cookies ou variáveis secretas nos logs da hospedagem. Não publique esses dados ao pedir suporte.

O modo nuvem é uma base pessoal com snapshots completos; não é uma solução comercial multiusuário nem tem garantia de operação em grandes volumes. Não há Open Finance, senha bancária ou integração automática com bancos. O arquivo .ics continua sendo uma cópia de agenda, independente da sincronização financeira.

## Verificação após o deploy

- O endereço abre com HTTPS, apresenta login e não mostra registros antes de entrar.
- As variáveis ficam apenas no servidor; não existe chave privilegiada em arquivo JS público ou variável `VITE_`.
- Sem login, `/api/finance` responde 401; respostas da API são privadas e não são guardadas no cache.
- O SQL foi executado, o cadastro público está desativado e apenas o usuário proprietário entra.
- PC e tablet consultam a mesma base; sair de todos invalida a outra sessão.
- Recuperação de senha envia o código real e encerra sessões anteriores.
- Backup protegido é baixado e sua senha é guardada fora do aplicativo.

Os testes locais verificam esses contratos de código com provedor simulado e PostgreSQL real via PGlite; os itens dependentes da infraestrutura precisam desta verificação na sua conta. Você pode compartilhar **somente o endereço público da Vercel** para conferirmos a página e os cabeçalhos. Senhas, chaves e códigos de recuperação ficam com você.

## Se aparecer um erro

**“O acesso na nuvem ainda não foi configurado”**: confira todas as variáveis de Production, origem HTTPS exata, segredo com 43 caracteres e redeploy. **“Outra origem recusada”**: abra o domínio que está em `APP_ORIGIN`; aliases e previews não são aceitos automaticamente. **“Não foi possível acessar os dados”**: confira SQL, projeto ativo e chave de servidor, sem limpar o banco. **“Os dados mudaram”**: atualize e revise a prévia. **“Sem conexão”**: reconecte e repita os mesmos campos. Nunca apague tabelas ou o projeto para tentar corrigir um erro.
