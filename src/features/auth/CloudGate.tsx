import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { checkCloudSession, clearCloudFromOtherTab, cloudLogoutNotice, cloudRequest, cloudSession, loginCloud, logoutCloud, onCloudSession, type CloudSession } from '../../infrastructure/cloud-session';
import { userError } from '../../application/user-error';
import { appConfig } from '../../config/app';
import { Field } from '../finance/Forms';
import styles from '../finance/Finance.module.css';
import authStyles from './CloudGate.module.css';

export function CloudGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CloudSession | null>(cloudSession), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'recover' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [code, setCode] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    const unsubscribe = onCloudSession(next => { setSession(next); setNotice(cloudLogoutNotice()); });
    const check = () => { void checkCloudSession().catch(reason => { setError(userError(reason)); setSession({ authenticated: false }); }); };
    check(); window.addEventListener('online', check); window.addEventListener('storage', clearCloudFromOtherTab);
    return () => { unsubscribe(); window.removeEventListener('online', check); window.removeEventListener('storage', clearCloudFromOtherTab); };
  }, []);
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = window.setTimeout(() => { void logoutCloud().catch(() => { setError('Sua sessão terminou. Reconecte para concluir a saída do servidor.'); }); }, Math.max(0, session.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') await loginCloud(email, password);
      else if (mode === 'recover') { await cloudRequest('/api/auth?action=recover', { email }); setMode('reset'); setNotice('Se este e-mail estiver autorizado, você receberá um código de recuperação.'); }
      else {
        if (password !== confirm) { setError('As duas senhas precisam ser iguais.'); return; }
        await cloudRequest('/api/auth?action=reset', { email, code, password }); setMode('login'); setCode(''); setNotice('Senha atualizada. Entre novamente; as sessões anteriores foram encerradas.');
      }
    } catch (reason) { setError(userError(reason)); }
    finally { setPassword(''); setConfirm(''); setBusy(false); }
  }
  if (session?.authenticated) return children;
  return <main className={authStyles.page}><section className={authStyles.card}>
    <p className={styles.eyebrow}>{appConfig.name} · SUA CONTA PESSOAL</p><h1>{mode === 'login' ? 'Entre para continuar' : mode === 'recover' ? 'Recuperar acesso' : 'Definir nova senha'}</h1>
    <p className={styles.formIntro}>Acesse a mesma conta no tablet e no computador. Seus dados ficam na nuvem; é preciso conexão para consultar e salvar. Nenhum dado do aplicativo local é enviado automaticamente.</p>
    {session === null && !error ? <p role="status">Conferindo sua sessão…</p> : <form onSubmit={submit}><fieldset disabled={busy} className={styles.fields}>
      <Field label="E-mail"><input type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></Field>
      {mode === 'reset' && <Field label="Código recebido por e-mail"><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required value={code} onChange={event => setCode(event.target.value)} /></Field>}
      {mode !== 'recover' && <Field label={mode === 'login' ? 'Senha' : 'Nova senha'}><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'reset' ? 12 : 1} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /></Field>}
      {mode === 'reset' && <><p className={styles.hint}>Use pelo menos 12 caracteres e uma senha exclusiva para esta conta.</p><Field label="Confirmar nova senha"><input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={event => setConfirm(event.target.value)} /></Field></>}
      <button className={styles.primary} type="submit">{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'recover' ? 'Enviar código' : 'Salvar nova senha'}</button>
      <button className={styles.secondary} type="button" onClick={() => { setMode(mode === 'login' ? 'recover' : 'login'); setPassword(''); setError(''); }}>{mode === 'login' ? 'Esqueci minha senha' : 'Voltar ao login'}</button>
    </fieldset></form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <p className={styles.hint}>O cadastro é restrito ao proprietário. Ao terminar em um computador compartilhado, use “Sair deste dispositivo”.</p>
  </section></main>;
}

export function SessionButtons() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function leave(all = false) { if (busy) return; setBusy(true); try { await logoutCloud(all); } catch (reason) { setError(userError(reason)); } finally { setBusy(false); } }
  return <><button type="button" className={styles.secondary} disabled={busy} onClick={() => void leave()}>Sair deste dispositivo</button>{error && <span role="alert">{error}</span>}</>;
}
