# PROMPT MASTER — DESENVOLVIMENTO DO DEXFIN
## Sistema pessoal de gestão financeira inteligente

Assuma o papel de **engenheiro de software sênior, arquiteto de sistemas, especialista em finanças pessoais, UX/UI designer e profissional de segurança de aplicações**.

Sua missão é projetar e desenvolver um aplicativo de gestão financeira pessoal completo, confiável, responsivo e seguro, com uma experiência visual inspirada em dashboards de cibersegurança.

O projeto deve ser desenvolvido com ferramentas gratuitas sempre que possível, considerando que utilizo a versão gratuita do Claude. Portanto, trabalhe incrementalmente, preserve o contexto, evite respostas desnecessariamente extensas e priorize código funcional em vez de explicações excessivas.

**Não se limite a criar um protótipo visual. Construa uma aplicação funcional, com persistência real de dados, regras financeiras corretas, validações, testes e documentação.**

---

# 1. VISÃO DO PRODUTO

Nome provisório: **DexFin**.

O nome deverá ficar centralizado em uma configuração facilmente alterável.

### Objetivo

Criar um sistema financeiro pessoal que permita:

- Registrar e organizar receitas e despesas.
- Controlar contas bancárias, dinheiro em espécie e cartões de crédito.
- Gerenciar faturas, parcelas e assinaturas.
- Registrar compras realizadas por terceiros usando meus cartões.
- Dividir uma compra entre diferentes pessoas e categorias.
- Controlar dívidas pessoais, empréstimos e valores a receber.
- Administrar dízimos e contribuições voluntárias mediante regras configuráveis.
- Criar orçamentos, metas de economia e reservas financeiras.
- Acompanhar investimentos e patrimônio.
- Visualizar indicadores, gráficos, relatórios e previsões.
- Receber alertas e recomendações de um assistente financeiro.
- Exportar dados para planilhas, PDF e Power BI.
- Preparar uma futura integração com Open Finance.

O aplicativo será inicialmente destinado ao meu uso pessoal, mas sua arquitetura deverá permitir uma possível evolução para um produto comercial multiusuário.

**Prioridade máxima:** precisão dos registros financeiros, principalmente em compras compartilhadas e cartões emprestados.

# 2. RESTRIÇÕES DO PROJETO

1. Priorize ferramentas gratuitas, de código aberto e com manutenção ativa.
2. Não dependa de APIs pagas para o funcionamento básico.
3. Não exija assinatura, domínio próprio ou hospedagem paga para executar a primeira versão localmente.
4. Não implemente funcionalidades fictícias apenas para preencher a interface.
5. Não simule conexões bancárias, sincronizações ou operações que não tenham sido realmente implementadas.
6. Não tente construir todas as funcionalidades simultaneamente.
7. Não reescreva arquivos inteiros desnecessariamente quando uma alteração pontual for suficiente.
8. Não introduza bibliotecas sem necessidade justificada.
9. Não exponha segredos, chaves de API ou credenciais no código do frontend.
10. Se o limite de contexto ou de uso estiver próximo, finalize a etapa atual, documente o progresso e indique exatamente como continuar.

Caso uma decisão não esteja especificada, escolha uma solução tecnicamente adequada, econômica e segura. Faça perguntas somente quando uma informação realmente bloquear o desenvolvimento, apresentando uma pergunta por vez.

# 3. ARQUITETURA TECNOLÓGICA

Utilize preferencialmente:

- **Linguagem:** TypeScript.
- **Interface:** React.
- **Build:** Vite.
- **Estilização:** CSS modular ou Tailwind CSS, conforme a compatibilidade e a simplicidade.
- **Aplicação instalável:** Progressive Web App (PWA).
- **Persistência inicial:** IndexedDB, utilizando Dexie.js ou alternativa equivalente.
- **Validação:** Zod ou alternativa equivalente.
- **Gráficos:** biblioteca leve, como Recharts.
- **Testes:** Vitest e React Testing Library.
- **Testes de navegação:** Playwright, caso o ambiente permita.
- **Controle de versão:** Git.
- **Gerenciamento de dependências:** npm.

As versões das dependências devem ser compatíveis entre si. Utilize versões estáveis e mantenha o arquivo de lock do gerenciador de pacotes.

### Arquitetura lógica

