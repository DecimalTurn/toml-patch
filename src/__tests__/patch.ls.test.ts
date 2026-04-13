import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';

/**
 * Tests for patching literal strings
 */

describe('literal strings', () => {
  const existing = dedent`
    [paths]
    output = 'C:\Users\Alice\Documents\Reports'
  `;

  test('existing should parse as expected', () => {
    const obj = parse(existing);
    expect(obj.paths.output).toEqual('C:\\Users\\Alice\\Documents\\Reports');
  });

  test('should preserve single-quote style when changing a subdirectory', () => {
    const obj = parse(existing);
    obj.paths.output = 'C:\\Users\\Bob\\Documents\\Reports';
    const patched = patch(existing, obj);

    expect(patched).toEqual(
      dedent`
        [paths]
        output = 'C:\Users\Bob\Documents\Reports'
      `
    );
    expect(parse(patched).paths.output).toEqual('C:\\Users\\Bob\\Documents\\Reports');
  });

  test('should preserve single-quote style when clearing the value to an empty string', () => {
    const obj = parse(existing);
    obj.paths.output = '';
    const patched = patch(existing, obj);

    expect(patched).toEqual(
      dedent`
        [paths]
        output = ''
      `
    );
    expect(parse(patched).paths.output).toEqual('');
  });

  test('should convert to multiline literal string when the new value contains a single quote', () => {
    const obj = parse(existing);
    obj.paths.output = "C:\\Users\\Alice's Documents\\Reports";
    const patched = patch(existing, obj);

    // Single-line literal strings cannot contain ' — should fall back to MLLS on one line
    expect(patched).toEqual(
      dedent`
        [paths]
        output = '''C:\Users\Alice's Documents\Reports'''
      `
    );
    expect(parse(patched).paths.output).toEqual("C:\\Users\\Alice's Documents\\Reports");
  });

    test('should fallback to basic string when triple single quotes are present', () => {
    const obj = parse(existing);
    obj.paths.output = "C:\\Users\\Alice'''s Documents\\Reports";
    const patched = patch(existing, obj);

    // Single-line literal strings cannot contain ' — should fall back to MLLS on one line
    expect(patched).toEqual(
      dedent`
        [paths]
        output = "C:\\Users\\Alice'''s Documents\\Reports"
      `
    );
    expect(parse(patched).paths.output).toEqual("C:\\Users\\Alice'''s Documents\\Reports");
  });

});