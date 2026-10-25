# Segurança e privacidade — revisão interna da versão 0.13.0

## Autenticação e nuvem — versão 0.13

Existem dois modos. No build local/GitHub Pages, os controles locais abaixo continuam aplicáveis: IndexedDB legível pelo perfil, sem autenticação. No build cloud/Vercel, a base compartilhada fica no Supabase e a interface exige uma sessão verificada pelo servidor. Não há fallback local quando o servidor/configuração falha. O envio à nuvem foi solicitado pelo proprietário; não há migração automática dos registros antigos.

| Ameaça na nuvem | Controle implementado | Limite |
| --- | --- | --- |
| Acesso sem login ou por outra conta | `getUser` no provedor a cada solicitação, proprietário por UUID e e-mail confirmado | Conta pessoal; cadastro público deve ser desativado no painel |
| Roubo de tokens pelo armazenamento JS | Tokens em cookie AES-GCM autenticado, HttpOnly/Secure/SameSite Strict; segredo somente servidor | XSS ainda pode agir enquanto a sessão está aberta |
| CSRF/origem externa | Origem exata, JSON/cabeçalho de cliente e token CSRF ligado à sessão | Origem/servidor/extensões comprometidos continuam sendo risco |
| Força bruta | Contadores persistentes globais e por endereço HMAC, janela de 15 minutos e limites do Auth | Abuso pode temporariamente bloquear o proprietário; não é proteção distribuída comercial |
| Cookie antigo após logout | Registro revogável, conferido antes do acesso e no commit SQL; oito horas máximas | Logout offline só é revogado ao reconectar ou expirar |
| Acesso direto ao banco pelo navegador | RLS e REVOKE para anon/authenticated em tabelas e RPCs | Chave de serviço e administradores têm privilégio; proteger os painéis |
| Perda de atualização entre dispositivos | Comparação atômica de revisão; prévias/restauração verificam hash; recibos idempotentes | Sem mesclagem arbitrária ou fila offline |
| Dados remanescentes no PC compartilhado | Estado financeiro somente em memória, cache somente de assets, API no-store | Downloads e uma sessão em uso ainda podem ser observados pelo dispositivo |
| Redefinição de senha | Código de recuperação Supabase, senha mínima de 12 caracteres e revogação antes de alterar | Entrega real e template precisam ser testados pelo proprietário |
| MFA ignorado após habilitação externa | Identidade com fator verificado é recusada, inclusive para recuperação | Desafio/cadastro MFA no app ainda não implementado; MFA administrativo é independente |

As credenciais Supabase não têm prefixo VITE e não são enviadas no bundle. Os clientes Auth e banco são separados para que login não substitua a autorização privilegiada do banco. Mensagens internas do provedor são sanitizadas; não adicionar logs de senha, corpo financeiro, cookies ou variáveis. Configuração inválida falha fechada, com 503. Limites: requisição 3 MiB, estado 2 MiB, lote 100 comandos. O motor valida relações e partidas novamente no servidor antes da gravação.

Não há criptografia de ponta a ponta: Vercel/Supabase e administradores podem acessar o estado. O app não cria backups remotos automáticos. São testes internos de código, provedor simulado e permissões PostgreSQL; não equivalem a auditoria externa ou validação do projeto real ainda não configurado. Consulte [configuração, migração e aceitação da publicação](VERCEL-E-SUPABASE.md).

## Agenda e exportação de vencimentos

A agenda é consulta de pendências atuais, sem comandos de liquidação ou geração implícita de ocorrências. O download .ics lê um snapshot coerente e não altera operações, valores, reservas ou recibos. Um teste compara o estado financeiro inteiro antes e depois da navegação/exportação. Valores sem vencimento permanecem sem data; metas e entradas incertas não são anunciadas como despesa ou caixa.

O arquivo .ics contém descrições e valores legíveis. Não usa a senha do backup, não cria conta de calendário e não envia registros à rede. Ao importar em outro aplicativo, o usuário escolhe onde esses dados serão armazenados. O exportador escapa quebras de linha e delimitadores para impedir injeção de propriedades/eventos e dobra linhas por octetos UTF-8. IDs/datas/volume são validados; não há convidados, convites ou organizadores. Alarmes de exibição só são incluídos quando solicitados e para datas futuras.

O arquivo é uma cópia: não registra pagamentos e não atualiza ou remove eventos previamente importados. Datas/valores desatualizados no calendário externo precisam de conferência manual. Não há garantia de lembrete em segundo plano ou interoperabilidade já testada em todos os aplicativos de calendário. Essa limitação é mostrada na tela antes do download.

