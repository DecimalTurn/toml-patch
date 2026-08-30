import { stableStringify } from '../utils';

describe('stableStringify', () => {
  test('fails fast on a circular object instead of hanging', () => {
    const circular: any = {};
    circular.self = circular;

    expect(() => stableStringify(circular)).toThrow();
  });

  test('fails fast on a circular array instead of hanging', () => {
    const circular: any[] = [];
    circular.push(circular);

    expect(() => stableStringify(circular)).toThrow();
  });
});
