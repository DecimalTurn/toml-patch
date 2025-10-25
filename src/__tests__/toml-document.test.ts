import { TomlDocument } from '../toml-document';
import dedent from 'dedent';

describe('TomlDocument', () => {
  const simpleToml = dedent`
    [section]
    key = "value"
  ` + '\n';
  const simpleObj = { section: { key: 'value' } };

  it('parses TOML string to JS object', () => {
    const doc = new TomlDocument(simpleToml);
    expect(doc.toJsObject).toEqual(simpleObj);
  });

  it('returns the original TOML string', () => {
    const doc = new TomlDocument(simpleToml);
    expect(doc.toTomlString).toBe(simpleToml);
  });

  it('preserves newline and trailing newlines', () => {
    const toml = dedent`
      [a]
      b = 1
    ` + '\n\n';
    const doc = new TomlDocument(toml);
    // Patch with a new object, should keep trailing newline count
    doc.patch({ a: { b: 2 } });
    const patched = doc.toTomlString;
    expect(patched.endsWith('\n\n')).toBe(true);
  });

  it('patches TOML with new JS object', () => {
    const doc = new TomlDocument(simpleToml);
    const newObj = { section: { key: 'changed', newKey: 42 } };
    doc.patch(newObj);
    const patched = doc.toTomlString;
    const newDoc = new TomlDocument(patched);
    expect(newDoc.toJsObject).toEqual(newObj);
  });

  it('handles CRLF newlines', () => {
    const crlfToml = '[x]\r\ny = 1\r\n';
    const doc = new TomlDocument(crlfToml);
    doc.patch({ x: { y: 2 } });
    const patched = doc.toTomlString;
    expect(patched.includes('\r\n')).toBe(true);
    expect(patched).toEqual('[x]\r\ny = 2\r\n');
  });

  describe('overwrite', () => {
    it('does nothing when overwriting with identical string', () => {
      const toml = dedent`
        [section]
        key = "value"
      ` + '\n';
      const doc = new TomlDocument(toml);
      const originalToml = doc.toTomlString;
      
      doc.overwrite(toml);
      
      expect(doc.toTomlString).toBe(originalToml);
      expect(doc.toJsObject).toEqual({ section: { key: 'value' } });
    });

    it('updates AST when a value changes', () => {
      const toml = dedent`
        [section]
        key = "value"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key = "changed"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ section: { key: 'changed' } });
    });

    it('handles adding a new key to existing section', () => {
      const toml = dedent`
        [section]
        key1 = "value1"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key1 = "value1"
        key2 = "value2"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ 
        section: { key1: 'value1', key2: 'value2' } 
      });
    });

    it('handles adding a new section', () => {
      const toml = dedent`
        [section1]
        key1 = "value1"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section1]
        key1 = "value1"
        
        [section2]
        key2 = "value2"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ 
        section1: { key1: 'value1' },
        section2: { key2: 'value2' }
      });
    });

    it('handles changes in the middle of a line', () => {
      const toml = dedent`
        [section]
        key = 123
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key = 456
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ section: { key: 456 } });
    });

    it('handles removing lines', () => {
      const toml = dedent`
        [section]
        key1 = "value1"
        key2 = "value2"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key1 = "value1"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ section: { key1: 'value1' } });
    });

    it('handles changes with comments', () => {
      const toml = dedent`
        # Comment
        [section]
        key = "value"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        # Comment
        [section]
        key = "changed"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ section: { key: 'changed' } });
    });

    it('preserves newline style in updates', () => {
      const toml = '[section]\r\nkey = "value"\r\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = '[section]\r\nkey = "changed"\r\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toTomlString.includes('\r\n')).toBe(true);
    });

    it('handles table arrays', () => {
      const toml = dedent`
        [[products]]
        name = "Product 1"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [[products]]
        name = "Product 1"
        
        [[products]]
        name = "Product 2"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({
        products: [
          { name: 'Product 1' },
          { name: 'Product 2' }
        ]
      });
    });

    it('handles nested tables', () => {
      const toml = dedent`
        [parent.child1]
        key1 = 1
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [parent.child1]
        key1 = 1
        
        [parent.child2]
        key2 = 2
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({
        parent: {
          child1: { key1: 1 },
          child2: { key2: 2 }
        }
      });
    });

    it('handles complete document replacement', () => {
      const toml = dedent`
        [old]
        data = "old"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [new]
        data = "new"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ new: { data: 'new' } });
    });

    it('handles empty document update', () => {
      const toml = '';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key = "value"
      ` + '\n';
      doc.update(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ section: { key: 'value' } });
    });
  });

  describe('overwrite', () => {
    it('does nothing when overwriting with identical string', () => {
      const toml = dedent`
        [section]
        key = "value"
      ` + '\n';
      const doc = new TomlDocument(toml);
      const originalToml = doc.toTomlString;
      
      doc.overwrite(toml);
      
      expect(doc.toTomlString).toBe(originalToml);
      expect(doc.toJsObject).toEqual({ section: { key: 'value' } });
    });

    it('overwrites AST when a value changes', () => {
      const toml = dedent`
        [section]
        key = "value"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key = "changed"
      ` + '\n';
      doc.overwrite(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ section: { key: 'changed' } });
    });

    it('handles complete document replacement', () => {
      const toml = dedent`
        [old]
        data = "old"
      ` + '\n';
      const doc = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [new]
        data = "new"
      ` + '\n';
      doc.overwrite(updatedToml);
      
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toJsObject).toEqual({ new: { data: 'new' } });
    });
  });

  describe('update vs overwrite comparison', () => {
    it('update and overwrite produce the same result for value changes', () => {
      const toml = dedent`
        [section]
        key = "value"
      ` + '\n';
      
      const doc1 = new TomlDocument(toml);
      const doc2 = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section]
        key = "changed"
      ` + '\n';
      
      doc1.update(updatedToml);
      doc2.overwrite(updatedToml);
      
      expect(doc1.toJsObject).toEqual(doc2.toJsObject);
      expect(doc1.toTomlString).toBe(doc2.toTomlString);
    });

    it('update and overwrite produce the same result for adding sections', () => {
      const toml = dedent`
        [section1]
        key1 = "value1"
      ` + '\n';
      
      const doc1 = new TomlDocument(toml);
      const doc2 = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [section1]
        key1 = "value1"
        
        [section2]
        key2 = "value2"
      ` + '\n';
      
      doc1.update(updatedToml);
      doc2.overwrite(updatedToml);
      
      expect(doc1.toJsObject).toEqual(doc2.toJsObject);
      expect(doc1.toTomlString).toBe(doc2.toTomlString);
    });

    it('update and overwrite produce the same result for table arrays', () => {
      const toml = dedent`
        [[products]]
        name = "Product 1"
      ` + '\n';
      
      const doc1 = new TomlDocument(toml);
      const doc2 = new TomlDocument(toml);
      
      const updatedToml = dedent`
        [[products]]
        name = "Product 1"
        
        [[products]]
        name = "Product 2"
      ` + '\n';
      
      doc1.update(updatedToml);
      doc2.overwrite(updatedToml);
      
      expect(doc1.toJsObject).toEqual(doc2.toJsObject);
      expect(doc1.toTomlString).toBe(doc2.toTomlString);
    });
  });

  describe('update with kitchen-sink.toml edge cases', () => {
    const kitchenSink = `# This is a TOML document.

title = "TOML Example"

[values]
string = "string..."
integer = [ 1_234 , 0xdead_beef , 0o01234567 , 0o755 , 0b11010110 ]
float = [ 1_234.567 , -0.01 , 5e+22 , 1E6 , inf , -inf , nan , -nan ]
boolean = true
date.datetime = [
  1979-05-27T07:32:00Z,
  1979-05-27T00:32:00-07:00,
  1979-05-27T00:32:00.999999-07:00,
  1979-05-27 07:32:00Z,

]

date.local = [
  1979-05-27T07:32:00,
  1979-05-27, # Local Date
  07:32:00    # Local Time
]

array.nested = [ [ 1, 2 ], ["a", "b", "c"] ]
array.trailing = [
  1,
  2, # this is ok
]

table.dotted = { type.name = "pug" }

# Table
[dog  .  "tater.man"]
type.name = "pug"

# TODO [ j . "ʞ" . 'l' ]

# Array Table
[[products]]
name = "Hammer"
sku = 738594937

[[products]]

[[products]]
name = "Nail"
sku = 284758393
color = "gray"
`;

    it('handles changing the first line (title)', () => {
      const doc = new TomlDocument(kitchenSink);
      const originalTitle = doc.toJsObject.title;
      expect(originalTitle).toBe('TOML Example');

      const updatedToml = kitchenSink.replace('title = "TOML Example"', 'title = "Updated Example"');
      doc.update(updatedToml);

      expect(doc.toJsObject.title).toBe('Updated Example');
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing a value in the middle of a complex array', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace('0xdead_beef', '0xcafe_babe');
      doc.update(updatedToml);

      expect(doc.toJsObject.values.integer).toContain(0xcafebabe);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing inline table values', () => {
      const doc = new TomlDocument(kitchenSink);
      expect(doc.toJsObject.values.table.dotted.type.name).toBe('pug');

      const updatedToml = kitchenSink.replace('table.dotted = { type.name = "pug" }', 'table.dotted = { type.name = "bulldog" }');
      doc.update(updatedToml);

      expect(doc.toJsObject.values.table.dotted.type.name).toBe('bulldog');
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles adding a new field to an array table element', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        '[[products]]\nname = "Hammer"\nsku = 738594937',
        '[[products]]\nname = "Hammer"\nsku = 738594937\nprice = 9.99'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.products[0].price).toBe(9.99);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles removing a field from an array table element', () => {
      const doc = new TomlDocument(kitchenSink);
      expect(doc.toJsObject.products[2].color).toBe('gray');
      
      const updatedToml = kitchenSink.replace(
        '[[products]]\nname = "Nail"\nsku = 284758393\ncolor = "gray"',
        '[[products]]\nname = "Nail"\nsku = 284758393'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.products[2].color).toBeUndefined();
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing dotted key values', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        '[dog  .  "tater.man"]\ntype.name = "pug"',
        '[dog  .  "tater.man"]\ntype.name = "corgi"'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.dog['tater.man'].type.name).toBe('corgi');
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles adding a new array table element', () => {
      const doc = new TomlDocument(kitchenSink);
      const originalLength = doc.toJsObject.products.length;
      expect(originalLength).toBe(3);
      
      const updatedToml = kitchenSink + '\n[[products]]\nname = "Screwdriver"\nsku = 123456\n';
      doc.update(updatedToml);

      const products = doc.toJsObject.products;
      expect(products.length).toBe(4);
      expect(products[3].name).toBe('Screwdriver');
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing multiline array values', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        'array.trailing = [\n  1,\n  2, # this is ok\n]',
        'array.trailing = [\n  1,\n  2,\n  3, # added new value\n]'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.values.array.trailing).toEqual([1, 2, 3]);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing nested array values', () => {
      const doc = new TomlDocument(kitchenSink);
      expect(doc.toJsObject.values.array.nested).toEqual([[1, 2], ["a", "b", "c"]]);
      
      const updatedToml = kitchenSink.replace(
        'array.nested = [ [ 1, 2 ], ["a", "b", "c"] ]',
        'array.nested = [ [ 3, 4, 5 ], ["x", "y"] ]'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.values.array.nested).toEqual([[3, 4, 5], ["x", "y"]]);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing special float values', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        'float = [ 1_234.567 , -0.01 , 5e+22 , 1E6 , inf , -inf , nan , -nan ]',
        'float = [ 1_234.567 , -0.01 , 5e+22 , 1E6 , -inf , inf , -nan , nan ]'
      );
      doc.update(updatedToml);

      const floats = doc.toJsObject.values.float;
      expect(floats[4]).toBe(-Infinity);
      expect(floats[5]).toBe(Infinity);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing datetime values', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        '1979-05-27T07:32:00Z',
        '2025-10-25T12:00:00Z'
      );
      doc.update(updatedToml);

      const firstDate = doc.toJsObject.values.date.datetime[0];
      expect(firstDate.toISOString()).toBe('2025-10-25T12:00:00.000Z');
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing boolean values', () => {
      const doc = new TomlDocument(kitchenSink);
      expect(doc.toJsObject.values.boolean).toBe(true);
      
      const updatedToml = kitchenSink.replace(
        'boolean = true',
        'boolean = false'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.values.boolean).toBe(false);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changing integer literals with different bases', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        '0o755',
        '0o644'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.values.integer).toContain(0o644);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles modifying comments without affecting structure', () => {
      const doc = new TomlDocument(kitchenSink);
      
      const updatedToml = kitchenSink.replace(
        '# This is a TOML document.',
        '# This is an updated TOML document.'
      );
      doc.update(updatedToml);

      // Structure should be unchanged
      expect(doc.toJsObject.title).toBe('TOML Example');
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('update and overwrite produce identical results for complex changes', () => {
      const doc1 = new TomlDocument(kitchenSink);
      const doc2 = new TomlDocument(kitchenSink);
      
      let updatedToml = kitchenSink
        .replace('title = "TOML Example"', 'title = "Changed Title"')
        .replace('boolean = true', 'boolean = false')
        .replace('name = "Hammer"', 'name = "Super Hammer"');
      
      doc1.update(updatedToml);
      doc2.overwrite(updatedToml);

      expect(doc1.toJsObject).toEqual(doc2.toJsObject);
      expect(doc1.toTomlString).toBe(doc2.toTomlString);
    });

    it('handles empty array table element changes', () => {
      const doc = new TomlDocument(kitchenSink);
      expect(doc.toJsObject.products[1]).toEqual({});
      
      // This replacement adds empty_field to the third [[products]] element (index 2), not the second (index 1)
      const updatedToml = kitchenSink.replace(
        '[[products]]\n\n[[products]]',
        '[[products]]\n\n[[products]]\nempty_field = "not empty anymore"'
      );
      doc.update(updatedToml);

      const products = doc.toJsObject.products;
      expect(products[1]).toEqual({}); // Second element should still be empty
      expect(products[2].empty_field).toBe('not empty anymore'); // Third element gets the field
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles changes near quoted keys with special characters', () => {
      const doc = new TomlDocument(kitchenSink);
      
      // Change a value in the section with special key name
      const updatedToml = kitchenSink.replace(
        '[dog  .  "tater.man"]\ntype.name = "pug"',
        '[dog  .  "tater.man"]\ntype.name = "pug"\nage = 5'
      );
      doc.update(updatedToml);

      expect(doc.toJsObject.dog['tater.man'].age).toBe(5);
      expect(doc.toTomlString).toBe(updatedToml);
    });
  });

  describe('update preserves unchanged AST nodes', () => {
    it('preserves unchanged sections when updating a different section', () => {
      const toml = dedent`
        [section1]
        key1 = "value1"
        key2 = "value2"
        
        [section2]
        key3 = "value3"
        key4 = "value4"
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Update only section2
      const updatedToml = dedent`
        [section1]
        key1 = "value1"
        key2 = "value2"
        
        [section2]
        key3 = "CHANGED"
        key4 = "value4"
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // First section's AST node should be the same object reference
      expect(updatedAst[0]).toBe(originalAst[0]);
      // Second section's AST node should be different (was reparsed)
      expect(updatedAst[1]).not.toBe(originalAst[1]);
      
      // Verify the values are correct
      expect(doc.toJsObject.section1.key1).toBe('value1');
      expect(doc.toJsObject.section2.key3).toBe('CHANGED');
    });

    it('preserves unchanged key-value pairs when updating later ones', () => {
      const toml = dedent`
        first = 1
        second = 2
        third = 3
        fourth = 4
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Update only the third and fourth values
      const updatedToml = dedent`
        first = 1
        second = 2
        third = 99
        fourth = 100
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // First two AST nodes should be preserved
      expect(updatedAst[0]).toBe(originalAst[0]);
      expect(updatedAst[1]).toBe(originalAst[1]);
      // Last two should be different (reparsed)
      expect(updatedAst[2]).not.toBe(originalAst[2]);
      expect(updatedAst[3]).not.toBe(originalAst[3]);
      
      // Verify values
      expect(doc.toJsObject.first).toBe(1);
      expect(doc.toJsObject.second).toBe(2);
      expect(doc.toJsObject.third).toBe(99);
      expect(doc.toJsObject.fourth).toBe(100);
    });

    it('preserves entire AST when only a comment changes at the end', () => {
      const toml = dedent`
        # Comment at the start
        [section]
        key = "value"
        
        # Comment at the end
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Change only the comment at the end
      const updatedToml = dedent`
        # Comment at the start
        [section]
        key = "value"
        
        # Updated comment at the end
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // Original structure: [Comment, Table (containing a comment inside)]
      // After update: [Comment (unchanged), Table (changed because comment inside changed)]
      expect(updatedAst[0]).toBe(originalAst[0]); // First comment unchanged
      expect(updatedAst[1]).not.toBe(originalAst[1]); // Table changed (comment inside it changed)
    });

    it('preserves unchanged section when adding a new section after it', () => {
      const toml = dedent`
        [section1]
        key = "value"
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Add a new section after the first one
      const updatedToml = dedent`
        [section1]
        key = "value"
        
        [section2]
        key2 = "value2"
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // First section should be preserved
      expect(updatedAst[0]).toBe(originalAst[0]);
      // Second section is new
      expect(updatedAst.length).toBe(2);
    });

    it('preserves unchanged array table elements', () => {
      const toml = dedent`
        [[products]]
        name = "First"
        sku = 111
        
        [[products]]
        name = "Second"
        sku = 222
        
        [[products]]
        name = "Third"
        sku = 333
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Update only the third product
      const updatedToml = dedent`
        [[products]]
        name = "First"
        sku = 111
        
        [[products]]
        name = "Second"
        sku = 222
        
        [[products]]
        name = "Third UPDATED"
        sku = 999
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // First two array table elements should be preserved
      expect(updatedAst[0]).toBe(originalAst[0]);
      expect(updatedAst[1]).toBe(originalAst[1]);
      // Third should be different
      expect(updatedAst[2]).not.toBe(originalAst[2]);
      
      // Verify values
      expect(doc.toJsObject.products[0].name).toBe('First');
      expect(doc.toJsObject.products[1].name).toBe('Second');
      expect(doc.toJsObject.products[2].name).toBe('Third UPDATED');
      expect(doc.toJsObject.products[2].sku).toBe(999);
    });

    it('preserves unchanged parts when adding new content at the end', () => {
      const toml = dedent`
        [section1]
        key1 = "value1"
        
        [section2]
        key2 = "value2"
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      const originalLength = originalAst.length;
      
      // Add a new section at the end
      const updatedToml = dedent`
        [section1]
        key1 = "value1"
        
        [section2]
        key2 = "value2"
        
        [section3]
        key3 = "value3"
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // All original nodes should be preserved
      for (let i = 0; i < originalLength; i++) {
        expect(updatedAst[i]).toBe(originalAst[i]);
      }
      
      // Should have one new node
      expect(updatedAst.length).toBe(originalLength + 1);
      
      // Verify values
      expect(doc.toJsObject.section1.key1).toBe('value1');
      expect(doc.toJsObject.section2.key2).toBe('value2');
      expect(doc.toJsObject.section3.key3).toBe('value3');
    });

    it('preserves complex unchanged structures with nested tables', () => {
      const toml = dedent`
        title = "Document"
        
        [database]
        server = "192.168.1.1"
        ports = [ 8001, 8001, 8002 ]
        
        [servers.alpha]
        ip = "10.0.0.1"
        dc = "eqdc10"
        
        [servers.beta]
        ip = "10.0.0.2"
        dc = "eqdc10"
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Update only servers.beta
      const updatedToml = dedent`
        title = "Document"
        
        [database]
        server = "192.168.1.1"
        ports = [ 8001, 8001, 8002 ]
        
        [servers.alpha]
        ip = "10.0.0.1"
        dc = "eqdc10"
        
        [servers.beta]
        ip = "10.0.0.99"
        dc = "eqdc99"
      ` + '\n';
      
      doc.update(updatedToml);
      const updatedAst = doc.ast;
      
      // Title, database, and servers.alpha should be preserved
      expect(updatedAst[0]).toBe(originalAst[0]); // title
      expect(updatedAst[1]).toBe(originalAst[1]); // database
      expect(updatedAst[2]).toBe(originalAst[2]); // servers.alpha
      // servers.beta should be different
      expect(updatedAst[3]).not.toBe(originalAst[3]);
      
      // Verify unchanged values are still correct
      expect(doc.toJsObject.title).toBe('Document');
      expect(doc.toJsObject.database.server).toBe('192.168.1.1');
      expect(doc.toJsObject.servers.alpha.ip).toBe('10.0.0.1');
      // And updated value is changed
      expect(doc.toJsObject.servers.beta.ip).toBe('10.0.0.99');
    });

    it('overwrite does NOT preserve AST nodes (for comparison)', () => {
      const toml = dedent`
        [section1]
        key1 = "value1"
        
        [section2]
        key2 = "value2"
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      const originalAst = doc.ast;
      
      // Use overwrite instead of update
      const updatedToml = dedent`
        [section1]
        key1 = "value1"
        
        [section2]
        key2 = "CHANGED"
      ` + '\n';
      
      doc.overwrite(updatedToml);
      const updatedAst = doc.ast;
      
      // With overwrite, ALL nodes are reparsed, so none should be preserved
      expect(updatedAst[0]).not.toBe(originalAst[0]);
      expect(updatedAst[1]).not.toBe(originalAst[1]);
      
      // But values should still be correct
      expect(doc.toJsObject.section1.key1).toBe('value1');
      expect(doc.toJsObject.section2.key2).toBe('CHANGED');
    });
  });
});
