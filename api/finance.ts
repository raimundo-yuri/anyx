import { createHandler } from '../server/handler';
import type { ApiRequest } from '../server/http';
import type { ServerResponse } from 'node:http';
const handler = createHandler();
export default (request: ApiRequest, response: ServerResponse) => handler('finance', request, response);
