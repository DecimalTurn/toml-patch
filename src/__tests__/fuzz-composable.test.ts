import { createHash } from 'node:crypto';
import { runFuzz } from './fuzz-patch';
import {
  deepClone,
  deepEqual,
  generateDefaultSource,
  shortenFractionalSeconds,
  type FuzzContext
} from './fuzz-patch';
import { spaceDottedKeySeparators } from './fuzz-patch2';
import { generateAotSource } from './fuzz-patch5';
import { fuzzOne1 } from './fuzz-patch1';
import { fuzzOne2 } from './fuzz-patch2';
import { fuzzOne3 } from './fuzz-patch3';
import { fuzzOne4 } from './fuzz-patch4';
import { profileConfig, runProfile, type FuzzProfile } from './fuzz-profiles';
import { SeededRandom } from './randomizer';

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

describe('composable patch fuzz profiles', () => {
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
      'a835d552ccb40452a01881ec6f066ff98d5021f1df09fb6c9bcfbd497bcda294',
      '8fe104be6844c0b61c8582894355d08fc13e492f60ca22fbca1e256446b28585',
      '4047ef23e3b793de68db9defd57d6a961bdb2ebecd7c0dfb43e0af2d60c8ed72'
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
