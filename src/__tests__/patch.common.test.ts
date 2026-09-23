import dedent from 'dedent';
import { parse } from '../';
import patchFull from '../patch';
import { patch as patchLite } from '../patch-lite-entry';

// Number-format preservation behaviors that must hold for both the full
// `patch()` and the edit-only `patch-lite()`. Each test below runs twice,
// once per implementation.
const implementations: Array<[string, (src: string, obj: any) => string]> = [
  ['full', patchFull],
  ['lite', patchLite],
];

describe.each(implementations)('Format preservation for numbers (%s patch)', (_label, patch) => {
  test('Preserves uppercase E in exponent notation', () => {
    const src = dedent`
    a = 1.0E10
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = obj.a * 10;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 1.0E11
    ` + '\n');
  });

  test('Preserves hexadecimal notation when editing an integer', () => {
    const src = dedent`
    a = 0xFF
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 256;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0x100
    ` + '\n');
  });

  test('Preserves octal notation when editing an integer', () => {
    const src = dedent`
    a = 0o777
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 512;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0o1000
    ` + '\n');
  });

  test('Preserves binary notation when editing an integer', () => {
    const src = dedent`
    a = 0b1010
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 11;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0b1011
    ` + '\n');
  });

  test('Preserves uppercase hexadecimal digits', () => {
    const src = dedent`
    a = 0xAF
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = 176;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = 0xB0
    ` + '\n');
  });

  test('Falls back to decimal for a negative value when the original used a radix prefix', () => {
    const src = dedent`
    a = 0x957
    ` + '\n';

    const obj = parse(src) as any;
    obj.a = -2391;

    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
    a = -2391
    ` + '\n');
  });
});
