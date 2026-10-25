# DexFin — etapa 1: decisões e plano de implementação

> Atualização de prioridade aprovada: a versão 0.13 prepara Vercel + Supabase para login e sincronização pessoal entre PC e tablet, conforme [o guia](VERCEL-E-SUPABASE.md). A aceitação externa depende de configurar as contas e testar o domínio real.

> Este é o plano original da etapa 1. Consulte PROGRESSO.md para o estado implementado atual.

Status na elaboração do plano: planejamento concluído; implementação depende da aprovação solicitada na especificação, seção 22. Nenhuma funcionalidade descrita neste plano está implementada.

## Objetivo e escopo

Aplicação pessoal em português brasileiro, local e offline, com dados reais, valores em BRL e interface responsiva escura. O núcleo deve distinguir consumo pessoal, caixa, crédito, compromissos e direitos contra terceiros. Não haverá dados financeiros fictícios na abertura.

O MVP compreende:

1. Interface responsiva e PWA instalável, com cache apenas dos recursos estáticos.
2. Contas com saldo inicial, histórico e saldo derivado; instituições sugeridas sem contas ou saldos criados automaticamente.
3. Receitas recebidas, despesas efetivadas, transferências e categorias editáveis; previsões identificadas e excluídas do saldo realizado.
4. Cartões, ciclos de fatura, compras à vista e pagamento total ou parcial da fatura.
5. Compras divididas por pessoa e categoria, com recebíveis e reembolsos parciais.
6. Dashboard real com filtro de período, cinco indicadores, gráficos, vencimentos e estados vazios.
7. Contribuição configurável por fonte de receita, como sugestão ou reserva automática; confirmação do pagamento em operação separada.
8. CSV relacionável por identificadores e backup JSON versionado com prévia, validação e restauração atômica.
9. Testes das regras implementadas, documentação e limitações de segurança explícitas.

Ficam para etapas posteriores: parcelas avançadas e cronogramas independentes de reembolso; estornos operacionais; recorrências; dívidas e empréstimos; investimentos; conciliação; orçamentos e metas; PDF/XLSX; importação CSV/OFX; linguagem natural; assistente; sincronização e Open Finance. Não criar botões que simulem esses recursos. O cenário E será validado quando houver parcelamento; G, quando houver importação de extratos. Backup restaurável não equivale a importador bancário.

## Arquitetura recomendada

- TypeScript + React + Vite: tipos, componentes e execução local simples.
- CSS modular: tema por variáveis, poucos efeitos, contraste e redução de movimento; sem framework CSS adicional inicialmente.
- Dexie/IndexedDB: persistência estruturada, índices, migrações e transações atômicas. Solicitar armazenamento persistente quando suportado; a concessão não é garantida.
- Zod: esquemas na entrada, na restauração e nos limites da aplicação.
- Recharts: gráficos conectados aos mesmos seletores financeiros usados nos indicadores.
- Vitest + React Testing Library + fake-indexeddb: domínio, serviços, persistência e interface. Playwright quando suportado para fluxo real e recarga offline.
- PWA por plugin mantido para Vite, com atualização comunicada sem interromper um formulário aberto.
- npm com lockfile; escolher e fixar versões estáveis compatíveis na etapa 2, após verificar os requisitos de Node.

Estrutura prevista:

```text
src/config/          nome do produto, localidade, fuso e padrões
src/domain/          entidades, centavos, datas e regras puras
src/application/     casos de uso, consultas e contratos de repositório
src/infrastructure/  Dexie, migrações e implementações dos contratos
src/features/        telas, formulários e componentes por funcionalidade
src/portability/     CSV, backup e validação de restauração
src/test/            configuração e fixtures sintéticas exclusivas de testes
docs/                decisões, modelo, segurança e uso
```

Componentes não calculam lançamentos financeiros. Casos de uso validam relações, montam lançamentos e persistem tudo em uma única transação IndexedDB. Contratos de repositório expõem consultas e unidade de trabalho, permitindo uma implementação remota futura. Um backend futuro também precisará autenticação e autorização próprias; trocar apenas o adaptador local não cria isolamento multiusuário.

## Modelo financeiro inicial

Todos os registros terão UUID, versão e datas de criação/alteração quando aplicável. Datas civis e vencimentos usam `YYYY-MM-DD`; eventos de auditoria usam instantes UTC. Padrão de apresentação: `pt-BR`, BRL e `America/Sao_Paulo`, configurável. O MVP é de moeda única; não somar moedas diferentes.