## Ameaças e controles

| Ativo / ameaça | Controle implementado | Risco residual |
| --- | --- | --- |
| Registros / gravação parcial | Zod, integridade referencial/contábil e transações atômicas | Bugs e falhas físicas do dispositivo |
| Pendentes / ações duplicadas ou concorrentes | Recibo persistente de idempotência e serialização IndexedDB | Chaves diferentes são ações distintas; rascunhos se perdem com recarga |
| Dados / acesso ao perfil ou dispositivo | Sem envio externo; avisos claros sobre armazenamento | IndexedDB não é criptografado nem protegido por autenticação |
| Interface / XSS | React sem HTML arbitrário, dados validados e CSP no build | Extensões maliciosas, origem comprometida e falhas futuras |
| Backups / vazamento e adulteração | Opção padrão com AES-GCM, senha não armazenada, salt/IV aleatórios | Senha fraca, arquivo/senha expostos; sem senha o JSON é legível e alterável |
| Restauração / perda acidental ou corrida | Prévia, confirmação, validação, comparação com estado da prévia e rollback; recuperação de estado inconsistente com cópia de diagnóstico | Arquivo legítimo antigo pode substituir dados mais recentes por escolha do usuário |
| CSV / fórmulas e entrada incorreta | Neutralização de texto, parser estrito, mapeamento, prévia e lote atômico | Arquivos exportados contêm nomes/descrições sensíveis |
| PWA / conteúdo antigo ou cache indevido | Cache somente de assets explícitos e atualização manual | Cache/dispositivo podem ser removidos; offline não é backup |
| Dependências / cadeia de fornecimento | Versões exatas, lockfile, TLS/verificações preservadas e auditoria npm | Vulnerabilidades desconhecidas e comprometimento de origem |

No modo local não há backend; no cloud há API Vercel e Supabase. Não há analytics, scripts/fontes externos, acesso bancário ou IA externa. Não armazenar senhas bancárias. Variáveis VITE_ são públicas. Um bloqueio visual de tela não impediria acesso ao perfil; não há login fictício para alegar proteção do IndexedDB.

## Integridade de estornos de correção

Receitas, despesas, transferências, pagamentos de fatura, reembolsos, devoluções comerciais, aplicações de crédito e devoluções a pessoas admitem estorno integral com motivo, prévia e confirmação. O original é preservado, e as entradas inversas precisam corresponder exatamente a referências, categorias e centavos. A unicidade por original é verificada na transação serializada, além da chave idempotente. Cancelamentos de contribuição apontam para o estorno correspondente; valores pagos permanecem registrados.

Migrações v1/v2/v3/v4/v5→v6 preservam dados. Backups novos usam envelope v6 estrito e o leitor mantém compatibilidade com v2/v3/v4/v5. Isso não cria uma trilha criptográfica inviolável: quem controla o perfil pode modificar o armazenamento. A confirmação do operador pode estar errada; não há validação bancária automática.

## Integridade de devoluções comerciais — versão 0.11

Rateio por divisão, limites acumulados, cartão/fatura, lançamentos e saldos em cada corte diário são verificados também ao restaurar backup. O valor recebido de terceiro e o cancelado são distintos; excesso recebido vira obrigação a devolver. Crédito com o emissor não é caixa. Novos eventos preservam pagamentos, parcelas e IDs originais.

A prévia usa o motor validado; a confirmação compara o estado dentro da transação, com recibo idempotente e rollback de todas as tabelas em falha. Mudança entre abas exige outra revisão. Créditos retroativos anteriores a movimentos relacionados são recusados quando exigiriam reclassificação do histórico; eventos do mesmo dia são agrupados. Isso não substitui conferir a fatura real e não é uma correção automática: o operador deve conferir a prévia do estorno de correção, inclusive dependências e saldos históricos.

## Backup e exclusão

Backup cifrado usa PBKDF2-SHA-256/310.000 iterações, chave AES-GCM 256 bits, salt 16 bytes e IV 12 bytes, aleatórios por exportação. A senha fica apenas no formulário durante a ação e é limpa após exportar/restaurar com sucesso. Perder a senha impede recuperar o arquivo. Consulte PORTABILIDADE.md para formato, limites e recuperação.

Exclusão financeira exige digitar APAGAR e limpa as tabelas numa transação, sem fingir remover cópias externas. O cache da aplicação, que não contém registros financeiros, pode continuar presente. No modo local, exclusão de um perfil não afeta outros dispositivos/origens. Na nuvem, exclusão e restauração substituem a base compartilhada; cópias externas permanecem.

## Tratamento de erros

