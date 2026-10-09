import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, extractUrl, localSignals, normalizeAI, redactSensitive, validateImageData } from '../risk-engine.mjs';

test('clamp stays within bounds and handles invalid numbers', () => {
  assert.equal(clamp(120), 100);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp('oops'), 0);
});

test('extractUrl finds an HTTPS or www URL', () => {
  assert.equal(extractUrl('visit https://example.com/login.'), 'https://example.com/login');
  assert.equal(extractUrl('visit www.example.com now'), 'www.example.com');
  assert.equal(extractUrl('nothing here'), '');
});

test('localSignals catches a high-risk phishing pattern', () => {
  const result = localSignals('URGENT bank alert. Verify OTP now at https://example.com/login');
  assert.equal(result.risk, 'HIGH RISK');
  assert.equal(result.hasUrl, true);
  assert.equal(result.credential, true);
  assert.ok(result.traps.length >= 2);
});

test('localSignals stays cautious for benign text', () => {
  const result = localSignals('Reminder: project review is tomorrow at 10 AM in Lab 2.');
  assert.notEqual(result.risk, 'HIGH RISK');
  assert.equal(result.hasUrl, false);
});

test('redactSensitive masks obvious secrets while keeping the surrounding text', () => {
  const result = redactSensitive('Your OTP 483921 and card 1234567812345678 are requested.');
  assert.equal(result.changed, true);
  assert.match(result.text, /OTP REDACTED/);
  assert.match(result.text, /CARD-LIKE-NUMBER REDACTED/);
  assert.doesNotMatch(result.text, /483921/);
  assert.doesNotMatch(result.text, /1234567812345678/);
});

test('normalizeAI rejects malformed model structures and bounds fields', () => {
  const fallback = localSignals('unknown sender');
  const result = normalizeAI({
    score: 140,
    risk: 'NOT_A_REAL_RISK',
    classification: 'x'.repeat(500),
    dna: [{ label: 'Signal', value: 999 }],
    traps: [{ title: 'Trap', description: 'x'.repeat(1000) }]
  }, fallback);
  assert.equal(result.score, 100);
  assert.equal(result.risk, 'HIGH RISK');
  assert.ok(result.classification.length <= 96);
  assert.equal(result.dna[0][1], 100);
  assert.ok(result.traps[0][2].length <= 260);
});


test('normalizeAI parses fenced JSON strings safely', () => {
  const fallback = localSignals('hello');
  const result = normalizeAI('```json\n{"score": 72, "risk": "SUSPICIOUS", "classification": "TEST"}\n```', fallback);
  assert.equal(result.score, 72);
  assert.equal(result.risk, 'SUSPICIOUS');
});

test('normalizeAI extracts a JSON object from surrounding text', () => {
  const fallback = localSignals('hello');
  const result = normalizeAI('model note: {"score": 65, "classification": "EXTRACTED"}', fallback);
  assert.equal(result.score, 65);
  assert.equal(result.classification, 'EXTRACTED');
});

test('normalizeAI falls back on malformed string payloads', () => {
  const fallback = localSignals('hello');
  assert.strictEqual(normalizeAI('not json', fallback), fallback);
});

test('normalizeAI bounds attacker path and accepts a defensive breakpoint', () => {
  const fallback = localSignals('urgent');
  const result = normalizeAI({attackerPath: [{step:'1', title:'Stage', detail:'d'.repeat(500)}], breakpoint:'Before click', tactic:'Urgency'}, fallback);
  assert.ok(Array.isArray(result.attackerPath));
  assert.ok(result.attackerPath[0][2].length <= 180);
  assert.equal(result.breakpoint, 'Before click');
});

test('validateImageData rejects missing image payloads', () => assert.equal(validateImageData(null).ok, false));

test('validateImageData rejects unsupported image MIME types', () => assert.equal(validateImageData({mimeType:'image/gif', base64:'AAAA'}).ok, false));

test('validateImageData rejects empty and oversized payloads', () => {
  assert.equal(validateImageData({mimeType:'image/png', base64:''}).ok, false);
  const huge = 'A'.repeat(2_666_668);
  assert.equal(validateImageData({mimeType:'image/png', base64:huge}).ok, false);
});

test('validateImageData accepts a bounded PNG payload', () => {
  const result = validateImageData({mimeType:'image/png', base64:'iVBORw0KGgo='});
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, 'image/png');
});
