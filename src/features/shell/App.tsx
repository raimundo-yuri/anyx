import { BackupReminder } from '../finance/BackupReminder';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Building2, Check, Tags, CreditCard, Users, HeartHandshake, Target, TrendingUp, Landmark, FileDown, Bot, Menu, ChevronRight, CircleHelp, Code2, Compass, Database, Fingerprint, Layers3, LayoutDashboard, LockKeyhole, PanelLeftClose, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { appConfig } from '../../config/app';
import styles from './App.module.css';
import { StorageStatus } from './StorageStatus';
import { HomeDashboard } from '../finance/Dashboard';
import { PwaStatus } from '../../pwa/PwaStatus';
import { SecurityControls } from '../finance/SecurityControls';
const CreditWorkspace = lazy(() => import('../finance/CreditWorkspace').then(module => ({ default: module.CreditWorkspace })));
const Reports = lazy(() => import('../finance/Reports').then(module => ({ default: module.Reports })));
const Planning = lazy(() => import('../finance/Planning').then(module => ({ default: module.Planning })));
const Wealth = lazy(() => import('../finance/Wealth').then(module => ({ default: module.Wealth })));
const Assistant = lazy(() => import('../finance/Assistant').then(module => ({ default: module.Assistant })));
import { Contributions } from '../finance/Contributions';
import { FinanceWorkspace, type FinancePage } from '../finance/FinanceWorkspace';

type Page = 'home' | 'project' | 'privacy' | 'cards' | 'people' | 'contributions' | 'reports' | 'planning' | 'wealth' | 'loans' | 'assistant' | FinancePage;
const navigation = [
  { id: 'home', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'movements', label: 'Movimentações', icon: ArrowLeftRight },
  { id: 'accounts', label: 'Contas e saldos', icon: Building2 },
  { id: 'cards', label: 'Cartões e faturas', icon: CreditCard },
  { id: 'people', label: 'Pessoas e recebíveis', icon: Users },
  { id: 'loans', label: 'Dívidas e empréstimos', icon: Landmark },
  { id: 'planning', label: 'Planejamento e metas', icon: Target },
  { id: 'wealth', label: 'Investimentos', icon: TrendingUp },
  { id: 'reports', label: 'Relatórios e backup', icon: FileDown },
  { id: 'assistant', label: 'Assistente', icon: Bot },
  { id: 'contributions', label: 'Contribuições', icon: HeartHandshake },
  { id: 'catalog', label: 'Categorias e fontes', icon: Tags },
  { id: 'project', label: 'Sobre o projeto', icon: Layers3 },
  { id: 'privacy', label: 'Privacidade', icon: ShieldCheck },
] as const;

