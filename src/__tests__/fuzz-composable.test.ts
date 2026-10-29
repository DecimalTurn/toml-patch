import { createHash } from 'node:crypto';
import { runFuzz } from './fuzz-patch';
import {
  createDefaultMutationStrategy,
  deepClone,
  deepEqual,
  generateDefaultSource,
  shortenFractionalSeconds,
  type FuzzContext,
  type PatchFuzzResult
} from './fuzz-patch';
import { parse } from '../index';
import { spaceDottedKeySeparators } from './fuzz-patch2';
import { aotMutationStrategy, fuzzOne5, generateAotSource } from './fuzz-patch5';
import { fuzzOne1 } from './fuzz-patch1';
import { fuzzOne2 } from './fuzz-patch2';
import { fuzzOne3 } from './fuzz-patch3';
import { fuzzOne4 } from './fuzz-patch4';
import { profileConfig, runProfile, type FuzzProfile } from './fuzz-profiles';
import { SeededRandom } from './randomizer';
import { mutationSource, scaffoldImports, valueSource } from '../../scripts/distill-profile';

const profiles: FuzzProfile[] = ['aot', 'aot-format', 'aot-general', 'general-format'];

const legacySeedExpectations = {
  '1': {
    0: {
      mutationDescs: ['change-value at 3M^8Q1-]kg.W)XM|.0.a3m7', 'add-array-item at y.d1k7c313.vcfj6vg.1', 'change-value at upf84-6ji.l. RVJ5PT4'],
      formatDesc: 'inlineTableStart=1, trailingComma=true, bracketSpacing=true, updateOrder=false, trailingNewline=0, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=true, useTabsForIndentation=false'
    },
    3: {
      mutationDescs: ['change-value at d_jhqloi.0.vii.tlt6cr4', 'change-value at {>Q/JPH.sJyzWL`$vu.osicmyd30e', 'change-value at d_jhqloi.0.vii'],
      formatDesc: 'inlineTableStart=2, trailingComma=true, bracketSpacing=false, updateOrder=false, trailingNewline=2, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=false, useTabsForIndentation=false'
    },
    19506: {
      mutationDescs: ['change-type at hbc82', 'remove-array-item at 0+NO.d7ajqfg4.3', 'delete-key at nMgnO}|'],
      formatDesc: 'default'
    }
  },
  '2': {
    0: {
      mutationDescs: ['change-value at 3M^8Q1-]kg.W)XM|.0.a3m7', 'add-array-item at y.d1k7c313.vcfj6vg.1', 'change-value at upf84-6ji.l. RVJ5PT4'],
      formatDesc: 'inlineTableStart=1, trailingComma=true, bracketSpacing=true, updateOrder=false, trailingNewline=0, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=true, useTabsForIndentation=false, indentWidth=1, minimumDecimals=1, multilineTable=1, multilineArray=0'
    },
    3: {
      mutationDescs: ['change-value at d_jhqloi.0.vii.tlt6cr4', 'change-value at {>Q/JPH.sJyzWL`$vu.osicmyd30e', 'change-value at d_jhqloi.0.vii'],
      formatDesc: 'inlineTableStart=2, trailingComma=true, bracketSpacing=false, updateOrder=false, trailingNewline=2, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=false, useTabsForIndentation=false, indentWidth=3, multilineTable=2, multilineArray="auto"'
    },
    19506: {
      mutationDescs: ['change-type at hbc82', 'remove-array-item at 0+NO.d7ajqfg4.3', 'delete-key at nMgnO}|'],
      formatDesc: 'default'
    }
  },
  '3': {
    0: {
      mutationDescs: ['change-value at 3M^8Q1-]kg.W)XM|.0.a3m7', 'add-array-item at y.d1k7c313.vcfj6vg.1', 'change-value at upf84-6ji.l. RVJ5PT4'],
      formatDesc: 'inlineTableStart=1, trailingComma=true, bracketSpacing=true, updateOrder=false, trailingNewline=0, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=true, useTabsForIndentation=false, indentWidth=1, minimumDecimals=1, multilineTable=1, multilineArray=0'
    },
    3: {
      mutationDescs: ['change-value at d_jhqloi.0.vii.tlt6cr4', 'change-value at {>Q/JPH.sJyzWL`$vu.osicmyd30e', 'change-value at d_jhqloi.0.vii'],
      formatDesc: 'inlineTableStart=2, trailingComma=true, bracketSpacing=false, updateOrder=false, trailingNewline=2, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=false, useTabsForIndentation=false, indentWidth=3, multilineTable=2, multilineArray="auto"'
    },
    19506: {
      mutationDescs: ['change-type at hbc82', 'remove-array-item at 0+NO.d7ajqfg4.3', 'delete-key at nMgnO}|'],
      formatDesc: 'default'
    }
  },
  '4': {
    0: {
      mutationDescs: ['change-value at vdzm5rh2r.GI.0.g4oy32w.cr96', 'change-value at 3M^8Q1-]kg.W)XM|.0.i9sc.jt1-', 'change-value at 3M^8Q1-]kg.W)XM|.0.i9sc.jt1-.1'],
      formatDesc: 'inlineTableStart=1, trailingComma=true, bracketSpacing=true, updateOrder=false, trailingNewline=0, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=true, useTabsForIndentation=false, indentWidth=1, minimumDecimals=1, multilineTable=1, multilineArray=0, escapeSequenceUpperCase=false'
    },
    3: {
      mutationDescs: ['change-value at {>Q/JPH.sJyzWL`$vu.osicmyd30e.u.p$`D>yLCmG.ljn.KYNviF', 'change-value at {>Q/JPH.sJyzWL`$vu.osicmyd30e.u.p$`D>yLCmG.ljn.KYNviF', 'change-type at IS'],
      formatDesc: 'inlineTableStart=2, trailingComma=true, bracketSpacing=false, updateOrder=false, trailingNewline=2, newLine="\\n", leadingBom=false, truncateZeroTimeInDates=false, useTabsForIndentation=false, indentWidth=3, multilineTable=2, multilineArray="auto", escapeSequenceUpperCase=true'
    },
    19506: {
      mutationDescs: ['change-value at 0+NO.d7ajqfg4.4.etmlkpp8.gorcw.vf5`', 'change-value at 0+NO.d7ajqfg4.4.qp0.V_13PFgV', 'change-value at 0+NO.d7ajqfg4.4.qp0.V_13PFgV'],
      formatDesc: 'default'
    }
  }
} as const;

