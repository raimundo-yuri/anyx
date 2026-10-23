import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Finance.module.css';
export function FinanceDialog({ title, children, busy, onClose }: { title: string; children: ReactNode; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="finance-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className={styles.dialogHeading}><div><span className={styles.eyebrow}>SEU DINHEIRO, ORGANIZADO</span><h2 id="finance-dialog-title">{title}</h2></div><button type="button" className={styles.iconButton} aria-label="Fechar formulário" disabled={busy} onClick={onClose}><X size={19} /></button></div>
    {children}
  </dialog>;
}