Organize o projeto em camadas separadas:

1. Apresentação e componentes de interface.
2. Casos de uso e serviços de aplicação.
3. Domínio financeiro e regras de negócio.
4. Repositórios e persistência.
5. Importação, exportação e integrações.
6. Segurança, validação e tratamento de erros.

A interface não deve conter diretamente as regras críticas de cálculo financeiro.

Crie interfaces de repositório para permitir substituir a persistência local por uma implementação remota futuramente, sem reescrever toda a aplicação.

Mantenha o projeto simples. Não introduza microsserviços, infraestrutura complexa ou padrões arquiteturais desnecessários para um aplicativo pessoal.

# 4. EXPERIÊNCIA VISUAL

Crie uma identidade visual minimalista, tecnológica e inspirada em cibersegurança.

### Direção visual

- Tema escuro como padrão.
- Fundo em tons de grafite e preto.
- Verde ou ciano como cor de destaque, sem exageros.
- Tipografia legível e hierarquia visual consistente.
- Cards discretos, bordas sutis e gráficos limpos.
- Animações leves e funcionais.
- Ícones consistentes.
- Boa acessibilidade e contraste.
- Interface em português brasileiro.
- Valores monetários em BRL, com formatação brasileira.
- Datas no formato DD/MM/AAAA.
- Fuso horário configurável, com padrão brasileiro.

### Responsividade

A aplicação deverá funcionar em:

- Celulares Android.
- Tablets.
- Computadores com navegadores modernos.

Implemente uma PWA instalável, com manifesto, ícones e comportamento offline adequado.

A tela de abertura poderá apresentar a logo animada do DexFin durante o carregamento. Essa animação deve ser breve, não bloquear a interface e respeitar as preferências de redução de movimento.

### Navegação principal

Organize as seções:

1. Dashboard.
2. Movimentações.
3. Contas e saldos.
4. Cartões e faturas.
5. Pessoas e valores a receber.
6. Dívidas e empréstimos.
7. Orçamentos e metas.
8. Planejamento financeiro.
9. Investimentos e patrimônio.
10. Relatórios e exportações.
11. Assistente financeiro.
12. Configurações e segurança.

Em dispositivos menores, utilize navegação compacta, sem sacrificar as funções essenciais.

# 5. DASHBOARD

A tela inicial deverá apresentar cinco indicadores principais:

1. Saldo disponível.
2. Receitas do período.
3. Despesas do período.
4. Faturas de cartão pendentes.
5. Dinheiro reservado para metas e compromissos.

Defina claramente o que cada indicador representa.

Não some o limite disponível de um cartão ao dinheiro existente em conta. Não considere dinheiro reservado como livre para gastar. Não conte uma transferência interna como renda.

Inclua:

- Gráfico de receitas versus despesas.
- Distribuição das despesas por categoria.
- Evolução financeira mensal.
- Próximos vencimentos.
- Valores que terceiros devem.
- Compras feitas por terceiros em meus cartões.
- Resumo das metas financeiras.
- Alertas relevantes.
- Atalhos para registrar receitas, despesas, transferências e compras compartilhadas.

O usuário deverá conseguir selecionar o período analisado.

Não apresente números fictícios como se fossem dados reais. Se não houver movimentações, exiba um estado vazio com orientação para começar.

# 6. MOTOR FINANCEIRO E MODELO DE DADOS

Esta é a parte mais importante do sistema.

Projete um modelo de domínio consistente antes de implementar as telas.

Utilize identificadores únicos, datas, valores, relacionamentos e histórico de alterações quando necessário.

### Entidades principais

Considere pelo menos:

- Conta financeira.
- Cartão de crédito.
- Fatura.
- Transação.
- Receita.
- Despesa.
- Transferência.
- Categoria e subcategoria.
- Pessoa.
- Compra compartilhada.
- Divisão de compra.
- Obrigação a pagar.
- Obrigação a receber.
- Parcela.
- Assinatura ou despesa recorrente.
- Regra de dízimo ou contribuição.
- Orçamento.
- Meta financeira.
- Reserva.
- Investimento.
- Instituição financeira.
- Configuração do usuário.
- Registro de auditoria, quando apropriado.

Defina relacionamentos e restrições de integridade.

### Precisão monetária

Não utilize números de ponto flutuante comuns como representação canônica de dinheiro.

