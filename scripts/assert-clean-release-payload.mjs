#!/usr/bin/env node

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [resourcesRoot, asarListPath] = process.argv.slice(2);
if (!resourcesRoot || !asarListPath) {
  console.error(
    'Usage: node scripts/assert-clean-release-payload.mjs <resources-root> <asar-list>',
  );
  process.exit(2);
}

const forbiddenDirectoryNames = new Set([
  '.cache',
  '.ezcoder',
  '.gg',
  '.venv',
  '__pycache__',
  'cache',
  'logs',
  'scratch',
  'temp',
  'tmp',
  'venv',
]);
const forbiddenFileNames = new Set(['.DS_Store']);
const forbiddenFileExtensions = ['.log', '.swp', '.swo', '.tmp'];
const secretNamePattern =
  /(?:^|[-_.])(credentials?|secrets?)(?:[-_.]).*\.(?:ini|json|toml|txt|ya?ml)$/i;
const privateKeyPattern = /\.(?:key|p12|pfx|pem)$/i;

function reasonForForbiddenPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  const fileName = parts.at(-1) ?? '';

  if (parts.some((part) => forbiddenDirectoryNames.has(part))) {
    return 'local cache, virtual environment, log, or scratch directory';
  }
  if (fileName === '.env' || fileName.startsWith('.env.')) {
    return 'environment file';
  }
  if (forbiddenFileNames.has(fileName)) {
    return 'local operating-system artifact';
  }
  if (forbiddenFileExtensions.some((extension) => fileName.endsWith(extension))) {
    return 'log, editor, or temporary file';
  }
  if (secretNamePattern.test(fileName) || privateKeyPattern.test(fileName)) {
    return 'credential, secret, or private-key file';
  }
  return null;
}

const failures = [];
const asarPaths = readFileSync(asarListPath, 'utf8').split(/\r?\n/).filter(Boolean);
for (const asarPath of asarPaths) {
  // Dependencies come from a clean, lockfile-driven npm ci in the isolated release
  // workspace. Scan first-party app content here; dependency licensing is handled by
  // the separate third-party audit.
  if (asarPath.startsWith('/node_modules/')) continue;
  const reason = reasonForForbiddenPath(asarPath);
  if (reason) failures.push(`app.asar:${asarPath} (${reason})`);
}

function walkPhysicalResources(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const relativePath = relative(resourcesRoot, absolutePath).split(sep).join('/');

    // app.asar was inspected from its file list above. Native npm dependencies are
    // produced by npm ci in the isolated target workspace, not copied from the host.
    if (relativePath === 'app.asar' || relativePath.startsWith('app.asar.unpacked/node_modules')) {
      continue;
    }

    const reason = reasonForForbiddenPath(relativePath);
    if (reason) failures.push(`resources/${relativePath} (${reason})`);

    const stat = lstatSync(absolutePath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) walkPhysicalResources(absolutePath);
  }
}

walkPhysicalResources(resourcesRoot);

if (failures.length > 0) {
  console.error('Forbidden local/release-unsafe payload paths found:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Clean payload: ${asarPaths.length} app.asar paths plus first-party resources contain no secret files, local caches, Python venvs, logs, scratch files, or unrelated temporary artifacts.`,
);
