import handler from '../../api/vaccine.mjs';
import { invokeNodeHandler } from '../lib/bridge.mjs';

export default async function vaccine(request, context) {
  return invokeNodeHandler(request, context, handler);
}

export const config = { path: '/api/vaccine' };
