import { defaultAppName } from './identity';
import { version } from '../../package.json';
export const appConfig = Object.freeze({
  version,
  name: import.meta.env.VITE_APP_NAME?.trim() || defaultAppName,
  locale: 'pt-BR',
  currency: 'BRL',
  timeZone: import.meta.env.VITE_TIME_ZONE?.trim() || 'America/Sao_Paulo',
});