Armazene valores em centavos inteiros ou utilize uma biblioteca decimal adequada. Defina uma política consistente de arredondamento.

Valide valores, datas, parcelas e relacionamentos antes de persistir os dados.

Use transações atômicas do banco de dados para operações que alterem vários registros relacionados.

### Princípios contábeis obrigatórios

**Transferências internas:** movimentar R$ 100 entre duas contas próprias deve reduzir o saldo de uma conta e aumentar o da outra, sem gerar receita ou despesa consolidada.

**Cartão de crédito:** uma compra deve criar a obrigação correspondente no cartão. O pagamento da fatura deve reduzir o saldo bancário e liquidar a obrigação do cartão, sem registrar novamente a compra como despesa.

**Valores a receber:** quando outra pessoa utilizar meu cartão, a compra poderá representar uma despesa pessoal, uma obrigação de terceiro ou uma divisão das duas coisas, conforme o caso. Não duplique a despesa nem contabilize o reembolso como nova receita.

**Reembolsos:** devem liquidar o valor que a pessoa me deve. Se houver devolução ou estorno de compra, relacione o movimento à transação original.

**Dinheiro reservado:** movimentar dinheiro para uma reserva própria não significa necessariamente uma nova despesa.

**Empréstimos:** diferencie o dinheiro emprestado a terceiros de despesas de consumo. Registre principal, parcelas, vencimentos e pagamentos. Juros, quando existentes, devem ser tratados separadamente.

**Investimentos:** diferencie aportes, resgates, rendimentos e variações de valor patrimonial. Não trate aportes como despesas de consumo nem rendimentos estimados como dinheiro recebido.

**Patrimônio:** calcule ativos menos passivos, evitando contar o mesmo valor em duas contas ou em duas representações do mesmo ativo.

Implemente testes automatizados para todas essas regras.

# 7. FUNCIONALIDADE CRÍTICA: CARTÕES EMPRESTADOS E COMPRAS DIVIDIDAS

O sistema deverá permitir registrar compras complexas sem perder a relação entre o valor total e a responsabilidade de cada pessoa.

### Exemplo obrigatório

Uma compra de R$ 300 é feita no meu cartão de crédito.

- R$ 120 correspondem a produtos meus.
- R$ 100 correspondem a produtos de outra pessoa.
- R$ 80 correspondem a produtos de uma segunda pessoa.

O sistema deverá:

1. Registrar uma única compra original de R$ 300.
2. Permitir três divisões associadas à compra.
3. Registrar R$ 120 como minha despesa.
4. Registrar R$ 100 como valor a receber da primeira pessoa.
5. Registrar R$ 80 como valor a receber da segunda pessoa.
6. Associar a compra à fatura correta.
7. Manter o histórico de quem comprou, quem pagará e quanto foi pago.
8. Atualizar os valores pendentes conforme os reembolsos.
9. Evitar duplicações no dashboard e nos relatórios.
10. Permitir identificar cada divisão posteriormente.

A soma das divisões deverá corresponder ao valor original, considerando uma política consistente de arredondamento.

### Funcionalidades adicionais

- Cadastrar pessoas.
- Atribuir nomes e descrições às compras.
- Escolher quem realizou a compra.
- Escolher quem é responsável pelo pagamento.
- Dividir uma compra entre pessoas e categorias.
- Registrar pagamentos parciais.
- Permitir parcelamento do reembolso independentemente do parcelamento da compra, quando necessário.
- Visualizar valores vencidos, pendentes e quitados.
- Registrar datas prometidas para pagamento.
- Relacionar várias compras à mesma pessoa.
- Consultar o extrato individual de cada pessoa.
- Registrar comprovantes de pagamento, com armazenamento protegido.
- Identificar estornos, cancelamentos e renegociações.

O modelo deve distinguir o parcelamento da compra no cartão do parcelamento da dívida da pessoa.

# 8. CARTÕES, FATURAS E PARCELAMENTOS

Implemente:

- Cadastro de cartões.
- Nome, instituição, limite, fechamento e vencimento.
- Faturas por período.
- Compras à vista e parceladas.
- Parcelas futuras.
- Pagamento total ou parcial de faturas.
- Histórico de pagamentos.
- Estornos e cancelamentos.
- Assinaturas recorrentes.
- Alertas de fechamento e vencimento.
- Responsáveis pelos pagamentos.
- Relação entre compras, parcelas, faturas e reembolsos.

