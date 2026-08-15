// Generates a distilled regression test from a fuzz seed and appends it to
// src/__tests__/patch.test.ts.
//
// Usage:
//   npx -y tsx scripts/generate-seed-test.ts --seed 305
//   npx -y tsx scripts/generate-seed-test.ts --seed 305 --mutations 3
//
// The generated test:
//   - holds the seed's TOML document in a `dedent` template literal;
//   - replays the exact same mutations as plain JS statements (`splice`,
//     `delete`, `obj.x = …`);
//   - asserts both `parse(result)` deep-equality AND the exact patched text
//     (via `toEqual(dedent…)`) when the patch round-trips;
//   - is appended to `patch.test.ts` (indented, under a seed-labelled test).

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { randomToml, SeededRandom } from '../src/__tests__/randomizer';
import { parse, patch } from '../src/index';
import { generateMutation, applyMutation, deepClone } from '../src/__tests__/fuzz-patch';

function parseArgs(argv: string[]) {
  let seed: number | undefined;
  let mutations = 3;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') seed = Number(argv[++i]);
    else if (a.startsWith('--seed=')) seed = Number(a.slice('--seed='.length));
    else if (a === '--mutations') mutations = Number(argv[++i]);
    else if (a.startsWith('--mutations=')) mutations = Number(a.slice('--mutations='.length));
    else if (a === '--dry-run') dryRun = true;
    else if (i === 0 && !a.startsWith('-')) seed = Number(a);
  }
  if (seed === undefined || Number.isNaN(seed)) {
    console.error('Usage: npx -y tsx scripts/generate-seed-test.ts --seed <N> [--mutations <N>] [--dry-run]');
    process.exit(2);
  }
  return { seed, mutations, dryRun };
}

const { seed, mutations, dryRun } = parseArgs(process.argv.slice(2));

// Recompute the deterministic seed state and mutations.
const generated = randomToml({ seed });
const obj = deepClone(parse(generated.toml)) as any;
const mutationRng = new SeededRandom(seed + mutations * 1000000);
const applied: { kind: string; path: (string | number)[]; newValue?: unknown }[] = [];
for (let i = 0; i < mutations; i++) {
  const m = generateMutation(obj, mutationRng);
  if (!m) break;
  applyMutation(obj, m);
  applied.push(m);
}

// ─── Emit the mutation as a plain-JS statement against variable `obj` ────

/** Serialize a JS value to a source literal that reconstructs it. */
function valueToSource(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (v === Infinity) return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    return String(v);
  }
  if (t === 'boolean') return String(v);
  if (t === 'bigint') return `${v}n`;
  if (v instanceof Date) {
    // Emit a plain Date via Date.UTC so re-parse comparisons stay stable.
    return `new Date(Date.UTC(${v.getUTCFullYear()}, ${v.getUTCMonth()}, ${v.getUTCDate()}))`;
  }
  if (Array.isArray(v)) {
    return `[${v.map(valueToSource).join(', ')}]`;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    return `{ ${entries.map(([k, val]) => `${toKey(k)}: ${valueToSource(val)}`).join(', ')} }`;
  }
  return JSON.stringify(v);
}

function toKey(k: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
}

/** A dotted accessor for a path segment chain off `obj`. */
function accessor(path: (string | number)[]): string {
  return 'obj' + path.map((seg) =>
    typeof seg === 'number' ? `[${seg}]` : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg) ? `.${seg}` : `[${JSON.stringify(seg)}]`
  ).join('');
}

