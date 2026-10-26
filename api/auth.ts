import { createHandler } from '../server/handler.js';
import type { ApiRequest } from '../server/http.js';
import type { ServerResponse } from 'node:http';
const handler = createHandler();
export default (request: ApiRequest, response: ServerResponse) => handler('auth', request, response);
