import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Mutation {
  kind: string;
  path: (string | number)[];
  newValue?: unknown;
}

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const seed = Number(arg('--seed'));
const target = resolve(arg('--target', process.cwd())!);
const output = arg('--out');
const maxPasses = Number(arg('--passes', '4'));
if (!Number.isInteger(seed) || !output) {
  throw new Error('Usage: npx -y tsx scripts/distill-seed.ts --seed N --out path [--target path]');
}

const importFromTarget = async (relativePath: string) => {
  const url = pathToFileURL(resolve(target, relativePath)).href;
  return import(url);
};
const randomizer = await importFromTarget('src/__tests__/randomizer.ts');
const fuzz = await importFromTarget('src/__tests__/fuzz-patch.ts');
const api = await importFromTarget('src/index.ts');
const { randomToml, SeededRandom } = randomizer;
const { parse, patch } = api;
const { generateMutation, applyMutation, deepClone, randomTomlFormat } = fuzz;

const generated = randomToml({ seed });
const originalObject = deepClone(parse(generated.toml));
const mutationCount = 3;
const mutationRng = new SeededRandom(seed + mutationCount * 1_000_000);
const mutations: Mutation[] = [];
const mutationObject = deepClone(originalObject) as any;
const aotKeyPaths = new Set<string>();
const collectAotKeys = (node: any) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'TableArray' && node.key?.item) {
    aotKeyPaths.add((node.key.item.value as string[]).join('.'));
  }
  if (Array.isArray(node.items)) for (const item of node.items) collectAotKeys(item);
  if (node.value) collectAotKeys(node.value);
  if (node.item) collectAotKeys(node.item);
};
collectAotKeys(generated.document);
const isTableLike = (value: unknown) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
let attempts = 0;
while (mutations.length < mutationCount && attempts < mutationCount * 5) {
  attempts++;
  const mutation = generateMutation(mutationObject, mutationRng);
  if (!mutation) break;
  if (mutation.newValue !== undefined && !isTableLike(mutation.newValue)) {
    const last = mutation.path.at(-1);
    const parentPath = mutation.path.slice(0, -1);
    const stringPath = parentPath.filter(segment => typeof segment === 'string').join('.');
    if (typeof last === 'number' && aotKeyPaths.has(stringPath)) continue;
  }
  applyMutation(mutationObject, mutation);
  mutations.push(mutation);
}
const format = randomTomlFormat(new SeededRandom(seed + 500_000));

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return value;
  }
  if (value instanceof Date) return `Date:${value.constructor.name}:${value.getTime()}:${value.toISOString()}`;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) result[key] = normalize((value as any)[key]);
    return result;
  }
  return value;
}

function getAt(object: any, path: (string | number)[]): unknown {
  let current = object;
  for (const segment of path) {
    if (current == null) return undefined;
    current = current[segment as any];
  }
  return current;
}

function canReplay(object: any, mutation: Mutation): boolean {
  const parent = getAt(object, mutation.path.slice(0, -1));
  if (parent == null || typeof parent !== 'object') return false;
  const last = mutation.path[mutation.path.length - 1];
  if (mutation.kind === 'delete-key' || mutation.kind === 'remove-array-item') {
    return getAt(object, mutation.path) !== undefined;
  }
  if (mutation.kind === 'add-array-item') {
    return Array.isArray(parent) && typeof last === 'number' && last <= parent.length;
  }
  return getAt(object, mutation.path) !== undefined;
}

function isFailure(source: string, testMutations: Mutation[] = mutations): boolean {
  let object: any;
  try {
    object = deepClone(parse(source));
  } catch {
    return false;
  }
  try {
    for (const mutation of testMutations) {
      if (!canReplay(object, mutation)) return false;
      applyMutation(object, mutation);
    }
    const result = patch(source, object, format);
    const reparsed = parse(result);
    return JSON.stringify(normalize(object)) !== JSON.stringify(normalize(reparsed));
  } catch {
    return true;
  }
}

function removeRange(lines: string[], start: number, end: number): string {
  return lines.slice(0, start).concat(lines.slice(end)).join('\n');
}

let lines = generated.toml.split(/\r?\n/);
if (lines.at(-1) === '') lines.pop();
if (!isFailure(lines.join('\n'))) {
  throw new Error(`Seed ${seed} is not a failure under target ${target}`);
}