Não confunda limite disponível com saldo bancário.

Não suponha que toda compra parcelada tenha a primeira parcela no mesmo mês: permita configurar a data da primeira parcela e as regras de lançamento.

Se uma compra for cancelada, trate os estornos corretamente sem apagar o histórico original.

# 9. RECEITAS, DESPESAS E DÍZIMO

Permita registrar receitas fixas e variáveis.

Fontes iniciais de renda:

- Estágio.
- Ajuda financeira dos pais.
- Pé-de-Meia.
- Futuros benefícios estudantis.
- Futura remuneração efetiva na Hostweb.
- Outras fontes personalizadas.

Não assuma que essas receitas já estão confirmadas. Permita diferenciar valores previstos de valores efetivamente recebidos.

### Regras de dízimo

Crie uma funcionalidade configurável para separar o dízimo ou outras contribuições sobre receitas selecionadas.

O usuário deverá poder:

- Ativar ou desativar a regra.
- Definir o percentual.
- Escolher quais fontes de renda estão sujeitas à regra.
- Decidir se a regra será aplicada automaticamente ou apenas sugerida.
- Confirmar, editar ou cancelar o valor calculado.
- Registrar o pagamento efetivo.
- Consultar o histórico de contribuições.

A regra não deve ser aplicada indiscriminadamente a transferências internas, empréstimos recebidos, reembolsos ou outros movimentos que não representem renda elegível.

Não presuma que o dízimo será sempre de 10% ou que toda receita estará sujeita à mesma regra.

### Categorias iniciais

Crie entre 10 e 15 categorias padrão, por exemplo:

1. Alimentação.
2. Moradia e contas.
3. Transporte.
4. Educação.
5. Tecnologia.
6. Saúde e bem-estar.
7. Lazer e entretenimento.
8. Assinaturas e serviços digitais.
9. Compras pessoais.
10. Família e presentes.
11. Doações e contribuições.
12. Tarifas e encargos financeiros.
13. Investimentos e reservas.
14. Empréstimos e recebíveis.
15. Outros.

Permita personalizar categorias e subcategorias.

Não misture transferências, aportes, empréstimos e despesas de consumo indiscriminadamente nos relatórios de gastos.

# 10. CONTAS E INSTITUIÇÕES FINANCEIRAS

Prepare o cadastro inicial para:

- Nubank.
- Mercado Pago.
- Banco do Brasil.
- Caixa Tem.
- Inter.
- Dinheiro em espécie.

O usuário poderá criar novas contas e alterar as existentes.

Cada conta deverá possuir saldo inicial, moeda, identificação, histórico de movimentações e saldo calculado.

O saldo deverá ser derivado das movimentações ou conciliado com elas. Não mantenha valores duplicados que possam divergir silenciosamente.

Implemente suporte a conciliação manual para comparar o saldo calculado com o saldo informado pelo banco.

# 11. IMPORTAÇÃO, EXPORTAÇÃO E POWER BI

Implemente importação e exportação de dados com foco na portabilidade.

### Exportação

Prioridades:

1. CSV para movimentações, contas, categorias, parcelas e valores a receber.
2. PDF para relatórios financeiros legíveis.
3. XLSX, caso possa ser implementado sem complexidade excessiva.
4. Estrutura de dados compatível com Power BI.

Defina cabeçalhos estáveis, datas consistentes, valores numéricos e identificadores que permitam relacionar tabelas.

Para Power BI, disponibilize arquivos relacionáveis por identificadores, como:

- Movimentações.
- Contas.
- Categorias.
- Pessoas.
- Parcelas.
- Faturas.
- Recebíveis.

Documente o modelo de dados e a forma de relacionar as tabelas no Power BI.

A exportação deve preservar os relacionamentos necessários e não duplicar despesas.

### Importação

Planeje suporte a CSV e OFX.

Implemente validação dos arquivos, visualização prévia, mapeamento de colunas, confirmação antes de importar e detecção de possíveis duplicatas.

Uma importação com erros não deve deixar o banco parcialmente atualizado.

Não invente um formato bancário universal. Crie adaptadores para formatos efetivamente suportados.

# 12. OPEN FINANCE

