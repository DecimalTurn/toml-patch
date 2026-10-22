/**
 * Structure-first patch fuzzer for arrays-of-tables.
 *
 * Unlike the general randomizer, this generator starts from an abstract AOT
 * document model. It deliberately creates repeated entries, entry-owned
 * sub-tables and nested AOTs, then mutates the parsed arrays.
 */
import { SeededRandom } from './randomizer';
import {
  deepClone,
  deepEqual,
  runFuzz,
  type FuzzContext,
  type GeneratedSource,
  type MutationPlan,
  type MutationStrategy,
  type PatchFuzzResult
} from './fuzz-patch';

interface AotArrayPath {
  path: (string | number)[];
}

interface GeneratedAotDocument {
  source: string;
}

function keyPart(prefix: string, seed: number, index: number): string {
  return `${prefix}${seed.toString(36)}_${index}`;
}

function integer(rng: SeededRandom): number {
  return rng.nextRange(-9999, 9999);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function section(key: string[], array: boolean): string {
  const opener = array ? '[[' : '[';
  const closer = array ? ']]' : ']';
  const rawKey = key
    .map((part) => /^[a-zA-Z0-9_-]+$/.test(part) ? part : quote(part))
    .join('.');
  return `${opener}${rawKey}${closer}`;
}

function makeDirectFamily(
  seed: number,
  family: number,
  rng: SeededRandom,
  blocks: string[]
): void {
  const parent = [keyPart('route_', seed, family)];
  if (rng.chance(0.45)) parent.push(keyPart('branch_', seed, family));
  const parentName = parent.join('.');
  const entries = rng.nextRange(2, 4);

  for (let entry = 0; entry < entries; entry++) {
    blocks.push(section(parent, true));
    blocks.push(`id = ${quote(`${parentName}-${entry}`)}`);
    blocks.push(`weight = ${integer(rng)}`);

    if (rng.chance(0.75)) {
      blocks.push(section([...parent, 'args'], false));
      blocks.push(`value = ${integer(rng)}`);
    }

    if (rng.chance(0.45)) {
      blocks.push(section([...parent, 'meta'], true));
      blocks.push(`kind = ${quote(`${family}-${entry}`)}`);
      blocks.push(`score = ${integer(rng)}`);
    }

    if (rng.chance(0.35)) {
      const noise = keyPart('noise_', seed, family * 10 + entry);
      blocks.push(section([noise], true));
      blocks.push(`value = ${integer(rng)}`);
    }
  }
}

function makeAncestorFamily(
  seed: number,
  family: number,
  rng: SeededRandom,
  blocks: string[]
): void {
  const parent = [keyPart('group_', seed, family)];
  if (rng.chance(0.45)) parent.push(keyPart('cluster_', seed, family));
  const parentName = parent.join('.');
  const nested = `${parentName}.route`;
  const entries = rng.nextRange(2, 4);

  for (let entry = 0; entry < entries; entry++) {
    blocks.push(section(parent, true));
    blocks.push(`id = ${quote(`${parentName}-${entry}`)}`);

    if (entry === 0 || rng.chance(0.55)) {
      const childEntries = rng.nextRange(1, 3);
      blocks.push(section([...parent, 'route'], true));
      for (let child = 0; child < childEntries; child++) {
        if (child > 0) blocks.push(section([...parent, 'route'], true));
        blocks.push(`id = ${quote(`${nested}-${entry}-${child}`)}`);
        blocks.push(`value = ${integer(rng)}`);
      }
    }

    if (entry > 0 && rng.chance(0.8)) {
      blocks.push(section([...parent, 'route', 'args'], false));
      blocks.push(`value = ${integer(rng)}`);
    }

    if (rng.chance(0.45)) {
      const noise = keyPart('noise_', seed, family * 10 + entry);
      blocks.push(section([noise], false));
      blocks.push(`value = ${integer(rng)}`);
    }
  }
}

function makeInterleavedFamily(
  seed: number,
  rng: SeededRandom,
  blocks: string[]
): void {
  const parent = [keyPart('twist_', seed, 0)];
  const branch = [...parent, 'branch'];
  const leaf = [...branch, 'leaf.items'];
  const interlude = [keyPart('interlude_', seed, 0)];
  const leafEntries = rng.nextRange(2, 4);

  blocks.push(section(parent, true));
  blocks.push(`id = ${quote(`first-${seed}`)}`);
  blocks.push(section(interlude, true));
  blocks.push(`value = ${integer(rng)}`);
  blocks.push(section(branch, false));
  blocks.push(`value = ${integer(rng)}`);

  for (let entry = 0; entry < leafEntries; entry++) {
    blocks.push(section(leaf, true));
    blocks.push(`id = ${quote(`${seed}-${entry}`)}`);
    blocks.push(`value = ${integer(rng)}`);
    if (entry === 0 && rng.chance(0.75)) {
      blocks.push(section([...interlude, 'details'], false));
      blocks.push(`value = ${integer(rng)}`);
    }
  }

  blocks.push(section([...branch, 'tail'], false));
  blocks.push(`value = ${integer(rng)}`);
  blocks.push(section(parent, true));
  blocks.push(section(branch, false));
  blocks.push(`value = ${integer(rng)}`);
  blocks.push(section([...branch, 'empty'], false));
  blocks.push(section(leaf, true));
  blocks.push(`id = ${quote(`second-${seed}`)}`);
  blocks.push(`value = ${integer(rng)}`);
}

function generateDocument(seed: number): GeneratedAotDocument {
  const rng = new SeededRandom(seed + 5000000);
  const blocks = [`seed = ${seed}`];
  makeInterleavedFamily(seed, rng, blocks);
  const families = rng.nextRange(2, 4);

  for (let family = 0; family < families; family++) {
    if (rng.chance(0.5)) {
      makeDirectFamily(seed, family, rng, blocks);
    } else {
      makeAncestorFamily(seed, family, rng, blocks);
    }
  }

  return { source: `${blocks.join('\n\n')}\n` };
}

export function generateAotSource({ seed }: Pick<FuzzContext, 'seed'>): GeneratedSource {
  return {
    ...generateDocument(seed),
    description: 'structure-first AOT generator'
  };
}

function getAt(object: any, path: (string | number)[]): any {
  let value = object;
  for (const segment of path) value = value?.[segment];
  return value;
}

function objectArrays(object: any, prefix: (string | number)[] = []): AotArrayPath[] {
  if (!object || typeof object !== 'object') return [];
  if (Array.isArray(object)) {
    const result: AotArrayPath[] = [];
    if (object.length >= 2 && object.every((value) => value && typeof value === 'object' && !Array.isArray(value))) {
      result.push({ path: prefix });
    }
    object.forEach((value, index) => result.push(...objectArrays(value, [...prefix, index])));
    return result;
  }

  return Object.keys(object).flatMap((key) => objectArrays(object[key], [...prefix, key]));
}

function mutateAot(object: any, rng: SeededRandom, first: boolean): MutationPlan | undefined {
  const arrays = objectArrays(object).filter(({ path }) => {
    const value = getAt(object, path);
    return Array.isArray(value) && value.length > (first ? 1 : 0);
  });
  if (arrays.length === 0) return undefined;

  const selected = rng.pick(arrays);
  const array = getAt(object, selected.path) as any[];
  if (first || rng.chance(0.55)) {
    const index = rng.nextInt(array.length);
    array.splice(index, 1);
    return { kind: 'remove-array-item', path: [...selected.path, index] };
  }

  if (rng.chance(0.5)) {
    const copy = deepClone(array[rng.nextInt(array.length)]);
    if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
      (copy as any).added = integer(rng);
      const index = rng.nextInt(array.length + 1);
      array.splice(index, 0, copy);
      return { kind: 'add-array-item', path: [...selected.path, index], newValue: copy };
    }
  }

  const index = rng.nextInt(array.length);
  const value = integer(rng);
  const entry = array[index] as Record<string, unknown>;
  entry.edited = value;
  return {
    kind: 'change-value',
    path: [...selected.path, index, 'edited'],
    newValue: value
  };
}

