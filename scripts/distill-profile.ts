import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MutationPlan } from '../src/__tests__/fuzz-patch';
import { runProfile, type FuzzProfile } from '../src/__tests__/fuzz-profiles';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const seed = Number(arg('--seed'));
const profile = arg('--profile') as FuzzProfile | undefined;
const mutationCount = Number(arg('--mutations') ?? '1');
const output = arg('--out');
const supportedProfiles: FuzzProfile[] = ['aot', 'aot-format', 'aot-general'];

if (!Number.isInteger(seed) || !profile || !supportedProfiles.includes(profile) || !output) {
  throw new Error(
    'Usage: npx -y tsx scripts/distill-profile.ts --seed N --profile aot|aot-format|aot-general --out path [--mutations N]'
  );
}

const fuzzResult = runProfile(seed, profile, mutationCount);
if (fuzzResult.status === 'ok' || !fuzzResult.originalToml || !fuzzResult.mutationPlans) {
  throw new Error(`Seed ${seed} is not a replayable ${profile} failure: ${fuzzResult.status}`);
}

function sourceLiteral(source: string): string {
  return source
    .split('\n')
    .map(line => `    ${line.replaceAll('`', '\\`').replaceAll('${', '\\${')}`)
    .join('\n');
}

function valueSource(value: unknown): string {
  return JSON.stringify(value);
}

function mutationSource(plan: MutationPlan): string {
  const path = `obj${plan.path.map(segment => typeof segment === 'number'
    ? `[${segment}]`
    : `[${JSON.stringify(segment)}]`).join('')}`;
  if (plan.kind === 'remove-array-item') {
    const index = plan.path.at(-1);
    const parent = `obj${plan.path.slice(0, -1).map(segment => typeof segment === 'number'
      ? `[${segment}]`
      : `[${JSON.stringify(segment)}]`).join('')}`;
    return `${parent}.splice(${index}, 1);`;
  }
  if (plan.kind === 'add-array-item') {
    const index = plan.path.at(-1);
    const parent = `obj${plan.path.slice(0, -1).map(segment => typeof segment === 'number'
      ? `[${segment}]`
      : `[${JSON.stringify(segment)}]`).join('')}`;
    return `${parent}.splice(${index}, 0, ${valueSource(plan.newValue)});`;
  }
  return `${path} = ${valueSource(plan.newValue)};`;
}

const format = JSON.stringify(fuzzResult.format ?? undefined);
const body = [
  `test.fails('distilled ${profile} regression for fuzz seed ${seed}', () => {`,
  '  const src = dedent`',
  sourceLiteral(fuzzResult.originalToml),
  '  `;',
  '  const obj = parse(src) as any;',
  ...fuzzResult.mutationPlans.map(plan => `  ${mutationSource(plan)}`),
  '',
  `  const result = patch(src, obj, ${format});`,
  '  expect(parse(result)).toEqual(obj);',
  '});',
  ''
].join('\n');

writeFileSync(resolve(output), [
  "import patch from '../src/patch';",
  "import { parse } from '../src';",
  "import dedent from 'dedent';",
  '',
  body
].join('\n'));
console.log(JSON.stringify({
  seed,
  profile,
  status: fuzzResult.status,
  mutations: fuzzResult.mutationPlans.length,
  output: resolve(output)
}));
