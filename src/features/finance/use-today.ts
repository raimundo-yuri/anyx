import { useEffect, useState } from 'react';
import { today } from './finance-fields';

/** Refresh a long-open tab after midnight, focus or resuming the browser. */
export function useToday() {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') setDate(today()); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return date;
}