const numberedRunners = { '1': fuzzOne1, '2': fuzzOne2, '3': fuzzOne3, '4': fuzzOne4 } as const;

function normalizeFingerprintValue(value: unknown): unknown {
  if (value instanceof Date) return { $type: 'Date', value: value.toISOString() };
  if (typeof value === 'bigint') return { $type: 'BigInt', value: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $type: 'Number', value: String(value) };
  }
  if (typeof value === 'number' && Object.is(value, -0)) {
    return { $type: 'Number', value: '-0' };
  }
  if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [
        key,
        normalizeFingerprintValue((value as Record<string, unknown>)[key])
      ])
    );
  }
  if (value === undefined) return { $type: 'Undefined' };
  return value;
}

function fuzzResultFingerprint(result: PatchFuzzResult): string {
  const snapshot = {
    status: result.status,
    mutationDescs: result.mutationDescs ?? [],
    mutationPlans: result.mutationPlans ?? [],
    format: result.format ?? null,
    formatDesc: result.formatDesc ?? 'default'
  };
  return createHash('sha256')
    .update(JSON.stringify(normalizeFingerprintValue(snapshot)))
    .digest('hex');
}

// Captured from the original fuzzOne implementation at latest commit
// 83cc17388601db8091c0014a6aa80d01307a3e8d. Temporary instrumentation exposed
// plans and format values without changing RNG calls or mutation order.
const legacyResultFingerprints = {
  '1': {
    0: '281b1b67cdd1c74a42247514758f42b538b0bc8f4c4fc643ccb256ec861f2184',
    3: 'fa54922a144f72e9c93c792bc12c495d53200e81c66037b9501c9701289953f3',
    19506: 'abf37bb754ccb6da2e12774a48e1cc894354029a4211460fc4d8f6c13a77626f'
  },
  '2': {
    0: '18c0b7cc2c6d43b3b39e47e28ba9e26f5d888a120d8b4ea92bf997a95ecef275',
    3: '2df0579ca594ef5101bf6396f808b7dbf8a5acbd9e0b1635a2bf9fcfc072c3da',
    19506: 'abf37bb754ccb6da2e12774a48e1cc894354029a4211460fc4d8f6c13a77626f'
  },
  '3': {
    0: '18c0b7cc2c6d43b3b39e47e28ba9e26f5d888a120d8b4ea92bf997a95ecef275',
    3: '2df0579ca594ef5101bf6396f808b7dbf8a5acbd9e0b1635a2bf9fcfc072c3da',
    19506: 'abf37bb754ccb6da2e12774a48e1cc894354029a4211460fc4d8f6c13a77626f'
  },
  '4': {
    0: 'b655165a0df11a019020dc05190644d09ad5ec7bbadb24a55226b27f878cc1f0',
    3: '3bcffc7974c40ad6cf406c604d3daeff7c7216bfd37d98e30b2744c901694ec2',
    19506: 'a71fde8e017957391bc71f457c52e1b7e12a6c070ac37d49d609788aba65ce7f'
  }
} as const;

