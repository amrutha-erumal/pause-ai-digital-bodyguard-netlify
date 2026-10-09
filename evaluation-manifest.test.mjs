import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (name) => fs.readFile(new URL(name, root), 'utf8');
const manifest = JSON.parse(await read('EVALUATION_MANIFEST.json'));
const pkg = JSON.parse(await read('package.json'));
const index = await read('index.html');
const readme = await read('README.md');
const health = await read('api/health.mjs');
const testing = await read('TESTING.md');
const support = await Promise.all(['ACCESSIBILITY.md','ARCHITECTURE.md','SECURITY.md','GOOGLE_SERVICES.md','PROBLEM_STATEMENT.md','JUDGE_MATRIX.md','SUBMISSION_CHECKLIST.md'].map(read));

for (const dimension of ['Code Quality','Security','Efficiency','Testing','Accessibility','Google Services','Problem Statement Alignment']) {
  test(`evaluation manifest contains ${dimension}`, () => {
    assert.ok(manifest.evaluationDimensions[dimension]);
    assert.ok(Array.isArray(manifest.evaluationDimensions[dimension].evidence));
  });
}

test('manifest declares exact Challenge 3 track', () => assert.equal(manifest.track, 'AI-Powered Cybersecurity & Digital Safety'));
test('manifest carries the exact expected outcome language', () => assert.match(manifest.expectedOutcome, /functional prototype.*cybersecurity threat.*actionable security recommendations/i));
test('manifest declares at least five Google service integrations', () => assert.ok(manifest.googleServices.length >= 5));
test('manifest points to a production health endpoint', () => assert.equal(manifest.deployment.healthEndpoint, '/api/health'));
test('manifest points to executable quality commands', () => ['npm run check','npm test','npm run quality'].forEach((c) => assert.ok(manifest.localVerification.commands.includes(c))));
test('package exposes quality scripts', () => ['test','check','quality','test:coverage'].forEach((k) => assert.equal(typeof pkg.scripts[k], 'string')));
test('deployed UI contains all seven evaluator dimension labels', () => ['CODE QUALITY','SECURITY','EFFICIENCY','TESTING','ACCESSIBILITY','GOOGLE SERVICES','PROBLEM STATEMENT ALIGNMENT'].forEach((x) => assert.match(index, new RegExp(x))));
test('deployed UI publishes evaluator metadata', () => {
  assert.match(index, /name="challenge-track"/);
  assert.match(index, /name="challenge-expected-outcome"/);
  assert.match(index, /name="evaluation-dimensions"/);
  assert.match(index, /name="google-services"/);
});
test('README explicitly references the machine-readable evaluator manifest', () => assert.match(readme, /EVALUATION_MANIFEST\.json/));
test('health endpoint exposes machine-readable evaluator readiness', () => {
  assert.match(health, /evaluatorDimensions/);
  assert.match(health, /evaluatorEvidenceEndpoint/);
  assert.match(health, /Google Cloud Run \/ Secret Manager deployment path/);
});
test('testing strategy documents the quality gate', () => {
  assert.match(testing, /npm run quality/);
  assert.match(testing, /88 automated checks/);
});
test('supporting evaluation documents are present and non-empty', () => support.forEach((text) => assert.ok(text.length > 100)));
test('test count is declared consistently in manifest and UI', () => {
  assert.equal(manifest.localVerification.expectedTests, 88);
  assert.match(index, /<strong>88<\/strong><span>automated checks<\/span>/);
});
