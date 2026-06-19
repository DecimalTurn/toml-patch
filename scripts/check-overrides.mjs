// check-overrides.mjs
// Checks which pnpm overrides are still needed by temporarily removing each one
// and checking if the resolved version still satisfies the security constraint.
//
// Usage: node scripts/check-overrides.mjs

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workspacePath = path.join(root, 'pnpm-workspace.yaml');
const lockfilePath = path.join(root, 'pnpm-lock.yaml');

// ── Version utilities ────────────────────────────────────────────────

function extractMinVersion(constraint) {
  const gteMatch = constraint.match(/>=\s*(\d+\.\d+\.\d+(?:-[^\s,]+)?)/);
  if (gteMatch) return gteMatch[1];
  const caretMatch = constraint.match(/\^\s*(\d+\.\d+\.\d+(?:-[^\s,]+)?)/);
  if (caretMatch) return caretMatch[1];
  const verMatch = constraint.match(/(\d+\.\d+\.\d+(?:-[^\s,]+)?)/);
  return verMatch ? verMatch[1] : null;
}

function parseVersion(v) {
  const [core, ...pre] = v.split('-');
  const parts = core.split('.').map(Number);
  return { parts, pre: pre.join('-') };
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.parts.length, pb.parts.length); i++) {
    const diff = (pa.parts[i] || 0) - (pb.parts[i] || 0);
    if (diff !== 0) return diff;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre !== pb.pre) return pa.pre.localeCompare(pb.pre);
  return 0;
}

// ── Main ─────────────────────────────────────────────────────────────

const originalYaml = readFileSync(workspacePath, 'utf8');
const workspace = yamlLoad(originalYaml);
const overrides = workspace.overrides || {};

if (Object.keys(overrides).length === 0) {
  console.log('No overrides found in pnpm-workspace.yaml');
  process.exit(0);
}

console.log(`Checking ${Object.keys(overrides).length} overrides...\n`);

const results = [];

for (const [pkg, constraint] of Object.entries(overrides)) {
  const minSafe = extractMinVersion(constraint);
  if (!minSafe) {
    results.push({ pkg, constraint, status: 'SKIP', reason: `Could not extract min version from "${constraint}"` });
    continue;
  }

  // Create modified workspace without this override
  const modified = yamlLoad(originalYaml);
  delete modified.overrides[pkg];
  if (Object.keys(modified.overrides).length === 0) {
    delete modified.overrides;
  }
  writeFileSync(workspacePath, yamlDump(modified, { lineWidth: -1, noCompatMode: true }), 'utf8');

  // Resolve without this override
  let resolvedVersion;
  try {
    execSync('pnpm install --lockfile-only --no-optional', {
      cwd: root,
      stdio: 'pipe',
      timeout: 60_000,
    });
  } catch (e) {
    results.push({ pkg, constraint, minSafe, status: 'ERROR', reason: `pnpm install failed: ${e.stderr?.toString() || e.message}` });
    writeFileSync(workspacePath, originalYaml, 'utf8');
    continue;
  }

  // Read resolved version from the new lockfile
  try {
    const lockfile = yamlLoad(readFileSync(lockfilePath, 'utf8'));
    const snapshots = lockfile.snapshots || {};
    const snapshotKey = Object.keys(snapshots).find(k => k.startsWith(pkg + '@') || k.startsWith(pkg + '/'));
    // snapshot keys are `name@version` (unscoped) or `@scope/name@version` (scoped).
    // Greedy match up to the last '@' to extract version.
    resolvedVersion = snapshotKey ? snapshotKey.replace(/.*@/, '') : null;
  } catch (e) {
    results.push({ pkg, constraint, minSafe, status: 'ERROR', reason: `Could not parse lockfile: ${e.message}` });
    writeFileSync(workspacePath, originalYaml, 'utf8');
    continue;
  }

  // Restore workspace file immediately (lockfile will be restored at the end)
  writeFileSync(workspacePath, originalYaml, 'utf8');

  if (!resolvedVersion) {
    results.push({ pkg, constraint, minSafe, status: 'NOT_FOUND', reason: 'Package not present in resolved snapshots without override' });
    continue;
  }

  const needed = compareVersions(resolvedVersion, minSafe) < 0;
  results.push({ pkg, constraint, minSafe, resolvedWithoutOverride: resolvedVersion, needed, status: needed ? 'NEEDED' : 'STALE' });
}

// Restore lockfile to its original state
execSync('pnpm install --lockfile-only --no-optional', { cwd: root, stdio: 'pipe' });

// ── Report ───────────────────────────────────────────────────────────

const needed = results.filter(r => r.status === 'NEEDED');
const stale = results.filter(r => r.status === 'STALE');
const other = results.filter(r => r.status !== 'NEEDED' && r.status !== 'STALE');

if (stale.length > 0) {
  console.log('── Stale overrides (can be removed) ──\n');
  for (const r of stale) {
    console.log(`  ${r.pkg}: ${r.constraint}`);
    console.log(`    → Without override, resolves to ${r.resolvedWithoutOverride} (>= ${r.minSafe})\n`);
  }
}

if (needed.length > 0) {
  console.log('── Overrides still needed ──\n');
  for (const r of needed) {
    console.log(`  ${r.pkg}: ${r.constraint}`);
    console.log(`    → Without override, resolves to ${r.resolvedWithoutOverride} (< ${r.minSafe})\n`);
  }
}

if (other.length > 0) {
  console.log('── Could not check ──\n');
  for (const r of other) {
    console.log(`  ${r.pkg}: ${r.constraint} — ${r.reason}\n`);
  }
}

console.log(`Summary: ${needed.length} needed, ${stale.length} stale, ${other.length} unchecked`);

if (stale.length > 0) {
  process.exitCode = 1;
}