const latestVariant4OneMutationFingerprints = {
  1: 'c1a5b21c506aaa3c60caa117423b1e65b6d6fe5c7c6ef6d2e2e2f54d45366b53',
  3: 'cac385c16bfd506125f5458c253d8b3ffbf7ca61738aeb4b4f894273d94aea0c',
  4: '90f644f9567fef32bc1eb5bc2bc3537fa2951df32a69c17555eef83e908ffba7'
} as const;

const profileResultFingerprints = {
  aot: {
    1: '3a70bf7c93904c99ab7ac7fbb39db1f1f28129c59eea4c85367a1b3f8ca4b4bb',
    3: '679da4c854edff4fcf95ce4def141a69a9c04fed3b2c364cceab2292dadb40cf',
    4: '7bd578ac1bee8bf8bc23484a18a519b423047f01cfe4566f5f4277de78dea99e'
  },
  'aot-format': {
    1: '3a70bf7c93904c99ab7ac7fbb39db1f1f28129c59eea4c85367a1b3f8ca4b4bb',
    3: '58e5fe8b0fffad65a2d677cfe1ebceb3fd5e7a5efd37be6ee48d079a941062d4',
    4: 'd8ed59e4c1a2ab127df3c89633954397aa7b0a9323b8d9219710f8a8fe6ba891'
  },
  'aot-general': {
    1: '3a0949ba27788b7ee69edb2eccd750d30fdd2780a4ee10356a7c0f73810b5021',
    3: '8a8430f723266a62938c2ae87d690fe6d7bce4b8f3d695a106b4413a002c16c1',
    4: 'f4c75a8d881e29a70991d879dd1d988c5192ce9a5645508f53fedc685ca1a3b9'
  },
  'general-format': latestVariant4OneMutationFingerprints
} as const;