Prepare uma arquitetura que permita integrar futuramente dados bancários autorizados.

A integração automática deverá ser considerada uma funcionalidade avançada, não uma dependência da primeira versão.

Antes de implementar, investigue a viabilidade real de uma solução compatível com o Brasil, considerando:

- Instituições participantes.
- Disponibilidade de provedores.
- Custos e limites gratuitos.
- Consentimento e revogação.
- Autenticação.
- Renovação de autorizações.
- Proteção de tokens.
- Requisitos legais e contratuais.
- Tratamento de falhas e indisponibilidade.

Não prometa acesso direto às contas apenas porque uma instituição oferece Open Finance.

Não solicite nem armazene senhas bancárias, códigos de autenticação ou credenciais de acesso.

Nunca coloque tokens secretos no frontend.

Se a integração exigir infraestrutura paga ou não puder ser realizada com segurança, mantenha a importação de extratos como alternativa e documente a limitação.

# 13. ORÇAMENTOS, METAS E PLANEJAMENTO

Implemente:

- Limites mensais por categoria.
- Metas financeiras com valor-alvo e prazo.
- Reservas para compromissos futuros.
- Despesas recorrentes.
- Receitas previstas.
- Projeções de saldo.
- Calendário de vencimentos.
- Comparação entre planejamento e realizado.

Como minha renda pode variar, o sistema deverá permitir previsões conservadoras.

Diferencie claramente:

- Saldo atual.
- Saldo disponível após compromissos.
- Valores reservados.
- Receitas previstas.
- Receitas confirmadas.
- Despesas previstas.
- Despesas efetivadas.

Não apresente previsões como certezas.

# 14. ASSISTENTE FINANCEIRO

Crie um assistente amigável, claro e não julgador, capaz de explicar minha situação financeira e ajudar na tomada de decisões sem decidir por mim.

### Exemplos de interação

- "Quanto ainda tenho disponível neste mês?"
- "Quanto as pessoas ainda me devem?"
- "Quais despesas aumentaram em relação ao mês passado?"
- "Quanto preciso reservar para pagar as próximas faturas?"
- "Posso comprar algo de determinado valor sem comprometer meus compromissos?"
- "Quais assinaturas vencem nos próximos dias?"

O assistente deverá utilizar os dados reais e atualizados do aplicativo.

Não invente números nem afirme ter consultado informações que não estejam disponíveis.

Na primeira versão, implemente um mecanismo local baseado em regras e consultas estruturadas, com respostas para perguntas predefinidas e registro rápido de movimentações por linguagem natural, quando isso puder ser feito de maneira confiável.

Uma integração com modelos de inteligência artificial poderá ser adicionada posteriormente por meio de uma interface de provedor configurável.

Não exija uma API paga para utilizar o núcleo financeiro.

Não envie dados financeiros para serviços externos sem consentimento explícito e sem informar quais dados serão transmitidos.

O assistente deverá explicar a origem dos cálculos, identificar incertezas e apresentar recomendações como sugestões.

# 15. EXPERIÊNCIA DE LANÇAMENTO RÁPIDO

O usuário deverá conseguir registrar uma movimentação em poucos segundos.

Ofereça três formas de entrada:

1. Formulário estruturado.
2. Lançamento rápido.
3. Chat de linguagem natural.

No lançamento rápido, priorize:

- Tipo de movimentação.
- Valor.
- Conta ou cartão.
- Categoria.
- Data.

Campos adicionais poderão ser preenchidos posteriormente.

Para compras compartilhadas, permita expandir a tela e adicionar pessoas, divisões, parcelas e responsáveis.

Não descarte informações já preenchidas ao alternar entre as modalidades de lançamento.

Exemplo de entrada em linguagem natural:

"Comprei R$ 150 no Nubank, sendo R$ 50 meus e R$ 100 para João pagar no próximo mês."

O sistema deverá interpretar a frase, apresentar uma prévia e solicitar confirmação antes de salvar.

Se houver ambiguidade, faça uma pergunta objetiva em vez de registrar dados incorretos.

# 16. SEGURANÇA E PRIVACIDADE

Trate os dados financeiros como informações sensíveis.

Implemente uma abordagem de segurança proporcional ao ambiente e documente suas limitações.

### Requisitos

