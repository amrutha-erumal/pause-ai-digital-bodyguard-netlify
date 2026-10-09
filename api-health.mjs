import handler from '../../api/health.mjs';
import { invokeNodeHandler } from '../lib/bridge.mjs';

export default async function health(request, context) {
  return invokeNodeHandler(request, context, handler);
}

export const config = { path: '/api/health' };
