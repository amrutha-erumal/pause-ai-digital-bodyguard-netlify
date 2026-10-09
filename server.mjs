import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import health from './api/health.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 2_500_000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors *; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests");
}

function createResponseAdapter(res) {
  return {
    setHeader: (key, value) => res.setHeader(key, value),
    status: (code) => ({ json: (body) => { res.statusCode = code; securityHeaders(res); res.end(JSON.stringify(body)); } })
  };
}

async function parseBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

async function dispatchApi(req, res, handler) {
  try {
    const body = await parseBody(req);
    const adaptedReq = { method: req.method, url: req.url, body, headers: req.headers, socket: req.socket };
    await handler(adaptedReq, createResponseAdapter(res));
  } catch (error) {
    res.statusCode = error?.message === 'Request is too large.' ? 413 : 400;
    securityHeaders(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error?.message || 'Invalid JSON request.' }));
  }
}


async function dispatchApiModule(req, res, modulePath) {
  try {
    const loaded = await import(modulePath);
    await dispatchApi(req, res, loaded.default);
  } catch (error) {
    // Keep the local UI usable even when npm dependencies have not installed yet.
    // AI routes return an explicit 503; the browser then shows its honest local fallback.
    console.error(`PAUSE API module could not load (${modulePath}):`, error?.message || error);
    res.statusCode = 503;
    securityHeaders(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'AI service dependencies are unavailable. Run npm install, then restart PAUSE.' }));
  }
}

async function serveStatic(req, res) {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const requested = rawPath === '/' ? '/index.html' : rawPath;
  const safePath = path.normalize(requested).replace(/^([/\\])+/, '');
  const filePath = path.join(root, safePath);
  if (!filePath.startsWith(root)) {
    res.statusCode = 400;
    return res.end('Bad request');
  }
  try {
    const stat = await fs.stat(filePath);
    const target = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const body = await fs.readFile(target);
    securityHeaders(res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', path.extname(target) === '.html' ? 'no-store' : 'public, max-age=300');
    res.statusCode = 200;
    res.end(body);
  } catch {
    res.statusCode = 404;
    securityHeaders(res);
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/analyze') return dispatchApiModule(req, res, './api/analyze.mjs');
  if (pathname === '/api/vaccine') return dispatchApiModule(req, res, './api/vaccine.mjs');
  // Health is a body-less GET endpoint. Do not spread IncomingMessage: its async iterator is on its prototype.
  if (pathname === '/api/health') return health({ method: req.method, body: {}, headers: req.headers, socket: req.socket }, createResponseAdapter(res));
  return serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PAUSE listening on ${PORT}`);
});