| Entidade | Dados e relações principais |
| --- | --- |
| Configuração | Nome centralizado do app, moeda, fuso, versão do esquema |
| Conta financeira | Nome, instituição opcional, tipo, conta contábil associada, arquivamento |
| Conta contábil | Natureza: ativo, passivo, patrimônio inicial, receita ou despesa |
| Operação | Tipo, data civil, descrição, status, chave de idempotência e referência original |
| Lançamento | Operação, conta contábil, débito/crédito, valor inteiro positivo, categoria/divisão opcional |
| Categoria | Nome, natureza, categoria pai opcional, arquivamento |
| Fonte de receita | Nome editável; vínculo explícito para elegibilidade da contribuição |
| Pessoa | Nome e dados estritamente necessários; sem documentos obrigatórios |
| Cartão | Nome, instituição, limite, fechamento, vencimento e conta de passivo |
| Fatura | Cartão, ciclo único, fechamento e vencimento em datas civis |
| Compra | Operação original, cartão, valor total, comprador opcional, fatura |
| Divisão | Compra, responsável próprio ou pessoa, valor, categoria e descrição |
| Recebível | Divisão de terceiro, pessoa, principal e vencimento opcional |
| Reembolso | Operação, recebível, conta de destino, valor e data; aceita parcial |
| Pagamento de fatura | Operação, conta de origem, fatura e valor; múltiplos pagamentos |
| Regra de contribuição | Ativação, percentual em pontos-base, fontes elegíveis e modo |
| Contribuição | Receita original, base/percentual registrados, sugestão/reserva/pagamento/cancelamento |
| Reserva | Conta, finalidade, valor e liberação; contribuição pode originar reserva |
| Auditoria | Operação, ação, instante e referência de reversão; sem segredos |

Conta tem vários lançamentos; operação possui ao menos dois lançamentos equilibrados. Cartão possui faturas; fatura possui compras e pagamentos; compra possui divisões; divisão de terceiro origina recebível, que possui reembolsos. Saldos, valor pendente e status de quitação são derivados, sem campos independentes divergentes.

Restrições: centavos inteiros seguros, totais balanceados, referências existentes, ciclos únicos, soma das divisões igual ao total, reembolso limitado ao pendente, pagamento limitado à fatura aberta e reserva limitada ao caixa da conta. Não excluir entidades referenciadas: arquivar; correções financeiras por operações vinculadas, preservando o histórico. Limite de cartão é metadado, nunca ativo.

## Regras contábeis e critérios

Adotar lançamentos balanceados internamente, com formulários simples para o usuário. Débito aumenta ativos/despesas e crédito aumenta passivos/receitas/patrimônio.

- Saldo inicial: débito em caixa e crédito em patrimônio inicial; não é receita do mês.
- Receita: débito na conta e crédito em receita; prevista não gera lançamento realizado.
- Despesa: débito em despesa e crédito em caixa; categoria pertence à responsabilidade pessoal.
- Transferência: débito na conta de destino e crédito na origem; receita e despesa consolidadas permanecem iguais.
- Compra no cartão: débito em despesa pessoal e/ou recebíveis e crédito no passivo do cartão. Não reduz caixa na compra.
- Exemplo obrigatório de R$ 300: débito de R$ 120 em despesa, R$ 100 no recebível da pessoa A, R$ 80 no da pessoa B; crédito de R$ 300 no cartão. Uma compra e três divisões identificáveis.
- Reembolso: débito em caixa e crédito em recebível. Receber R$ 60 de R$ 100 deixa R$ 40 pendentes e receita inalterada.
- Pagamento de fatura: débito no passivo e crédito em caixa, com alocação à fatura; não gera nova despesa.
- Reserva: vinculação do caixa já existente, sem gerar consumo ou novo ativo. Disponível para novos compromissos = caixa menos reservas; o dashboard mostra faturas separadas para evitar subtrações duplicadas. Reservas não podem contar duas vezes a mesma finalidade.
- Patrimônio: ativos, incluindo recebíveis, menos passivos. O recebível é patrimônio, mas não caixa disponível; dinheiro de terceiros não é receita nem consumo próprio.
- Contribuição: percentual em pontos-base sobre receitas elegíveis efetivamente recebidas, arredondamento meio para cima ao centavo. Transferências e reembolsos nunca são elegíveis. Sugestão não movimenta caixa; reserva reduz o livre; pagamento gera despesa uma única vez e libera a reserva correspondente.
- Datas de fechamento e vencimento limitadas ao último dia válido do mês; regra de compra no dia do fechamento explícita e testada. Antes de salvar, usuário vê e pode escolher a fatura correta. Ciclos históricos não mudam quando o cadastro do cartão é editado.
- Futuras parcelas: distribuir restos de centavos deterministicamente entre as primeiras parcelas, manter soma original e permitir primeira fatura explícita. Cronograma de cartão é distinto do cronograma do recebível.
- Futuros estornos: reversões vinculadas à compra; ajustar responsabilidade e recebíveis, incluindo tratamento de valores já reembolsados. Não apagar a compra.
- Futuros empréstimos/aportes: movimentam ativos/passivos, não consumo; juros e rendimentos realizados em operações distintas. Variações estimadas não viram caixa.

