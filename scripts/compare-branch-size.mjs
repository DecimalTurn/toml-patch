// compare-branch-size.mjs
// Compare the package (dist) size of the current branch against a base branch
// (default: "latest"), without disturbing the current working tree.
//
// Usage:
//   node scripts/compare-branch-size.mjs [base-branch]
//
// Examples:
//   node scripts/compare-branch-size.mjs          # compares HEAD vs latest
//   node scripts/compare-branch-size.mjs main     # compares HEAD vs main
//
// How it works:
//   1. Resolves the current branch name and the base branch name.
//   2. Builds the current branch and measures dist/toml-patch.js (minified + gzipped).
//   3. Creates a temporary git worktree for the base branch under worktrees/,
//      installs deps, builds, measures, then removes the worktree.
//   4. Prints a markdown comparison table (and optional JSON) to stdout.

import { readFileSync, existsSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';
import { join } from 'path';

const root = process.cwd();
const distRel = 'dist/toml-patch.js';

// ── Helpers ────────────────────────────────────────────────────────

function run(cmd, { cwd = root, allowFailure = false } = {}) {
  try {
    return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    if (allowFailure) return '';
    console.error(`Command failed: ${cmd}`);
    console.error(err.stderr ?? err.message);
    process.exit(1);
  }
}

function git(args, { cwd = root } = {}) {
  return run(`git ${args}`, { cwd }).trim();
}

function measure(file) {
  const code = readFileSync(file);
  const minified = code.length;
  const gzipped = gzipSync(code).length;
  return { minified, gzipped };
}

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

// ── Resolve branch names ───────────────────────────────────────────

const baseBranch = process.argv[2] ?? 'latest';
const currentBranch = git('branch --show-current');

if (!currentBranch) {
  console.error('Not on a branch (detached HEAD?). Check out a branch first.');
  process.exit(1);
}

// ── Build + measure current branch ─────────────────────────────────

console.log(`Building current branch (${currentBranch})...`);
run('pnpm run build');
const currentFile = join(root, distRel);
if (!existsSync(currentFile)) {
  console.error(`${distRel} not found after build. Check the build output path.`);
  process.exit(1);
}
const current = measure(currentFile);
const currentMin = fmtKB(current.minified);
const currentGz = fmtKB(current.gzipped);

// ── Build + measure base branch in a temp worktree ─────────────────

const branchSlug = baseBranch.replace(/[^a-zA-Z0-9._-]/g, '-');
const worktreeDir = join(root, 'worktrees', `size-cmp-${branchSlug}`);
const worktreeRel = `worktrees/size-cmp-${branchSlug}`;

console.log(`Creating temp worktree for base branch (${baseBranch})...`);
git(`worktree add "${worktreeDir}" "${baseBranch}" --detach`);

try {
  run('pnpm install', { cwd: worktreeDir });
  console.log(`Building base branch (${baseBranch})...`);
  run('pnpm run build', { cwd: worktreeDir });

  const baseFile = join(worktreeDir, distRel);
  if (!existsSync(baseFile)) {
    console.error(`${distRel} not found in worktree build. Check the build output path.`);
    process.exit(1);
  }
  const base = measure(baseFile);
  const baseMin = fmtKB(base.minified);
  const baseGz = fmtKB(base.gzipped);
  const diffMin = current.minified - base.minified;
  const diffGz = current.gzipped - base.gzipped;
  const signMin = diffMin >= 0 ? '+' : '';
  const signGz = diffGz >= 0 ? '+' : '';
  const pctMin = ((diffMin / base.minified) * 100).toFixed(1);
  const pctGz = ((diffGz / base.gzipped) * 100).toFixed(1);

  // ── Print results ──────────────────────────────────────────────

  console.log();
  console.log('═'.repeat(72));
  console.log(`  Package Size: ${baseBranch} vs ${currentBranch}`);
  console.log('═'.repeat(72));
  console.log();
  console.log(`  ${'Metric'.padEnd(16)} ${baseBranch.padEnd(18)} ${currentBranch.padEnd(18)} Difference`);
  console.log(`  ${'─'.repeat(16)} ${'─'.repeat(18)} ${'─'.repeat(18)} ${'─'.repeat(18)}`);
  console.log(`  ${'Minified'.padEnd(16)} ${baseMin.padEnd(18)} ${currentMin.padEnd(18)} ${signMin}${fmtKB(diffMin)} (${signMin}${pctMin}%)`);
  console.log(`  ${'Min + Gzipped'.padEnd(16)} ${baseGz.padEnd(18)} ${currentGz.padEnd(18)} ${signGz}${fmtKB(diffGz)} (${signGz}${pctGz}%)`);
  console.log();

  // Markdown table
  const table = [
    `| Metric | \`${baseBranch}\` | \`${currentBranch}\` | Difference |`,
    `|--------|-----------|------------------------------|------------|`,
    `| Minified | ${baseMin} | ${currentMin} | ${signMin}${fmtKB(diffMin)} (${signMin}${pctMin}%) |`,
    `| Min + Gzipped | ${baseGz} | ${currentGz} | ${signGz}${fmtKB(diffGz)} (${signGz}${pctGz}%) |`,
  ].join('\n');

  console.log('Markdown table:');
  console.log();
  console.log(table);
  console.log();

  if (process.argv.includes('--json')) {
    const json = {
      baseBranch,
      currentBranch,
      minified: { base: base.minified, current: current.minified, diff: diffMin },
      gzipped: { base: base.gzipped, current: current.gzipped, diff: diffGz },
    };
    console.log('JSON:');
    console.log(JSON.stringify(json, null, 2));
  }
} finally {
  // Always clean up the temporary worktree, even on failure. The worktree is
  // unregistered from git first, then the directory is deleted explicitly
  // because git only removes tracked files and leaves node_modules behind.
  console.log(`Removing temp worktree (${worktreeRel})...`);
  git(`worktree remove --force "${worktreeDir}"`, { allowFailure: true });
  if (existsSync(worktreeDir)) {
    rmSync(worktreeDir, { recursive: true, force: true });
  }
  git('worktree prune', { allowFailure: true });
}
