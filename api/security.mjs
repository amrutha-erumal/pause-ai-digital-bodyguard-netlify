const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const buckets = new Map();

export function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

export function sendJson(res, status, body) {
  setJsonHeaders(res);
  res.status(status).json(body);
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    const originHost = new URL(origin).host;
    if (originHost === host || originHost === req.headers.host) return true;
    return originHost.split(':')[0] === String(host).split(':')[0];
  } catch {
    return false;
  }
}

export function requestSize(req, body) {
  const declared = Number(req.headers['content-length']);
  const measured = body ? Buffer.byteLength(JSON.stringify(body), 'utf8') : 0;
  return Math.max(Number.isFinite(declared) ? declared : 0, measured);
}

export function rateLimited(ip, limit = RATE_LIMIT) {
  const now = Date.now();
  const entry = buckets.get(ip);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function getClientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}
