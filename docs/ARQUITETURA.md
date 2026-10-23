# Arquitetura — versão 0.9.1

Aplicação local React/TypeScript/Vite, CSS Modules e IndexedDB/Dexie. Não há backend, serviço bancário ou provedor de IA externa. Gráficos usam SVG e tabelas acessíveis, sem uma dependência adicional. O build usa chunks por seção e um vendor separado.

## Camadas

- `config`: nome/fuso públicos e identidade compartilhada com o manifesto.
- `domain/model.ts`: entidades e comandos Zod estritos; dinheiro em centavos.
- `domain/engine.ts`: transformações contábeis principais e recibos de idempotência.
- `domain/advanced-engine.ts`: planejamento, patrimônio, empréstimos e planos de reembolso.
- `domain/integrity.ts`: referências, equilíbrio, formas de lançamento, parcelas, reservas, unicidade e pendentes históricos.
- `domain/queries.ts`: saldos de natureza devedora/credora, reservas e plano FIFO de reembolso.
- `application`: contratos/casos de uso, consultas de dashboard/planejamento, extrato e assistente local.
- `infrastructure`: schema Dexie, migração, repositório e observação LiveQuery.
- `portability`: backup com/sem criptografia, leitor, CSV e adaptador de extratos.
- `features/finance`: formulários, modais nativos, indicadores, cadastros e páginas funcionais.
- `pwa` e `build`: estado de conexão/instalação e geração de manifesto/precache.

A UI não calcula partidas financeiras. Comandos passam pelo serviço, esquemas e domínio novamente dentro da transação. Relógio e UUID são dependências do motor puro; não há I/O ou leitura de processo no domínio.

## Unidade de trabalho

1. Abrir transação IndexedDB abrangendo as tabelas relacionadas.
2. Ler um estado consistente e validar sua integridade.
3. Validar comando e chave de idempotência.
4. Aplicar regras numa cópia; construir lançamentos balanceados e relações.
5. Validar o resultado inteiro e persistir apenas registros novos/alterados, inclusive recibo.
6. Commit ou rollback completo em qualquer falha.

A mesma chave/conteúdo normalizado retorna o resultado anterior. Outra carga com a mesma chave causa conflito. Comandos intencionais iguais com chaves distintas são fatos distintos. O formulário bloqueia duplo envio e preserva chave durante retentativa sem mudar os dados; o rascunho em memória não sobrevive a fechar/recarregar.

Transações de escrita em tabelas compartilhadas são serializadas, inclusive entre conexões. Lotes CSV usam uma transação externa; falha em linha posterior reverte as anteriores. Restauração valida antes da substituição e compara o estado atual com o da prévia para não sobrescrever alterações concorrentes. A recuperação de banco inconsistente usa uma captura bruta numa transação de leitura, exportável como diagnóstico; a substituição validada compara essa captura e exige que o banco atual continue inconsistente. Testes injetam falhas após começar as escritas/limpeza. O estorno integral usa a mesma unidade de trabalho, inverte exatamente as entradas do original e cancela contribuições pendentes numa única transação. A validação também recusa estorno duplicado, data diferente, entrada adulterada e cancelamento incompatível. A data financeira permanece a original; o instante de criação identifica quando a correção foi registrada.

## Persistência e migração

Banco `dexfin`, esquema 3. O esquema 1 continua declarado; a atualização cria novas tabelas e deriva uma parcela para cada compra antiga sem mudar IDs, operações ou recibos. Compras novas geram todas as parcelas explícitas. Snapshots legados de backup também recebem essa adaptação. A migração v2→v3 adiciona o índice `operations.relatedId`, preservando registros e IDs. A operação `reversal` liga a correção ao original, e `contributions.cancelledById` registra os cancelamentos decorrentes. Backups novos usam envelope v3 estrito; o leitor adapta os v2. Bancos não são apagados/recriados automaticamente.

A validação do estado completo favorece integridade, mas seu custo cresce com o histórico. O adaptador deve ser medido e otimizado antes de uso com grande volume. A interface de repositório permite outro adaptador, mas autenticação/autorização multiusuário e resolução de conflitos não são fornecidas por essa abstração.

## Observação e interface

LiveQuery observa as leituras do repositório e encerra a inscrição ao desmontar. Alterações entre abas da mesma origem atualizam os saldos; isso não sincroniza perfis/dispositivos. Cadastros arquivados preservam referências antigas e são excluídos de novos lançamentos; contas só arquivam com saldo zero.

Modais nativos preservam foco e bloqueiam interação de fundo. IDs únicos associam rótulos a inputs/selects. Trocar natureza de lançamento mantém campos e escolhas de categoria por natureza. Erros financeiros esperados são explicados; erros internos não expõem payloads. As conversas do assistente ficam em memória, com no máximo vinte interações anteriores.

## Offline e atualização

O plugin local de build gera manifesto com nome configurável, ícones e service worker com lista explícita de recursos estáticos. Não intercepta/grava conteúdo financeiro em Cache Storage. Navegação usa rede com fallback para HTML cacheado; assets precacheados permitem abrir também rotas carregadas sob demanda sem conexão.

Não há skipWaiting automático em atualização. A UI oferece aplicação manual e pede fechar formulário aberto antes de recarregar. Se a troca de controlador vier de outra aba com um modal local aberto, a página adia a recarga e oferece uma ação após fechar o modal. O cache antigo só é removido quando a nova versão é ativada. O caminho base do build é usado no manifesto, nos ícones, no registro/escopo do worker e no fallback de HTML. O namespace dos caches inclui o caminho para que uma instalação não remova o cache de outra base na mesma origem. O worker ignora requisições fora de seu caminho. O build do GitHub Pages é validado em `/anyx/`, inclusive offline. Não há service worker no desenvolvimento. PWA exige HTTPS/localhost e instalação inicial conectada; cópia do ambiente não preserva o banco do perfil do navegador.

## Validação atual

Testes de domínio/persistência/interface, migração e recuperação; navegação no Chromium desktop/viewport móvel; produção com offline, PDF, exclusão, recuperação e nomes importados como texto. O cenário de atualização entrega uma notificação de controlador à página controlada e verifica a preservação do modal. Contagens e resultados executados constam em PROGRESSO.md. Fixtures são sintéticas e isoladas. Não é validação em Android físico, Safari ou Firefox, nem auditoria externa de segurança.
