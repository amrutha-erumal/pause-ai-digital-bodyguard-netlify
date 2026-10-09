import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const api = await fs.readFile(new URL('../api/analyze.mjs', import.meta.url), 'utf8');
const health = await fs.readFile(new URL('../api/health.mjs', import.meta.url), 'utf8');
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const vercel = await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8');

test('API never hardcodes Gemini or Safe Browsing secrets', () => {
  assert.match(api, /process\.env\.GEMINI_API_KEY/);
  assert.match(api, /process\.env\.GOOGLE_SAFE_BROWSING_API_KEY/);
  assert.doesNotMatch(api, /AIza[0-9A-Za-z_-]{20,}/);
});

test('API has safety controls and does not fetch user URLs directly', () => {
  assert.match(api, /Cross-origin requests are not allowed/);
  assert.match(api, /rateLimited/);
  assert.match(api, /MAX_REQUEST_BYTES/);
  assert.match(api, /MAX_IMAGE_BYTES/);
  assert.match(api, /safebrowsing\.googleapis\.com\/v5\/urls:search/);
  assert.doesNotMatch(api, /fetch\(\s*url\)/);
});

test('Frontend keeps production API keys out of the UI', () => {
  assert.doesNotMatch(html, /Gemini API key/);
  assert.match(html, /GEMINI_API_KEY/);
  assert.match(html, /Privacy Shield/);
  assert.match(html, /Google URL reputation/);
});

test('Deployment declares modern Node runtime and security headers', () => {
  const config = JSON.parse(vercel);
  assert.equal(config.functions['api/*.mjs'].runtime, 'nodejs24.x');
  const headerText = JSON.stringify(config.headers);
  assert.match(headerText, /Content-Security-Policy/);
  assert.match(headerText, /X-Frame-Options/);
});

test('Health endpoint reveals only configuration status, never the key values', () => {
  assert.match(health, /geminiConfigured/);
  assert.match(health, /safeBrowsingConfigured/);
  assert.doesNotMatch(health, /req\.headers\.authorization/i);
  assert.doesNotMatch(health, /console\.log\(process\.env\./i);
});
