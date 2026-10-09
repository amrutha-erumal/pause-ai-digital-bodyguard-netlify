import handler from '../../api/analyze.mjs';
import { invokeNodeHandler } from '../lib/bridge.mjs';

export default async function analyze(request, context) {
  return invokeNodeHandler(request, context, handler);
}

export const config = { path: '/api/analyze' };
