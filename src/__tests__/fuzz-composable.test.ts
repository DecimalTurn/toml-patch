import { runFuzz } from './fuzz-patch';
import { runProfile, type FuzzProfile } from './fuzz-profiles';

const profiles: FuzzProfile[] = ['aot', 'aot-format', 'aot-general', 'general-format'];

describe('composable patch fuzz profiles', () => {
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