function emitMutation(m: { kind: string; path: (string | number)[]; newValue?: unknown }): string {
  const p = m.path;
  switch (m.kind) {
    case 'remove-array-item': {
      // Removing one array element at p's last segment.
      return `${accessor(p.slice(0, -1))}.splice(${p[p.length - 1]}, 1);`;
    }
    case 'add-array-item': {
      // push was used by addToArray when idx === length; replicate faithfully
      // by splicing at the recorded index.
      const idx = p[p.length - 1] as number;
      return `${accessor(p.slice(0, -1))}.splice(${idx}, 0, ${valueToSource(m.newValue)});`;
    }
    case 'delete-key':
      return `delete ${accessor(p)};`;
    case 'change-value':
    case 'change-type':
    case 'add-key':
      return `${accessor(p)} = ${valueToSource(m.newValue)};`;
    default:
      return '// unknown mutation';
  }
}

// ─── Compute the patched output for the `toEqual` expectation ────────────
let expectedText: string | undefined;
let roundtrips = false;
try {
  const out = patch(generated.toml, obj);
  const re = parse(out);
  // A rough round-trip sanity check: deep equality via JSON (dates/bigint
  // normalised away). If it doesn't match, we still emit the test but skip the
  // exact-text expectation and use only the parse(result) deep-equality.
  roundtrips = stableEquals(re, obj);
  expectedText = out;
} catch {
  expectedText = undefined;
}

function stableEquals(a: unknown, b: unknown): boolean {
  try {
    const norm = (x: unknown): unknown => {
      if (typeof x === 'bigint') return `${x}n`;
      if (typeof x === 'number' && !Number.isFinite(x)) return String(x);
      if (x instanceof Date) return `D:${x.getTime()}`;
      if (Array.isArray(x)) return x.map(norm);
      if (x && typeof x === 'object') {
        const acc: Record<string, unknown> = {};
        for (const k of Object.keys(x as object)) acc[k] = norm((x as any)[k]);
        return acc;
      }
      return x;
    };
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  } catch {
    return false;
  }
}

// ─── Assemble the test body ──────────────────────────────────────────────

/** Escape a string so it can be embedded verbatim inside a `dedent` template
 *  literal (backticks and `${` are the only hazards). */
function dedentLiteral(s: string, indent: number): string {
  const pad = ' '.repeat(indent);
  const escaped = s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  // Each line is indented by `indent`; dedent strips the common margin when
  // the closing backtick sits at that same margin (see the body assembly).
  return escaped.split('\n').map((line) => pad + line).join('\n');
}

const srcLiteral = dedentLiteral(generated.toml.trimEnd(), 6);

const mutationLines = applied.map(emitMutation).map((line) => `  ${line}`).join('\n');

// Exact-output expectation, only when the patch round-trips cleanly.
const outLiteral = expectedText !== undefined && roundtrips
  ? dedentLiteral(expectedText.trimEnd(), 6)
  : undefined;

const testBody = `
test('regression for fuzz seed ${seed}', () => {
  const src = dedent\`
${srcLiteral}
    \`;

  const obj = parse(src) as any;
${mutationLines}

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);${outLiteral !== undefined ? `
  expect(result).toEqual(dedent\`
${outLiteral}
    \`);` : `
  // TODO: Change the expected value to match the actual expected result after
  // applying the edits to the src (and fixing the patch function).
  // expect(result).toEqual(dedent\`
  //     [...]
  //     \`);`}
});
`;

// ─── Append to patch.test.ts ─────────────────────────────────────────────
if (dryRun) {
  console.log('--- DRY RUN: generated test body ---');
  console.log(testBody);
  process.exit(0);
}

const target = 'src/__tests__/patch.test.ts';
if (!existsSync(target)) {
  console.error(`target not found: ${target}`);
  process.exit(1);
}
// Ensure a trailing newline before the appended test so the file stays valid.
const current = readFileSync(target, 'utf8');
const sep = current.endsWith('\n') ? '' : '\n';
appendFileSync(target, sep + testBody + '\n');
console.log(`Appended "regression for fuzz seed ${seed}" to ${target}`);
console.log('  mutations:', applied.map((m) => `${m.kind} ${m.path.join('.')}`).join(' | '));
console.log('  roundtrips:', roundtrips);
