import { cloudMode } from '../../config/deployment';
import { useState, type ReactNode } from 'react';
import type { State } from '../../domain/model';
import { useFinance } from './use-finance';
import { DataRecovery } from './DataRecovery';
import styles from './Finance.module.css';
export function FinanceData({ children }: { children: (state: State) => ReactNode }) {
  const { state, error, retry } = useFinance();
  const [recovery, setRecovery] = useState(false);
  if (error) return <><div className={styles.error} role="alert">{error}<button onClick={retry} className={styles.secondary}>Tentar novamente</button>{!cloudMode && <button onClick={() => setRecovery(true)} className={styles.secondary}>Abrir recuperação de dados</button>}</div>{recovery && <DataRecovery onRecovered={() => window.location.reload()} />}</>;
  if (!state) return <p role="status">Carregando seus registros…</p>;
  return children(state);
}
