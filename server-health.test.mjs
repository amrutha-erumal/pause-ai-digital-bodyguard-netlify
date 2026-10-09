import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('local /api/health returns JSON without trying to consume a request stream', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });

  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const deadline = Date.now() + 8000;
  let response;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) assert.fail(`PAUSE server exited early: ${output}`);
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/health`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(response, `PAUSE server did not start in time: ${output}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.geminiConfigured, false);
  assert.equal(body.model, 'gemini-3.8-flash');

  // A beginner must be able to use the UI through the server, not file://.
  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /type="module" src="app\.js"/);
  const appAsset = await fetch(`http://127.0.0.1:${port}/app.js`);
  assert.equal(appAsset.status, 200);
  assert.match(await appAsset.text(), /function hasServerRoute/);
  const navAsset = await fetch(`http://127.0.0.1:${port}/navigation.js`);
  assert.equal(navAsset.status, 200);

  // If npm dependencies are missing, UI-serving still works and AI endpoints fail gracefully.
  const aiRoute = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${port}` }, body: '{}'
  });
  assert.ok([200, 403, 502, 503].includes(aiRoute.status));
  const aiBody = await aiRoute.json();
  if (aiRoute.status === 503) assert.match(aiBody.error, /dependencies are unavailable/i);
});