Dinheiro é canonicamente inteiro em centavos. Entrada decimal é convertida por análise de texto, nunca por multiplicação imprecisa de um `float`. Validar `Number.isSafeInteger`, limites e somas. Percentuais usam aritmética inteira; não arredondar cada resultado intermediário de forma independente.

Os indicadores do período são: caixa atual menos reservas ativas; receitas realizadas no período; consumo pessoal realizado no período, incluindo compras no cartão; faturas pendentes na data de corte; reservas ativas. Exibir as definições e distinguir estoque atual de fluxo no período. Gráficos excluem transferência, pagamento de fatura e reembolso das séries de receita/despesa.

## Validação e entrega incremental

1. Estrutura: projeto, ferramentas e build mínimo, sem telas fictícias.
2. Persistência/domínio: esquemas, migrações, repositórios e testes contábeis.
3. Movimentações: contas, categorias e fluxos realizados/previstos.
4. Cartões/recebíveis: ciclos, compra dividida, fatura e quitação parcial.
5. Dashboard: consultas reais, acessibilidade, responsividade e contribuição.
6. Portabilidade: CSV seguro e backup restaurável, mais PWA.
7. Revisão: testes, fluxo ponta a ponta, documentação e manutenção.

Cada etapa maior depende da confirmação pedida na especificação. Ao concluir uma etapa, registrar arquivos, comandos executados, resultados reais e pendências. Não contar teste não executado como aprovado.

Testes obrigatórios do MVP: cenários A, B, C, D, F e H da especificação; saldos após recarga; rejeição de referência inválida; rollback de operação incompleta; centavos/restos; datas de fechamento em fevereiro e virada do ano; pagamento excessivo; dupla submissão; reservas; filtro de período; CSV com campos contendo aspas e fórmulas; restauração com relações inválidas e versão incompatível. Testar o ciclo exportar/restaurar em banco separado e comparar registros e saldos.

## Segurança e riscos

Ativos: histórico financeiro, relações pessoais e backups. Ameaças principais: XSS, acesso ao perfil do navegador, perda/limpeza do armazenamento, backup exposto, dependência comprometida e erro contábil.

Controles: React sem HTML arbitrário, CSP compatível com produção, validação estrita, sem scripts externos desnecessários, dependências auditadas, chave de idempotência, transações atômicas e restauração validada antes de substituir dados. Tratar nomes de arquivo e conteúdo importado como não confiáveis. Neutralizar fórmulas em CSV destinado a planilhas, mantendo centavos em colunas numéricas estáveis.

IndexedDB não será apresentado como criptografado. Bloqueio visual não protege de quem acessa o perfil do navegador ou o dispositivo. Dados não serão enviados a terceiros. Sem conta externa, tokens bancários ou conexão Open Finance no MVP.

Backup JSON inicial será explicitamente identificado como não criptografado, com orientação de armazenamento protegido. Criptografia de backup por senha poderá ser acrescentada com Web Crypto, formato versionado e testes; perda de senha implica perda de recuperação. Exclusão de dados locais requer confirmação e não remove cópias externas. Restauração substitutiva requer prévia, aviso de impacto, confirmação e possibilidade de exportar o estado atual antes da troca; aplicar em uma transação única.

Maior risco técnico: confundir caixa, consumo, passivo e recebível. Mitigar com domínio independente da interface e exemplos contábeis automatizados antes do dashboard. Risco de perda de dados: backups frequentes e aviso sobre limites do armazenamento local. Arquitetura futura multiusuário exigirá revisão de segurança e migração explícita.

## Exportação e manutenção

CSV: tabelas de operações, lançamentos, contas, categorias, pessoas, compras, divisões, faturas, recebíveis e reembolsos, com UUIDs estáveis, datas ISO e valores em centavos. Documentar cardinalidades e medidas de Power BI: despesa a partir dos lançamentos pessoais, sem somar novamente compra/divisão/pagamento. Não disponibilizar tabela de parcelas vazia como se o recurso existisse.

Documentar instalação/execução, arquitetura, regras, backup/restauração, modelo de dados, segurança, decisões e recursos pendentes. Configuração de exemplo sem credenciais. Atualizações de dependências acompanhadas de testes e build; migração de banco sempre testada sobre versão anterior e backup. Não aplicar correções automáticas de dependências que alterem versões principais sem revisão.

## Complexidade e recursos gratuitos

Complexidade global alta; núcleo contábil, ciclos de cartão e restauração são as partes mais sensíveis. Interface e formulários têm complexidade moderada. O MVP exige várias etapas verificáveis; não equivale a uma única tela ou entrega de todo o escopo avançado.

Recursos necessários: Node LTS compatível com Vite, npm, Git e navegador moderno com IndexedDB e service workers. Bibliotecas abertas e testes locais; sem API paga, domínio ou hospedagem obrigatórios. Desenvolvimento em localhost; PWA em produção exige HTTPS. Hospedagem estática gratuita é opcional e não inclui sincronização nem backup remoto.
