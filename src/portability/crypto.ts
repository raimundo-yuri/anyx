import { FinanceError } from '../domain/errors';

export function requireWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new FinanceError('A criptografia e a importação CSV exigem um navegador moderno em HTTPS ou localhost.');
  return globalThis.crypto;
}