describe('composable patch fuzz profiles', () => {
  test('default mutation plans snapshot inserted object values', () => {
    const original = {
      rows: [
        { id: 'a', items: [{ value: 1 }, { value: 2 }] },
        { id: 'b', items: [{ value: 3 }, { value: 4 }] }
      ]
    };
    const updated = deepClone(original) as typeof original;
    const result = createDefaultMutationStrategy()({
      original,
      updated,
      context: {
        seed: 10,
        mutationCount: 5,
        source: '',
        generated: { source: '' }
      }
    });
    const plan = result.plans?.find(item =>
      item.kind === 'add-array-item' && item.newValue !== null && typeof item.newValue === 'object'
    );
    const [key, index] = plan?.path ?? [];

    expect(plan).toBeDefined();
    expect(plan?.newValue).not.toBe((result.updated as any)[key as string][index as number]);
  });

  test('AOT mutation plans snapshot inserted object values', () => {
    const generated = generateAotSource({ seed: 1 });
    const original = parse(generated.source);
    const updated = deepClone(original);
    const result = aotMutationStrategy({
      original,
      updated,
      context: { seed: 1, mutationCount: 1, source: generated.source, generated }
    });
    const plan = result.plans?.[0];
    const getAtPath = (value: any, path: (string | number)[]) =>
      path.reduce((current, segment) => current?.[segment], value);

    expect(plan?.kind).toBe('add-array-item');
    expect(plan?.newValue).not.toBe(getAtPath(result.updated, plan?.path ?? []));
  });

  test('the fuzz5 runner uses the default format policy of the aot profile', () => {
    const runner = fuzzOne5(17, 1);
    const profile = runProfile(17, 'aot', 1);

    expect(runner.formatDesc).toBe('default');
    expect(profile.formatDesc).toBe(runner.formatDesc);
  });

  test('distilled scaffolds resolve imports from the output directory', () => {
    expect(scaffoldImports('src/__tests__/distilled-aot.test.ts')).toEqual([
      "import patch from '../patch';",
      "import { parse } from '..';",
      "import dedent from 'dedent';"
    ]);
    expect(scaffoldImports('local/distilled-aot.test.ts')).toEqual([
      "import patch from '../src/patch';",
      "import { parse } from '../src';",
      "import dedent from 'dedent';"
    ]);
  });

  test('distilled mutation values preserve nested Date instances', () => {
    const value = {
      dates: [new Date('2026-10-22T00:00:00.000Z'), { date: new Date('2026-10-23T00:00:00.000Z') }]
    };

    expect(valueSource(value)).toBe(
      '{ "dates": [new Date("2026-10-22T00:00:00.000Z"), { "date": new Date("2026-10-23T00:00:00.000Z") }] }'
    );
  });

  test('distilled delete-key mutations generate delete statements', () => {
    expect(mutationSource({ kind: 'delete-key', path: ['root', 'child'] })).toBe(
      'delete obj["root"]["child"];'
    );
  });

  test.each(['1', '2', '3', '4'] as const)('%s preserves legacy seed edits and formats', (profile) => {
    const run = numberedRunners[profile];
    for (const [seedText, expected] of Object.entries(legacySeedExpectations[profile])) {
      const result = run(Number(seedText), 3);
      expect({
        status: result.status,
        mutationDescs: result.mutationDescs ?? [],
        formatDesc: result.formatDesc ?? 'default'
      }).toEqual({ status: 'ok', ...expected });
    }
  });

  test.each(['1', '2', '3', '4'] as const)('%s matches latest-branch mutation-plan baselines', (variant) => {
    for (const [seedText, expected] of Object.entries(legacyResultFingerprints[variant])) {
      expect(fuzzResultFingerprint(numberedRunners[variant](Number(seedText), 3))).toBe(expected);
    }
  });

  test('keeps the default generator byte-stable for fixed seeds', () => {
    const sourceFor = (seed: number) => generateDefaultSource({ seed }).source;
    const first = [0, 1, 17, 19506].map(sourceFor);
    const second = [0, 1, 17, 19506].map(sourceFor);

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
    expect(createHash('sha256').update(first[1]).digest('hex')).toBe(
      '5fc174fce632f238a0914dfa6c86f4994feea6c415fb03f2d7d56ac503e7757d'
    );
    expect(createHash('sha256').update(first[3]).digest('hex')).toBe(
      '2291447545c16b0f56df026db6e9237ddb4ace68d05452b07f388371057076a8'
    );
  });

  test('keeps composed source transforms byte-stable for a fixed seed', () => {
    const seed = 1;
    const generated = generateDefaultSource({ seed });
    const context: FuzzContext = {
      seed,
      mutationCount: 1,
      source: generated.source,
      generated
    };
    const spaced = spaceDottedKeySeparators(generated.source);
    const shortened = shortenFractionalSeconds(
      generated.source,
      new SeededRandom(seed + 700_000)
    );

    expect(createHash('sha256').update(generated.source).digest('hex')).toBe(
      '5fc174fce632f238a0914dfa6c86f4994feea6c415fb03f2d7d56ac503e7757d'
    );
    expect(createHash('sha256').update(spaced).digest('hex')).toBe(
      '10c3b917c09ade31f721cf0cbea197158b2920d7a72f98f1d503a51b5d110040'
    );
    expect(createHash('sha256').update(shortened).digest('hex')).toBe(
      '423ef44ebc1dd020bd71e242879aa9a36dd8fcd3eaa899005ad44b09a9fd3bce'
    );
    expect(context.source).toBe(generated.source);
  });

  test('keeps AOT generation byte-stable and seed-specific', () => {
    const sources = [1, 3, 4].map(seed => generateAotSource({ seed }).source);
    const hashes = sources.map(source => createHash('sha256').update(source).digest('hex'));

    expect(hashes).toEqual([
      'ee082341e3f8f9e9f988810d0b590d146c7767d5e5e21a7d582d89ff67554f86',
      'e577979b9603908efa24f734d0d14471c17dbc023b1a95f8476dd035e01ee0b9',
      '7a4d702bbf569d00f8b4161face684a9ceeed5004c82fb76255ae5e9475afd0d'
    ]);
    expect(new Set(sources).size).toBe(sources.length);
    expect(generateAotSource({ seed: 3 }).source).toBe(sources[1]);
  });

  test.each(profiles)('%s keeps changes seed-specific across successful seeds', (profile) => {
    const results = [1, 3, 4].map(seed => runProfile(seed, profile, 1));
    const mutationSignatures = results.map(result => JSON.stringify(result.mutationPlans));

    expect(results.every(result => result.status === 'ok')).toBe(true);
    expect(results.every(result => (result.mutationDescs?.length ?? 0) > 0)).toBe(true);
    expect(new Set(mutationSignatures).size).toBe(results.length);
  });

  test.each(['aot', 'aot-format', 'aot-general'] as const)('%s has fixed mutation-plan fingerprints', (profile) => {
    for (const [seedText, expected] of Object.entries(profileResultFingerprints[profile])) {
      expect(fuzzResultFingerprint(runProfile(Number(seedText), profile, 1))).toBe(expected);
    }
  });

  test('general-format matches latest variant 4 mutation-plan baselines', () => {
    for (const [seedText, expected] of Object.entries(latestVariant4OneMutationFingerprints)) {
      expect(fuzzResultFingerprint(runProfile(Number(seedText), 'general-format', 1))).toBe(expected);
    }
  });

  test.each(profiles)('%s changes data and round-trips the changed TOML', (profile) => {
    const config = profileConfig(profile, 1);
    let before: unknown;
    let after: unknown;
    const result = runFuzz(1, {
      ...config,
      mutate: (input) => {
        before = deepClone(input.original);
        const mutationRun = config.mutate!(input);
        after = deepClone(mutationRun.updated);
        return mutationRun;
      }
    });

    expect(result.status, result.error).toBe('ok');
    expect(result.mutationPlans).toHaveLength(1);
    expect(deepEqual(before, after)).toBe(false);
  });

  test.each(profiles)('%s is deterministic for a fixed seed', (profile) => {
    const first = runProfile(17, profile, 1);
    const second = runProfile(17, profile, 1);

    expect({
      status: first.status,
      mutationDescs: first.mutationDescs,
      formatDesc: first.formatDesc,
      generatorDescription: first.generatorDescription,
      profile: first.profile
    }).toEqual({
      status: second.status,
      mutationDescs: second.mutationDescs,
      formatDesc: second.formatDesc,
      generatorDescription: second.generatorDescription,
      profile: second.profile
    });
  });

  test('supports a custom source, transform, mutation and comparator', () => {
    const result = runFuzz(3, {
      mutationCount: 1,
      generateSource: () => ({ source: 'value = 1\n', description: 'small fixture' }),
      sourceTransforms: [(source) => `${source}name = "before"\n`],
      mutate: ({ updated }) => {
        (updated as { value: number }).value = 2;
        return { updated, descriptions: ['edit value'] };
      },
      compare: (expected, actual) => JSON.stringify(expected) === JSON.stringify(actual)
    });

    expect(result.status).toBe('ok');
    expect(result.mutationDescs).toEqual(['edit value']);
  });

});
