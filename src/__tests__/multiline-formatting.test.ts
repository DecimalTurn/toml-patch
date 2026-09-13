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

  test('keeps trailing commas at the end of multiline rows', () => {
    const value = { values: [{ name: 'new', items: [1, 2] }] };
    const result = stringify(value, {
      inlineTableStart: 0,
      multilineArray: true,
      multilineTable: true,
      trailingComma: true,
    });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      values = [
        {
          name = "new",
          items = [
            1,
            2,
          ],
        },
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

  test('keeps a newly generated child compact under auto mode', () => {
    const source = dedent`
      values = [
        1,
      ]
    ` + '\n';
    const value = { values: [1, { name: 'new' }] };
    const result = patch(source, value);

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      values = [
        1,
        { name = "new" },
      ]
    ` + '\n');
  });

  test('keeps inner and outer trailing comma decisions independent', () => {
    const value = { values: [{ name: 'new' }] };
    const result = stringify(value, {
      inlineTableStart: 0,
      multilineArray: true,
      multilineTable: true,
      trailingComma: false,
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

  test('preserves multiline intent when replacing an inline array with a table', () => {
    const source = dedent`
      value = [
        1,
        { name = "new" },
      ]
    ` + '\n';
    const value = { value: { enabled: true } };
    const result = patch(source, value, { inlineTableStart: 0 });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      value = {
        enabled = true
      }
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

  test('counts a dotted key body at the same depth as a section body', () => {
    const value = { a: { list: [1, 2] } };
    const sectionSource = dedent`
      [a]
      list = 0
    ` + '\n';
    const dottedSource = 'a.list = 0\n';

    // Both sources map to `{ a: { list: [...] } }`, so `list` has depth 1 and a
    // threshold of 1 selects multiline layout.
    const sectionMultiline = patch(sectionSource, value, { multilineArray: 1 });
    expect(parse(sectionMultiline)).toEqual(value);
    expect(sectionMultiline).toBe(dedent`
      [a]
      list = [
        1,
        2
      ]
    ` + '\n');

    const dottedMultiline = patch(dottedSource, value, { multilineArray: 1 });
    expect(parse(dottedMultiline)).toEqual(value);
    // The dotted form lays the generated rows out exactly like the section
    // form: rows one indent past the key, closing bracket on the key column.
    expect(dottedMultiline).toBe(dedent`
      a.list = [
        1,
        2
      ]
    ` + '\n');

    // Depth 1 is below a threshold of 2, so the generated array stays compact.
    const sectionCompact = patch(sectionSource, value, { multilineArray: 2 });
    expect(parse(sectionCompact)).toEqual(value);
    expect(sectionCompact).toBe(dedent`
      [a]
      list = [ 1, 2 ]
    ` + '\n');

    const dottedCompact = patch(dottedSource, value, { multilineArray: 2 });
    expect(parse(dottedCompact)).toEqual(value);
    expect(dottedCompact).toBe(dedent`
      a.list = [ 1, 2 ]
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

  test('writes a new nested table as multiline inside an existing multiline table', () => {
    const source = dedent`
      config = {
      }
    ` + '\n';
    const value = { config: { inner: { enabled: true } } };
    const result = patch(source, value, {
      inlineTableStart: 0,
      multilineTable: 'parent',
    });

    expect(parse(result)).toEqual(value);
    expect(result).toBe(dedent`
      config = {
        inner = {
          enabled = true
        }
      }
    ` + '\n');
  });
});