FinanceError representa falha esperada, segura de exibir. Zod valida contratos novamente dentro do banco. Exceções internas não mostram detalhes de conteúdo. Falha de confirmação não significa que o commit não ocorreu: repetir sem modificar os campos mantém a chave e foi testado após erro posterior ao commit.

Estado inconsistente é recusado em vez de reparado/apagado silenciosamente. A atualização de versão fecha conexões antigas; recarregue a aba quando necessário. A recuperação especial é acessível pela tela de erro e compara uma cópia bruta do estado existente. Ela exige backup validado, download da cópia de diagnóstico e confirmação; recusa alteração concorrente e banco já válido. A aplicação recarrega após o commit. Armazenamento inacessível, dados removidos e valores brutos não serializáveis exigem diagnóstico separado; não há reparo automático.

## Revisão das etapas 9 e 10

Recibos são histórico local, não trilha criptográfica inviolável. Quem controla o navegador pode alterar dados. O servidor Vite/preview é para desenvolvimento/validação, não um servidor de produção com autenticação. A CSP meta do build não substitui políticas por cabeçalho de uma futura hospedagem.

A revisão interna examinou os limites de importação/restauração, proteção de saída para React/CSV, transações, uso de Web Crypto, escopo do cache, atualizações da PWA e dependências. Foram corrigidas estas lacunas:

- A tela de erro bloqueava a restauração de um banco inconsistente. O fluxo de recuperação agora preserva uma cópia bruta e valida a substituição, com proteção contra corrida e rollback.
- Ausência de Web Crypto podia produzir um erro genérico de armazenamento/senha. Exportação/leitura criptografada e importação CSV agora identificam a necessidade de HTTPS/localhost e suporte do navegador; não há fallback silencioso para backup sem proteção.
- Uma notificação de atualização recebida de outra aba podia recarregar um formulário aberto. A recarga agora é adiada enquanto há modal aberto, com ação explícita posterior.
- Solicitar armazenamento persistente em um navegador sem essa API não apresentava resposta. O controle agora explica a indisponibilidade.

O build foi exercitado com IndexedDB nativo e CSP, incluindo texto HTML importado sem interpretação, cópia de diagnóstico, confirmação, PDF, exclusão e operação offline. Os testes de domínio/persistência verificam backup adulterado, senha errada, versões desconhecidas, relações inválidas, transações interrompidas e concorrência. O cenário de atualização entrega uma notificação de troca de controlador a uma página já controlada; não simula toda a infraestrutura de publicação de uma nova versão.

Não foram encontrados usos de HTML arbitrário, eval, armazenamento de senha em localStorage/sessionStorage ou serviços externos no código de aplicação revisado. A busca estática auxilia a revisão e não prova ausência de vulnerabilidades. Os registros de validação estão em PROGRESSO.md.

Não se afirma auditoria externa, segurança comercial/multiusuário, cobertura contra todas as falhas ou suporte já validado em todos os navegadores. Os cabeçalhos da Vercel estão declarados, mas precisam ser validados no domínio real; consulte INSTALACAO-E-MANUTENCAO.md.

## Importação OFX, conferência e lembretes — versão 0.10

O parser OFX trabalha localmente, com limites de arquivo/cabeçalho/linhas/estrutura, sem resolver DTD ou entidades externas. O adaptador aceita apenas o subconjunto bancário BRL documentado e recusa formatos/correções incompatíveis. Movimentos ambíguos exigem decisão individual; a conta é confirmada pelo operador. Prévia, lote transacional e idempotência por conta+FITID protegem contra escrita parcial e repetição, sem prometer deduplicar CSV/manual por semelhança.

A conferência com extrato é somente cálculo/lista de revisão, sem acesso ao banco, persistência dos valores digitados ou criação automática de ajuste. As subcategorias têm validação de ciclos, referências, natureza e arquivamento; mover grupos muda a organização de relatórios e exige revisão dos orçamentos.

O lembrete de backup guarda no localStorage apenas preferências, instantes e SHA-256 canônico do estado. Não grava nomes, senhas ou registros financeiros nesse mecanismo e não envia conteúdo à rede. Ele registra solicitação de download, sem garantir que o navegador guardou o arquivo. Falha de armazenamento desses metadados não bloqueia operações ou exportações. Os metadados não estão no backup financeiro; restauração/exclusão reiniciam o rastreio sem criar uma cópia falsa.

As revisões desta etapa corrigiram ambiguidade de caminhos no assistente, vazamento do banner no relatório impresso e erro de tipagem de entrada em backup legado malformado. Não equivalem a auditoria externa nem a proteção contra quem controla o perfil do navegador.
