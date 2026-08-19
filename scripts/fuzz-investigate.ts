// Investigation script for fuzz roundtrip mismatches / patch failures.
//
// Usage:
//   npx -y tsx scripts/fuzz-investigate.ts --seed 305
//   npx -y tsx scripts/fuzz-investigate.ts --seed 305 --out local/out305.txt
//   npx -y tsx scripts/fuzz-investigate.ts 305 local/out305.txt   (positional)
//
// With --out the full report is written to that path (created as needed);
// otherwise it is printed to stdout.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { inspect } from 'util';
import { randomToml, SeededRandom } from '../src/__tests__/randomizer';
import { parse, patch } from '../src/index';
import {
  generateMutation,
  applyMutation,
  deepClone,
  randomTomlFormat,
} from '../src/__tests__/fuzz-patch';

function parseArgs(argv: string[]): { seed: number; out?: string } {
  let seed: number | undefined;
  let out: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed') {
      seed = Number(argv[++i]);
    } else if (arg === '--out' || arg === '-o') {
      out = argv[++i];
    } else if (arg.startsWith('--seed=')) {
      seed = Number(arg.slice('--seed='.length));
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else {
      positional.push(arg);
    }
  }
  if (seed === undefined && positional.length > 0) {
    seed = Number(positional[0]);
  }
  if (out === undefined && positional.length > 1) {
    out = positional[1];
  }
  if (seed === undefined || Number.isNaN(seed)) {
    console.error('Usage: npx -y tsx scripts/fuzz-investigate.ts --seed <N> [--out <path>]');
    process.exit(2);
  }
  return { seed, out };
}

const { seed, out } = parseArgs(process.argv.slice(2));

// Everything is captured into `report`, then printed or written to --out.
const report: string[] = [];
const log = (line: string) => report.push(line);

const generated = randomToml({ seed });
const obj = deepClone(parse(generated.toml)) as any;
const format = randomTomlFormat(new SeededRandom(seed + 500000));
const mutationRng = new SeededRandom(seed + 3 * 1000000);
const descs: string[] = [];
for (let i = 0; i < 3; i++) {
  const m = generateMutation(obj, mutationRng);
  if (!m) break;
  applyMutation(obj, m);
  descs.push(`${m.kind} at ${m.path.join('.') || 'root'}`);
}
log(`SEED ${seed}`);
log('MUTATIONS: ' + descs.join(' | '));
log('FORMAT: ' + inspect(format));

try {
  const patchedToml = patch(generated.toml, obj, format);
  const re = parse(patchedToml);
  function diffPaths(a: any, b: any, path = '', outArr: string[] = []): string[] {
    if (Object.is(a, b)) return outArr;
    const ta = typeof a;
    const tb = typeof b;
    if (a === null || b === null || ta !== tb) {
      outArr.push(`${path}: ${inspect(a)} !== ${inspect(b)}`);
      return outArr;
    }
    if (ta !== 'object') {
      outArr.push(`${path}: ${inspect(a)} !== ${inspect(b)}`);
      return outArr;
    }
    if (a instanceof Date && b instanceof Date) {
      if (a.getTime() !== b.getTime()) outArr.push(`${path}: ${inspect(a)} !== ${inspect(b)}`);
      return outArr;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
      outArr.push(`${path}: array mismatch`);
      return outArr;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) { outArr.push(`${path}.${k}: missing in expected`); continue; }
      if (!(k in b)) { outArr.push(`${path}.${k}: extra in got`); continue; }
      diffPaths(a[k], b[k], `${path}.${k}`, outArr);
    }
    return outArr;
  }
  const diffs = diffPaths(obj, re);
  log('DIFFS: ' + diffs.length);
  for (const d of diffs.slice(0, 10)) log('  ' + d);
  if (diffs.length > 0) {
    log('--- EXPECTED (mutated obj) ---');
    log(inspect(obj, { depth: 10 }));
    log('--- GOT (reparsed) ---');
    log(inspect(re, { depth: 10 }));
  }
  log('--- FULL PATCHED ---');
  patchedToml.split('\n').forEach((l, i) => log(`${i + 1}: [${l}]`));
  log('--- FULL ORIGINAL ---');
  generated.toml.split('\n').forEach((l, i) => log(`${i + 1}: [${l}]`));
} catch (e) {
  log('THREW: ' + (e as Error).message);
  log('stack: ' + ((e as Error).stack ?? '').split('\n').slice(0, 12).join('\n'));
  log('--- FULL ORIGINAL ---');
  generated.toml.split('\n').forEach((l, i) => log(`${i + 1}: [${l}]`));
}

const text = report.join('\n') + '\n';
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
} else {
  process.stdout.write(text);
}
