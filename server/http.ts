import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_CLOUD_REQUEST_BYTES } from '../src/application/cloud-contract';
import { HttpError, type ServerConfig } from './config';
export type ApiRequest = IncomingMessage & { body?: unknown };
export function headers(response: ServerResponse) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0'); response.setHeader('Vary', 'Cookie');
  response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}
export function json(response: ServerResponse, status: number, value?: unknown) { response.statusCode = status; response.end(value === undefined ? '' : JSON.stringify(value)); }
export function mutationOrigin(request: ApiRequest, config: ServerConfig) {
  if (request.headers.origin !== config.origin || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '') || request.headers['x-dexfin-client'] !== '1') throw new HttpError(403, 'Esta solicitação não foi autorizada. Abra o aplicativo pelo endereço configurado.');
}
export async function body(request: ApiRequest): Promise<unknown> {
  if (Number(request.headers['content-length'] ?? 0) > MAX_CLOUD_REQUEST_BYTES) throw new HttpError(413, 'Solicitação grande demais. Divida a importação ou reduza o backup.');
  let input = request.body;
  if (input === undefined) {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of request) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > MAX_CLOUD_REQUEST_BYTES) throw new HttpError(413, 'Solicitação grande demais.'); chunks.push(buffer); }
    input = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(input)) input = input.toString('utf8');
  if (Buffer.byteLength(typeof input === 'string' ? input : JSON.stringify(input ?? null)) > MAX_CLOUD_REQUEST_BYTES) throw new HttpError(413, 'Solicitação grande demais.');
  if (typeof input === 'string') { try { return JSON.parse(input); } catch { throw new HttpError(400, 'Solicitação inválida.'); } }
  return input;
}
