import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');

test('primary navigation uses native anchor links for resilient interaction', () => {
  for (const [id, label] of [['guard','Threat Lab'],['arena','Decision Arena'],['vaccine','Threat Vaccine'],['how','How it works']]) {
    assert.match(html, new RegExp(`href=\"#${id}\"[^>]*data-scroll=\"${id}\"`));
    assert.match(html, new RegExp(`>${label}<\/a>`));
  }
  assert.match(html, /navigation\.js/);
  assert.match(html, /file-protocol-guard\.js/);
  const guard = fs.readFileSync(new URL('file-protocol-guard.js', root), 'utf8');
  assert.match(guard, /PAUSE was opened as a local file/);
  assert.match(guard, /START_PAUSE\.bat/);
});

const app = fs.readFileSync(new URL('app.js', root), 'utf8');
test('app module preserves native anchor navigation and enables server API on localhost', () => {
  assert.doesNotMatch(app, /querySelectorAll\(\s*['"]\[data-scroll\]['"]\s*\)\.forEach/);
  assert.match(app, /function hasServerRoute\(\)/);
  assert.match(app, /location\.protocol === 'http:'/);
});