for (let pass = 0; pass < maxPasses; pass++) {
  let granularity = 2;
  let changed = false;
  while (granularity <= lines.length) {
    const chunkSize = Math.ceil(lines.length / granularity);
    let removed = false;
    for (let start = 0; start < lines.length; start += chunkSize) {
      const end = Math.min(lines.length, start + chunkSize);
      const candidate = removeRange(lines, start, end);
      if (!candidate || isFailure(candidate)) {
        lines.splice(start, end - start);
        removed = true;
        changed = true;
        break;
      }
    }
    if (removed) {
      granularity = Math.max(2, granularity - 1);
    } else if (granularity < lines.length) {
      granularity = Math.min(lines.length, granularity * 2);
    } else {
      break;
    }
  }
  if (!changed) break;
}

// Remove mutations that do not contribute to the failure, then run the line reducer
// again because a shorter mutation list often makes unrelated source structure removable.
for (let index = mutations.length - 1; index >= 0; index--) {
  const candidateMutations = mutations.slice(0, index).concat(mutations.slice(index + 1));
  if (candidateMutations.length > 0 && isFailure(lines.join('\n'), candidateMutations)) {
    mutations.splice(index, 1);
  }
}
for (let pass = 0; pass < maxPasses; pass++) {
  let changed = false;
  for (let index = lines.length - 1; index >= 0; index--) {
    const candidate = lines.slice(0, index).concat(lines.slice(index + 1)).join('\n');
    if (candidate && isFailure(candidate)) {
      lines.splice(index, 1);
      changed = true;
    }
  }
  if (!changed) break;
}

function valueToSource(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (value instanceof Date) {
    return `new Date(Date.UTC(${value.getUTCFullYear()}, ${value.getUTCMonth()}, ${value.getUTCDate()}))`;
  }
  if (Array.isArray(value)) return `[${value.map(valueToSource).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}: ${valueToSource(item)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

function accessor(path: (string | number)[]): string {
  return 'obj' + path.map(segment => typeof segment === 'number'
    ? `[${segment}]`
    : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)
      ? `.${segment}`
      : `[${JSON.stringify(segment)}]`).join('');
}

function mutationSource(mutation: Mutation): string {
  const last = mutation.path.at(-1);
  if (mutation.kind === 'delete-key') return `delete ${accessor(mutation.path)};`;
  if (mutation.kind === 'remove-array-item') return `${accessor(mutation.path.slice(0, -1))}.splice(${last}, 1);`;
  if (mutation.kind === 'add-array-item') {
    return `${accessor(mutation.path.slice(0, -1))}.splice(${last}, 0, ${valueToSource(mutation.newValue)});`;
  }
  return `${accessor(mutation.path)} = ${valueToSource(mutation.newValue)};`;
}

function formatSource(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value, null, 2)
    .replace(/"([A-Za-z_$][A-Za-z0-9_$]*)":/g, '$1:')
    .replace(/"\\r\\n"/g, "'\\r\\n'")
    .replace(/"\\n"/g, "'\\n'");
}

const source = lines.join('\n');
const postFixObject: any = deepClone(parse(source));
for (const mutation of mutations) applyMutation(postFixObject, mutation);
const expected = patch(source, postFixObject, format);
const body = [
  `test.fails('distilled regression for fuzz seed ${seed}', () => {`,
  '  const src = dedent`',
  ...source.split('\n').map(line => `    ${line.replaceAll('`', '\\`').replaceAll('${', '\\${')}`),
  '  `;',
  '',
  '  const obj = parse(src) as any;',
  ...mutations.map(mutation => `  ${mutationSource(mutation)}`),
  '',
  `  const result = patch(src, obj, ${formatSource(format)});`,
  '  expect(parse(result)).toEqual(obj);',
  '  // TODO: assert exact output after the implementation fix.',
  `  // expect(result).toEqual(${JSON.stringify(expected)});`,
  '});',
  ''
].join('\n');
writeFileSync(resolve(output), body);
console.log(JSON.stringify({ seed, target, lines: lines.length, mutations: mutations.map(mutation => `${mutation.kind} ${mutation.path.join('.')}`) }));
