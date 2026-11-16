/**
 * Structure-first patch fuzzer for deletions and table replacements.
 *
 * Each seed targets dotted-key/header overlap, deleting a table that owns an
 * AOT descendant, or replacing a nested inline-table path.
 */
import { SeededRandom } from './randomizer';
import {
  deepEqual,
  runFuzz,
  type FuzzContext,
  type GeneratedSource,
  type MutationPlan,
  type MutationRun,
  type PatchFuzzResult
} from './fuzz-patch';

type StructuralScenario =
  | {
    kind: 'replace-header-table';
    path: string[];
    replacement: string;
    source: string;
  }
  | {
    kind: 'delete-table-with-aot';
    path: string[];
    source: string;
  }
  | {
    kind: 'replace-inline-table';
    path: string[];
    replacement: number[];
    source: string;
  };

function createScenario(seed: number, mutationIndex: number): StructuralScenario {
  const rng = new SeededRandom(seed + mutationIndex * 100003 + 6000000);
  const suffix = `${Math.abs(seed).toString(36)}_${mutationIndex.toString(36)}`;
  const scenarioKind = ((seed + mutationIndex) % 3 + 3) % 3;

  if (scenarioKind === 0) {
    const root = `table_${suffix}`;
    const child = `child_${suffix}`;
    const sibling = `sibling_${suffix}`;
    const target = `target_${suffix}`;
    const replacement = `value_${suffix}_${rng.nextInt(1000)}`;
    const source = [
      `[${root}]`,
      `${child}.${sibling} = ${JSON.stringify(`keep_${suffix}`)}`,
      '',
      `[${root}.${child}.${target}]`,
      `value = ${rng.nextRange(-999, 999)}`
    ].join('\n') + '\n';

    return {
      kind: 'replace-header-table',
      path: [root, child, target],
      replacement,
      source
    };
  }

  if (scenarioKind === 1) {
    const root = `table_${suffix}`;
    const child = `child_${suffix}`;
    const sibling = `sibling_${suffix}`;
    const aot = `items_${suffix}`;
    const source = [
      `[${root}]`,
      `${child}.${sibling} = ${JSON.stringify(`keep_${suffix}`)}`,
      '',
      `[[${root}.${child}.${aot}]]`,
      `value = ${rng.nextRange(-999, 999)}`
    ].join('\n') + '\n';

    return {
      kind: 'delete-table-with-aot',
      path: [root, child],
      source
    };
  }

  const root = `inline_${suffix}`;
  const child = `child_${suffix}`;
  const target = `target_${suffix}`;
  const left = `left_${suffix}`;
  const right = `right_${suffix}`;
  const replacement = [rng.nextRange(-99, 99), rng.nextRange(-99, 99)];
  const source = `${root} = { ${child}.${target}.${left} = ${rng.nextRange(-999, 999)}, ${child}.${target}.${right} = ${rng.nextRange(-999, 999)} }\n`;

  return {
    kind: 'replace-inline-table',
    path: [root, child, target],
    replacement,
    source
  };
}

function recordAtPath(value: unknown, path: string[]): Record<string, unknown> {
  let current = value;
  for (let index = 0; index < path.length; index++) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || current instanceof Date) {
      throw new Error(`Expected a table at ${path.slice(0, index).join('.') || '<root>'}.`);
    }
    current = (current as Record<string, unknown>)[path[index]];
  }

  if (!current || typeof current !== 'object' || Array.isArray(current) || current instanceof Date) {
    throw new Error(`Expected a table at ${path.join('.') || '<root>'}.`);
  }
  return current as Record<string, unknown>;
}

function generateStructuralSource(
  { seed, mutationCount }: Pick<FuzzContext, 'seed' | 'mutationCount'>
): GeneratedSource {
  const scenarios = Array.from({ length: mutationCount }, (_, index) => createScenario(seed, index));
  const inlineScenarios = scenarios.filter(scenario => scenario.kind === 'replace-inline-table');
  const sectionScenarios = scenarios.filter(scenario => scenario.kind !== 'replace-inline-table');
  return {
    source: [...inlineScenarios, ...sectionScenarios].map(scenario => scenario.source).join('\n'),
    description: 'dotted-key, AOT-deletion, and inline-table structural cases'
  };
}

function mutateStructuralCases({
  updated,
  context
}: {
  original: unknown;
  updated: unknown;
  context: FuzzContext;
}): MutationRun {
  const descriptions: string[] = [];
  const plans: MutationPlan[] = [];

  for (let index = 0; index < context.mutationCount; index++) {
    const scenario = createScenario(context.seed, index);
    const path = scenario.path;
    const parent = recordAtPath(updated, path.slice(0, -1));
    const key = path[path.length - 1];

    switch (scenario.kind) {
      case 'replace-header-table':
        parent[key] = scenario.replacement;
        descriptions.push(`replace header-defined table with scalar at ${path.join('.')}`);
        plans.push({ kind: scenario.kind, path, newValue: scenario.replacement });
        break;
      case 'delete-table-with-aot':
        delete parent[key];
        descriptions.push(`delete table with nested AOT descendant at ${path.join('.')}`);
        plans.push({ kind: scenario.kind, path });
        break;
      case 'replace-inline-table':
        parent[key] = scenario.replacement;
        descriptions.push(`replace inline table subtree with array at ${path.join('.')}`);
        plans.push({ kind: scenario.kind, path, newValue: scenario.replacement });
        break;
    }
  }

  return { updated, descriptions, plans };
}

export function fuzzOne6(seed: number, mutationCount: number): PatchFuzzResult {
  return runFuzz(seed, {
    mutationCount,
    generateSource: generateStructuralSource,
    generateFormat: () => undefined,
    mutate: mutateStructuralCases,
    compare: deepEqual,
    variant: '6',
    profile: 'structural-replacements'
  });
}
