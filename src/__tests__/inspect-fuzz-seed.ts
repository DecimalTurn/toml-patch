/**
 * Inspect a specific fuzz seed: generates the TOML, shows the format,
 * mutations, and the patched output.  Companion to fuzz-patch.ts.
 *
 * Usage: npx tsx src/__tests__/inspect-fuzz-seed.ts <seed> [--mutations M]
 *
 * Examples:
 *   npx tsx src/__tests__/inspect-fuzz-seed.ts 176
 *   npx tsx src/__tests__/inspect-fuzz-seed.ts 464 --mutations 5
 *
 * To save the original TOML to a file:
 *   npx tsx src/__tests__/inspect-fuzz-seed.ts 176 > seed-176.toml
 */
import { randomToml, SeededRandom } from './randomizer';
import { parse, patch, TomlFormat } from '../';

const seed = parseInt(process.argv[2] || '42');
const mutationCount = parseInt(process.argv[4] || '3');

// ─── Helpers (mirror fuzz-patch.ts) ──────────────────────────────────────

function describeFormat(fmt: Partial<TomlFormat> | undefined): string {
  if (!fmt) return 'default';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fmt)) {
    parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return parts.join(', ') || 'empty';
}

function randomTomlFormat(rng: SeededRandom): Partial<TomlFormat> | undefined {
  if (rng.chance(0.5)) return undefined;
  const format: Partial<TomlFormat> = {};
  const itsRoll = rng.next();
  if (itsRoll < 0.25) format.inlineTableStart = 0;
  else if (itsRoll < 0.5) format.inlineTableStart = 1;
  else if (itsRoll < 0.75) format.inlineTableStart = 2;
  format.trailingComma = rng.chance(0.5);
  format.bracketSpacing = rng.chance(0.5);
  format.updateOrder = rng.chance(0.5);
  const tnRoll = rng.next();
  if (tnRoll < 0.33) format.trailingNewline = 0;
  else if (tnRoll < 0.66) format.trailingNewline = 1;
  else format.trailingNewline = 2;
  format.newLine = rng.chance(0.5) ? '\r\n' : '\n';
  format.leadingBom = rng.chance(0.3);
  format.truncateZeroTimeInDates = rng.chance(0.5);
  format.useTabsForIndentation = rng.chance(0.3);
  const mdRoll = rng.next();
  if (mdRoll >= 0.7 && mdRoll < 0.85) format.minimumDecimals = 1;
  else if (mdRoll >= 0.85) format.minimumDecimals = 2;
  return format;
}

function collectPaths(obj: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  const paths: (string | number)[][] = [];
  if (obj == null || typeof obj !== 'object') return paths;
  if (obj instanceof Date) return paths;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      paths.push([...prefix, i]);
      paths.push(...collectPaths(obj[i], [...prefix, i]));
    }
    paths.push([...prefix, obj.length]);
  } else {
    for (const key of Object.keys(obj)) {
      paths.push([...prefix, key]);
      paths.push(...collectPaths((obj as any)[key], [...prefix, key]));
    }
  }
  return paths;
}

function getAt(obj: unknown, path: (string | number)[]): unknown {
  let cur = obj;
  for (const seg of path) {
    if (cur == null) return undefined;
    if (typeof seg === 'number' && Array.isArray(cur)) cur = cur[seg];
    else if (typeof seg === 'string' && typeof cur === 'object') cur = (cur as any)[seg];
    else return undefined;
  }
  return cur;
}

function setAt(obj: any, path: (string | number)[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const next = path[i + 1];
    if (typeof next === 'number') {
      if (!Array.isArray(cur[seg])) cur[seg] = [];
      cur = cur[seg];
    } else {
      if (cur[seg] == null || typeof cur[seg] !== 'object' || Array.isArray(cur[seg])) cur[seg] = {};
      cur = cur[seg];
    }
  }
  const last = path[path.length - 1];
  if (typeof last === 'number' && Array.isArray(cur)) cur[last] = value;
  else if (typeof last === 'string' && typeof cur === 'object') cur[last] = value;
}

function randomValue(rng: SeededRandom): any {
  const r = rng.next();
  if (r < 0.15) return rng.chance(0.5);
  if (r < 0.3) return Math.round(rng.next() * 2000000 - 1000000);
  if (r < 0.45) return Math.round(rng.next() * 1e6) / 100;
  if (r < 0.6) return String.fromCharCode(32 + Math.floor(rng.next() * 90));
  if (r < 0.75) return [Math.round(rng.next() * 100)];
  return new Date(Date.now() + Math.round(rng.next() * 1e12));
}

// ─── Main ────────────────────────────────────────────────────────────────

const generated = randomToml({ seed });
const obj = parse(generated.toml);

const formatRng = new SeededRandom(seed + 500000);
const format = randomTomlFormat(formatRng);

const mutationRng = new SeededRandom(seed + mutationCount * 1000000);
const mutations: string[] = [];
for (let m = 0; m < mutationCount; m++) {
  const paths = collectPaths(obj);
  if (paths.length === 0) break;
  const idx = Math.floor(mutationRng.next() * paths.length);
  const path = paths[idx];
  const kindRoll = mutationRng.next();
  let kind: string;
  if (kindRoll < 0.2) kind = 'add-key';
  else if (kindRoll < 0.4) kind = 'delete-key';
  else if (kindRoll < 0.6) kind = 'change-value';
  else if (kindRoll < 0.8) kind = 'change-type';
  else if (kindRoll < 0.9) kind = 'add-array-item';
  else kind = 'remove-array-item';

  const last = path[path.length - 1];
  if (kind === 'add-key' && typeof last === 'number') continue;
  if (kind === 'delete-key') {
    if (typeof last === 'number') {
      (getAt(obj, path.slice(0, -1)) as any[]).splice(last as number, 1);
    } else {
      const parent = getAt(obj, path.slice(0, -1));
      if (parent && typeof parent === 'object') delete (parent as any)[last];
    }
    mutations.push(`delete ${path.join('.')}`);
  } else if (kind === 'change-value' || kind === 'change-type') {
    setAt(obj, path, randomValue(mutationRng));
    mutations.push(`${kind} at ${path.join('.')}`);
  } else if (kind === 'add-array-item') {
    const arr = getAt(obj, path.slice(0, -1)) as any[];
    if (arr) { arr.splice(last as number, 0, randomValue(mutationRng)); mutations.push(`add-array-item at ${path.join('.')}`); }
  } else if (kind === 'remove-array-item') {
    const arr = getAt(obj, path.slice(0, -1)) as any[];
    if (arr && (last as number) < arr.length) { arr.splice(last as number, 1); mutations.push(`remove-array-item at ${path.join('.')}`); }
  }
}

console.log('=== SEED', seed, '===');
console.log('Mutations:', mutationCount);
console.log('Format:', describeFormat(format));
console.log('Format JSON:', JSON.stringify(format));
console.log();
mutations.forEach(d => console.log('  Mutation:', d));
console.log();
console.log('--- Original TOML ---');
console.log(generated.toml);

console.log('--- Patched TOML ---');
try {
  const patched = patch(generated.toml, obj, format);
  console.log(patched);

  try {
    parse(patched);
    console.log('--- Status: OK (round-trips) ---');
  } catch (e: any) {
    console.log('--- Status: PARSE ERROR ---');
    console.log(e.message);
  }
} catch (e: any) {
  console.log('--- Status: PATCH THREW ---');
  console.log(e.message);
}
