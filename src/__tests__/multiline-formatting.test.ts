import { parse, patch, stringify } from '../index';
import dedent from 'dedent';

describe('multiline container formatting', () => {
  test('writes a root inline array on structural rows when requested', () => {
    const value = { values: [1, 2] };
    const result = stringify(value, { multilineArray: true });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      values = [
        1,
        2
      ]
    ` + '\n');
  });

  test('writes a root inline table on structural rows when requested', () => {
    const value = { config: { host: 'localhost', port: 8080 } };
    const result = stringify(value, { inlineTableStart: 0, multilineTable: true });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      config = {
        host = "localhost",
        port = 8080
      }
    ` + '\n');
  });

  test('writes nested tables and arrays as multiline containers', () => {
    const value = { values: [{ name: 'new', enabled: false, tags: ['one', 'two'] }] };
    const result = stringify(value, {
      inlineTableStart: 0,
      multilineArray: true,
      multilineTable: true,
    });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      values = [
        {
          name = "new",
          enabled = false,
          tags = [
            "one",
            "two"
          ]
        }
      ]
    ` + '\n');
  });

  test('uses parent layout for a child container', () => {
    const value = { values: [{ name: 'new', enabled: false }] };
    const result = stringify(value, {
      inlineTableStart: 0,
      multilineArray: true,
      multilineTable: 'parent',
    });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      values = [
        {
          name = "new",
          enabled = false
        }
      ]
    ` + '\n');
  });

  test('supports numeric depth selection for both container kinds', () => {
    const value = { values: [{ name: 'new' }] };
    const result = stringify(value, {
      inlineTableStart: 0,
      multilineArray: 0,
      multilineTable: 0,
    });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      values = [
        {
          name = "new"
        }
      ]
    ` + '\n');
  });

  test('writes empty containers on separate delimiter rows when requested', () => {
    const value = { config: {}, values: [] };
    const result = stringify(value, {
      inlineTableStart: 0,
      multilineArray: true,
      multilineTable: true,
    });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      config = {
      }
      values = [
      ]
    ` + '\n');
  });

  test('uses multiline arrays when patch replaces a scalar value', () => {
    const source = 'value = 0\n';
    const value = { value: [1, 2] };
    const result = patch(source, value, { multilineArray: true });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      value = [
        1,
        2
      ]
    ` + '\n');
  });

  test('uses multiline tables when patch replaces a scalar value', () => {
    const source = 'value = 0\n';
    const value = { value: { enabled: true } };
    const result = patch(source, value, { inlineTableStart: 0, multilineTable: true });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      value = {
        enabled = true
      }
    ` + '\n');
  });
});