- Validação dos dados na entrada.
- Tratamento seguro de erros.
- Proteção contra XSS e injeção.
- Política de segurança de conteúdo adequada quando aplicável.
- Dependências atualizadas e verificadas.
- Ausência de segredos no repositório.
- Arquivo de configuração de exemplo sem credenciais reais.
- Controle de acesso caso exista backend.
- Regras de autorização verificadas no servidor.
- Proteção contra operações duplicadas.
- Backups e restauração testados.
- Bloqueio automático por inatividade, quando apropriado.
- Exclusão e exportação dos dados pelo usuário.
- Documentação de riscos e limitações.

Não confunda uma tela de login com segurança real dos dados.

Se o aplicativo funcionar exclusivamente no navegador, explique que o bloqueio da interface não impede, por si só, o acesso aos dados por alguém com acesso ao perfil do navegador ou ao dispositivo.

Não alegue que o armazenamento local está criptografado se isso não tiver sido implementado e verificado.

Avalie a criptografia de backups com uma chave controlada pelo usuário. Explique as consequências da perda da chave.

Se houver sincronização remota, implemente autenticação, autorização por usuário, regras de acesso no banco e transporte protegido. Avalie criptografia adicional para campos sensíveis conforme a arquitetura adotada.

Não armazene documentos pessoais ou comprovantes desnecessariamente.

Crie um modelo de ameaças básico, identificando ativos, ameaças, controles e riscos residuais.

# 17. SINCRONIZAÇÃO E BACKUP

Comece com persistência local confiável e exportação de backups.

Projete a aplicação para permitir sincronização futura, preferencialmente utilizando uma solução gratuita adequada, como um serviço com plano gratuito ou backend próprio, após avaliar os limites e a segurança.

Não implemente uma sincronização ingênua que simplesmente sobrescreva os dados locais com os remotos.

Se a sincronização for adicionada, defina:

- Identificadores estáveis.
- Estratégia de resolução de conflitos.
- Exclusões sincronizadas.
- Tratamento de falhas.
- Histórico de sincronização.
- Política de recuperação.
- Limites de armazenamento e transferência.
- Proteção dos dados em trânsito e em repouso.

A primeira versão deve funcionar sem uma conta externa e sem depender da disponibilidade de um servidor.

# 18. TESTES E CRITÉRIOS DE ACEITAÇÃO

Não considere uma funcionalidade concluída apenas porque sua tela está pronta.

Crie testes para:

- Cálculo de saldos.
- Receitas e despesas.
- Transferências internas.
- Compras compartilhadas.
- Valores a receber.
- Pagamentos parciais.
- Parcelamentos.
- Faturas.
- Estornos.
- Reembolsos.
- Dízimos configuráveis.
- Orçamentos.
- Metas.
- Importação e exportação.
- Backup e restauração.
- Validações e tratamento de erros.

### Cenários obrigatórios

**Cenário A:** uma transferência de R$ 100 entre contas próprias não altera a renda nem a despesa consolidada.

**Cenário B:** uma compra de R$ 300, dividida entre R$ 120 pessoais e R$ 180 de terceiros, gera uma despesa pessoal de R$ 120 e R$ 180 a receber, sem duplicação.

**Cenário C:** o recebimento de R$ 60 de uma dívida de R$ 100 reduz o saldo devedor para R$ 40, sem criar uma nova receita de R$ 60.

**Cenário D:** o pagamento da fatura de um cartão liquida a obrigação correspondente sem registrar novamente as compras como despesas.

**Cenário E:** uma compra parcelada gera as parcelas esperadas nas faturas corretas e preserva a relação com a compra original.

**Cenário F:** o backup exportado pode ser restaurado, mantendo os registros e relacionamentos necessários.

**Cenário G:** importar o mesmo extrato duas vezes não deve duplicar automaticamente as movimentações reconhecidas como idênticas.

**Cenário H:** a regra de dízimo só se aplica às receitas e condições configuradas pelo usuário.

# 19. PRIMEIRA VERSÃO — MVP

Não tente concluir todas as funcionalidades avançadas de uma só vez.

A primeira versão deverá conter:

1. Interface responsiva e PWA.
2. Cadastro e persistência de contas.
3. Registro de receitas, despesas e transferências.
4. Categorias personalizáveis.
5. Cadastro básico de cartões e faturas.
6. Compras divididas entre o usuário e terceiros.
7. Valores a receber e pagamentos parciais.
8. Dashboard com dados reais.
9. Regra de dízimo configurável.
10. Exportação CSV e backup restaurável.

