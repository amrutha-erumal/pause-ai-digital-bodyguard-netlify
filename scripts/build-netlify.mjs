import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publishDir = path.join(root, 'public');
const assets = [
  'index.html',
  'style.css',
  'app.js',
  'navigation.js',
  'file-protocol-guard.js',
  'EVALUATION_MANIFEST.json',
  'risk-engine.mjs'
];

await fs.rm(publishDir, { recursive: true, force: true });
await fs.mkdir(publishDir, { recursive: true });
for (const asset of assets) {
  await fs.copyFile(path.join(root, asset), path.join(publishDir, asset));
}
try {
  await fs.cp(path.join(root, 'src'), path.join(publishDir, 'src'), { recursive: true });
} catch {}
console.log(`PAUSE static assets copied to ${publishDir}`);