export function App() {
  const [page, setPage] = useState<Page>('home');
  const [compact, setCompact] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountFilter, setAccountFilter] = useState('');
  const navigateFinance = (next: FinancePage, accountId = '') => { setAccountFilter(accountId); setPage(next); };
  const financePage = page === 'accounts' || page === 'movements' || page === 'catalog' ? page : null;
  useEffect(() => { document.title = `${appConfig.name} · Finanças pessoais`; }, []);
  const title = navigation.find(item => item.id === page)!.label;

  return <div className={`${styles.app} ${compact ? styles.compact : ''}`}>
    <a className={styles.skip} href="#content">Pular para o conteúdo</a>
    <aside className={`${styles.sidebar} ${mobileMenu ? styles.mobileExpanded : ''}`} aria-label="Menu principal">
      <a className={styles.brand} href="#content" onClick={() => setPage('home')} aria-label={`${appConfig.name}, início`}>
        <span className={styles.mark}><Wallet size={23} strokeWidth={2.4} /></span><span>{appConfig.name}<span className={styles.brandDot}>.</span></span>
      </a>
      <button className={styles.mobileMenu} aria-label={mobileMenu ? 'Fechar menu de navegação' : 'Abrir menu de navegação'} aria-expanded={mobileMenu} onClick={() => setMobileMenu(value => !value)}><Menu size={22} /></button>
      <div className={styles.workspace}><span className={styles.avatar}>P</span><span>Meu espaço pessoal<small>Finanças com propósito</small></span><LockKeyhole size={13} /></div>
      <p className={styles.navLabel}>SEU ESPAÇO</p>
      <nav aria-label="Navegação principal">{navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-label={label} title={label} className={`${styles.navItem} ${page === id ? styles.active : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => { setAccountFilter(''); setPage(id); setMobileMenu(false); }}><Icon size={18} /><span>{label}</span>{page === id && <span className={styles.activeDot} />}</button>)}</nav>
      <div className={styles.sideBottom}><div className={styles.privateNote}><Fingerprint size={25} /><strong>Seu dinheiro. Seus dados.</strong><p>Um projeto pensado para colocar você no controle.</p></div><button className={styles.collapse} onClick={() => setCompact(!compact)} aria-expanded={!compact} aria-label={compact ? 'Expandir menu' : 'Recolher menu'}><PanelLeftClose size={17} /><span>Recolher menu</span></button></div>
    </aside>
    <div className={styles.body}>
      <header className={styles.topbar}><div className={styles.breadcrumb}>{appConfig.name}<ChevronRight size={14} /><span>{title}</span></div><div className={styles.topRight}><span className={styles.buildBadge}><span /> Uso pessoal</span><span className={styles.profile} aria-label="Espaço pessoal">P</span></div></header>
      <main id="content" className={styles.main} tabIndex={-1}>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>CLAREZA PARA SUAS ESCOLHAS</p><h1>{title}</h1><p className={styles.muted}>{page === 'home' ? 'Uma relação mais tranquila com o seu dinheiro começa aqui.' : page === 'project' ? 'Uma base sólida, construída uma etapa de cada vez.' : page === 'accounts' ? 'Saiba onde está seu dinheiro, sem confundir saldo com limite.' : page === 'movements' ? 'Organize o que entra, o que sai e o que muda de lugar.' : page === 'catalog' ? 'Personalize a organização das suas finanças.' : 'Transparência desde o primeiro passo.'}</p></div><span className={styles.version}>LOCAL · V{appConfig.version}</span></div>
        <Suspense fallback={<p role="status">Carregando a seção…</p>}>
        {financePage ? <FinanceWorkspace key={`${financePage}:${accountFilter}`} page={financePage} accountId={accountFilter} onNavigate={navigateFinance} /> : page === 'cards' || page === 'people' ? <CreditWorkspace key={page} page={page} /> : page === 'reports' ? <Reports /> : page === 'planning' ? <Planning /> : page === 'wealth' || page === 'loans' ? <Wealth key={page} page={page} /> : page === 'assistant' ? <Assistant /> : page === 'contributions' ? <Contributions /> : page === 'home' ? <HomeDashboard onNavigate={next => { if (navigation.some(item => item.id === next)) setPage(next as Page); }}><>
          <section className={styles.hero} aria-labelledby="welcome-title"><div className={styles.heroContent}><span className={styles.pill}><Sparkles size={13} /> UM NOVO COMEÇO</span><h2 id="welcome-title">Mais clareza.<br />Mais possibilidades<span>.</span></h2><p>Receitas, despesas e planos em um só lugar. Use seus registros para entender suas finanças e cuidar do que vem pela frente.</p><button className={styles.primary} onClick={() => setPage('project')}>Conhecer o projeto <ArrowUpRight size={17} /></button><button className={styles.heroLink} onClick={() => navigateFinance('accounts')}>Começar pelas contas <ChevronRight size={15} /></button></div><div className={styles.heroArt} aria-hidden="true"><div className={styles.orbit} /><div className={styles.orbitSmall} /><div className={styles.artCard}><div className={styles.artCardTop}><Wallet size={21} /><span>DEXFIN / PESSOAL</span></div><div className={styles.artLines}><span /><span /></div><div className={styles.artCardBottom}><span>UM FUTURO MAIS LEVE</span><Fingerprint size={32} /></div></div><span className={styles.floatingIcon}><ArrowDownLeft size={22} /></span><span className={styles.floatingIconTwo}><ArrowUpRight size={22} /></span></div></section>
          <section className={styles.statusPanel}><span className={styles.statusIcon}><Code2 size={22} /></span><div><h2>Sua rotina financeira começa aqui</h2><p>Cadastre suas contas, organize categorias e registre receitas, despesas e transferências. Seus saldos são calculados a partir dos lançamentos reais.</p></div><span className={styles.stage}>COMECE AQUI</span></section>
          <div className={styles.sectionHeading}><h2>Construído sobre o que importa</h2><span>Os princípios do {appConfig.name}</span></div>
          <div className={styles.cards}><Principle icon={<Wallet />} number="01" title="Cada centavo importa" text="Cálculos em centavos e regras que distinguem seu saldo, suas despesas e os valores de terceiros." /><Principle icon={<ShieldCheck />} number="02" title="Privacidade por princípio" text="Persistência local em IndexedDB, sem depender de uma conta externa ou compartilhar suas finanças." /><Principle icon={<Compass />} number="03" title="Clareza para decidir" text="Indicadores baseados nos seus registros. Sem saldos fictícios ou previsões apresentadas como certeza." /></div>
          <div className={styles.bottomNote}><CircleHelp size={16} /><p>Seus saldos e lançamentos estão em Contas e Movimentações. O dashboard será preenchido automaticamente a partir dos seus registros.</p></div>
        </></HomeDashboard> : page === 'project' ? <section className={styles.document}><span className={styles.docIcon}><Layers3 /></span><h2>Do fundamento ao seu dia a dia</h2><p>O DexFin funciona localmente, em português e sem APIs pagas. Contas, categorias, fontes de receita e movimentações já têm formulários conectados ao banco local. Cartões, compras compartilhadas, contribuições, backup, planejamento e assistente local estão disponíveis. Receitas, despesas e transferências incorretas podem ser estornadas integralmente. Devoluções comerciais de compras no cartão, crédito em fatura e dinheiro a devolver a pessoas têm prévia, confirmação e histórico preservado. Confira as limitações descritas em cada seção.</p><ol className={styles.roadmap}>{['Planejamento e regras financeiras — concluído', 'Estrutura React, TypeScript e ferramentas — concluído', 'Persistência e motor financeiro — concluído', 'Contas, receitas, despesas e transferências — concluído', 'Cartões, faturas e compras compartilhadas — concluído', 'Dashboard com dados reais e contribuição — concluído', 'CSV, backup restaurável e PWA — concluído', 'Planejamento, patrimônio e assistente local — disponível', 'Segurança, recuperação e testes — revisado', 'Instalação, uso e manutenção — documentado', 'Correção de receitas, despesas e transferências por estorno — disponível', 'Subcategorias e orçamentos por grupo — disponível', 'Importação de extratos OFX bancários — disponível', 'Conferência de saldo com extrato — disponível', 'Lembretes de backup — disponível', 'Devoluções de cartão, crédito e acertos com terceiros — disponível'].map((item, i) => <li key={item}><span>{i === 0 ? <Check size={16} /> : String(i + 1).padStart(2, '0')}</span>{item}</li>)}</ol><p className={styles.muted}>Sem sincronização remota ou Open Finance. Anexos, amortização automática, conciliação automática e estornos/renegociações avançadas ficam para uma evolução posterior. Esta versão foi revisada e testada para uso pessoal local. Faça backups regulares; os dados do navegador não são criptografados.</p></section> : <section className={styles.document}><span className={styles.docIcon}><LockKeyhole /></span><h2>Informação clara. Controle seu.</h2><h3>O que existe agora</h3><p>Esta versão permite registrar contas, receitas, despesas e transferências e personalizar categorias e fontes. Os dados ficam no banco local do navegador. Não possui analytics, serviços bancários, login ou sincronização.</p><h3>Armazenamento local</h3><p>Os registros do motor financeiro são persistidos no IndexedDB do navegador. Esse armazenamento local não é criptografado. Alguém com acesso ao seu dispositivo ou perfil do navegador poderá acessar os dados.</p><h3>Cuidados com seus dados</h3><p>Limpar os dados do navegador pode apagar registros locais. Exporte backups em Relatórios e backup. A restauração exige validação e confirmação; a opção com senha usa AES-GCM. Perder a senha impede recuperar o backup criptografado. Não informe senhas bancárias ou credenciais neste aplicativo.</p><div className={styles.privacyCallout}><Database size={20} /><span>A versão de produção pode ser instalada e usada offline depois da primeira carga completa. No servidor de desenvolvimento, o cache offline não é ativado.</span></div><SecurityControls /></section>}
        </Suspense>
        <BackupReminder onOpenBackup={() => setPage('reports')} />
        <PwaStatus />
        <div className={styles.bottomNote}><Database size={16} /><StorageStatus /></div>
        <footer className={styles.footer}><span>{appConfig.name} <span>·</span> Finanças pessoais, com propósito.</span><span>Feito para dar o próximo passo.</span></footer>
      </main>
    </div>
  </div>;
}

function Principle({ icon, number, title, text }: { icon: React.ReactNode; number: string; title: string; text: string }) {
  return <article className={styles.principle}><div className={styles.principleTop}><span>{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>;
}
