import {
  createDefaultMutationStrategy,
  createFormatGenerator,
  deepEqual,
  normalizeNewlines,
  runFuzz,
  shortenFractionalSeconds,
  type FuzzConfig,
  type FuzzComparator,
  type PatchFuzzResult
} from './fuzz-patch';
import { aotMutationStrategy, generateAotSource } from './fuzz-patch5';
import { SeededRandom } from './randomizer';

export type FuzzProfile = 'aot' | 'aot-format' | 'aot-general' | 'general-format';

const formatComparator: FuzzComparator = (expected, actual, format) =>
  deepEqual(normalizeNewlines(expected, format), normalizeNewlines(actual, format));

export function profileConfig(profile: FuzzProfile, mutationCount: number): FuzzConfig {
  switch (profile) {
    case 'aot':
      return {
        mutationCount,
        generateSource: generateAotSource,
        mutate: aotMutationStrategy,
        compare: deepEqual,
        variant: '5',
        profile
      };
    case 'aot-format':
      return {
        mutationCount,
        generateSource: generateAotSource,
        generateFormat: createFormatGenerator(true, true, true),
        mutate: aotMutationStrategy,
        compare: formatComparator,
        variant: '5',
        profile
      };
    case 'aot-general':
      return {
        mutationCount,
        generateSource: generateAotSource,
        mutate: createDefaultMutationStrategy(),
        variant: '5',
        profile
      };
    case 'general-format':
      return {
        mutationCount,
        sourceTransforms: [
          (source, context) => shortenFractionalSeconds(
            source,
            new SeededRandom(context.seed + 700_000)
          )
        ],
        generateFormat: createFormatGenerator(true, true, true),
        mutate: createDefaultMutationStrategy({ subSecondDates: true, dateFocus: true }),
        compare: formatComparator,
        variant: '1',
        profile
      };
  }
}

export function runProfile(
  seed: number,
  profile: FuzzProfile,
  mutationCount = 3
): PatchFuzzResult {
  return runFuzz(seed, profileConfig(profile, mutationCount));
}