Após validar essa base, implemente parcelamentos mais avançados, recorrências, relatórios PDF, planejamento, investimentos, assistente financeiro e sincronização.

A integração com Open Finance deverá permanecer em uma etapa posterior, condicionada à viabilidade real.

O suporte ao Power BI deverá começar com exportações bem estruturadas e documentação do modelo de dados.

# 20. DOCUMENTAÇÃO E MANUTENÇÃO

Crie:

- README.md com instruções de instalação e execução.
- Arquivo de exemplo para configuração de ambiente.
- Documentação da arquitetura.
- Modelo de dados.
- Explicação das regras financeiras.
- Instruções de backup e restauração.
- Instruções de exportação para Power BI.
- Lista de funcionalidades implementadas e pendentes.
- Registro das decisões técnicas.
- Plano básico de manutenção e atualização de dependências.

Mantenha os nomes de variáveis, funções e arquivos consistentes.

Não deixe funções essenciais como simples placeholders.

Quando uma funcionalidade ainda não estiver implementada, identifique-a claramente na interface e na documentação.

# 21. METODOLOGIA DE EXECUÇÃO COM O CLAUDE

Trabalhe em etapas pequenas, adequadas ao limite da versão gratuita.

**Etapa 1 — Planejamento:** analise os requisitos, proponha a arquitetura, defina o modelo de dados e identifique os principais riscos. Não comece criando todas as telas.

**Etapa 2 — Estrutura:** crie o projeto, instale as dependências necessárias e configure a execução local.

**Etapa 3 — Persistência:** implemente o banco local, as entidades e as regras fundamentais.

**Etapa 4 — Movimentações:** implemente receitas, despesas, transferências e categorias.

**Etapa 5 — Cartões e recebíveis:** implemente o controle de compras compartilhadas, faturas e pagamentos.

**Etapa 6 — Dashboard:** conecte os indicadores aos dados reais.

**Etapa 7 — Exportação e backup:** implemente e teste a portabilidade dos dados.

**Etapa 8 — Recursos avançados:** acrescente planejamento, alertas, assistente e demais funcionalidades.

**Etapa 9 — Segurança e validação:** execute os testes, corrija erros e documente limitações.

**Etapa 10 — Preparação para uso:** revise a experiência, a instalação, a documentação e o processo de manutenção.

Em cada etapa:

1. Informe brevemente o objetivo.
2. Examine os arquivos existentes antes de alterá-los.
3. Implemente apenas o necessário para a etapa atual.
4. Execute os testes disponíveis.
5. Corrija os erros encontrados.
6. Informe quais arquivos foram criados ou modificados.
7. Forneça os comandos exatos para executar e testar.
8. Liste o que foi concluído e o que permanece pendente.
9. Aguarde minha confirmação antes de avançar para uma etapa maior.

Não afirme que os testes passaram sem executá-los ou sem ter acesso aos resultados.

Não apague arquivos, dados ou configurações existentes sem necessidade e sem explicar o impacto.

Se o ambiente não permitir criar arquivos diretamente, apresente os arquivos completos, identificando seus caminhos e a ordem correta de criação.

# 22. INSTRUÇÃO INICIAL

Comece agora pela Etapa 1.

Leia toda esta especificação e apresente:

1. Uma síntese dos requisitos.
2. A arquitetura recomendada, justificando as escolhas.
3. O modelo inicial das entidades financeiras e seus relacionamentos.
4. As regras contábeis que deverão ser implementadas.
5. Os riscos técnicos e de segurança mais importantes.
6. O escopo exato do MVP.
7. Uma estimativa qualitativa de complexidade e os recursos gratuitos necessários.

Não gere todo o código de uma vez.

Priorize as decisões que evitam erros financeiros estruturais, principalmente duplicação de despesas, transferências classificadas como receitas e valores de terceiros misturados ao patrimônio pessoal.

Ao terminar essa análise, aguarde minha aprovação antes de iniciar a implementação.

O objetivo final é entregar um aplicativo realmente utilizável, confiável, seguro dentro das limitações documentadas e evolutivo — não apenas uma demonstração visual.