export const aotMutationStrategy: MutationStrategy = ({ updated, context }) => {
  const mutationDescs: string[] = [];
  const mutationPlans: MutationPlan[] = [];
  for (let mutation = 0; mutation < context.mutationCount; mutation++) {
    const plan = mutateAot(
      updated,
      new SeededRandom(context.seed + mutation * 100003 + 17),
      mutation === 0
    );
    if (!plan) break;
    mutationDescs.push(`${plan.kind} at ${plan.path.join('.')}`);
    mutationPlans.push(plan);
  }
  return { updated, descriptions: mutationDescs, plans: mutationPlans };
};

export function fuzzOne5(seed: number, mutationCount: number): PatchFuzzResult {
  return runFuzz(seed, {
    mutationCount,
    generateSource: generateAotSource,
    mutate: aotMutationStrategy,
    compare: deepEqual,
    variant: '5',
    profile: 'aot'
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const getNumber = (name: string, fallback: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  const count = getNumber('count', 200);
  const start = getNumber('seed', 0);
  const mutations = getNumber('mutations', 1);
  let failures = 0;

  for (let seed = start; seed < start + count; seed++) {
    const fuzzResult = fuzzOne5(seed, mutations);
    if (fuzzResult.status !== 'ok') {
      failures++;
      console.log(`FAIL [seed=${seed}] ${fuzzResult.error ?? fuzzResult.status}`);
    }
  }

  console.log(`fuzz5 complete: ${count} seeds, ${failures} failures`);
  if (failures > 0) process.exit(1);
}
