import { handleWebApiRequest } from '../../src/server/api/handler.js';

export function onRequest(context) {
  return handleWebApiRequest(context.request, { env: context.env });
}
