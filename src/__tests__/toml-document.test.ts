import { TomlDocument } from '../toml-document';
import { hard_example } from '../__fixtures__';
import { LocalDate } from '../date-format';
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
    expect(patched).toEqual(dedent`
    [section]
    key = "changed"
    newKey = 42
    ` + '\n');
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

  it('patches date field and preserves format in output', () => {
    const toml = dedent`
      # Event information
      name = "Annual Conference"
      start_date = 2024-01-15
      
      [venue]
      location = "Convention Center"
    ` + '\n';
    
    const doc = new TomlDocument(toml);
    const jsObj = doc.toJsObject;
    
    // Increment the date by one day
    const currentDate = jsObj.start_date;
    const nextDayTime = currentDate.getTime() + 24 * 60 * 60 * 1000;
    const nextDay = new LocalDate(new Date(nextDayTime).toISOString().split('T')[0]);
    
    jsObj.start_date = nextDay;
    
    // Patch the document
    doc.patch(jsObj);
    
    // Verify the TOML output preserves the date-only format
    const expected = dedent`
      # Event information
      name = "Annual Conference"
      start_date = 2024-01-16
      
      [venue]
      location = "Convention Center"
    ` + '\n';
    
    expect(doc.toTomlString).toBe(expected);
  });

  it('patches multiple different date types and preserves their formats', () => {
    const toml = dedent`
      # Event schedule
      event_date = 2024-01-15
      start_time = 09:30:00
      meeting_datetime = 2024-01-15T14:30:00
      deadline = 2024-01-15T23:59:59-08:00
      
      [config]
      active = true
    ` + '\n';
    
    const doc = new TomlDocument(toml);
    const jsObj = doc.toJsObject;
    
    // Increment all dates by one day and time by one hour
    const eventDate = jsObj.event_date;
    const startTime = jsObj.start_time;
    const meetingDateTime = jsObj.meeting_datetime;
    const deadline = jsObj.deadline;
    
    // Add one day to date fields
    jsObj.event_date = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    jsObj.meeting_datetime = new Date(meetingDateTime.getTime() + 24 * 60 * 60 * 1000);
    jsObj.deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
    
    // Add one hour to time field
    jsObj.start_time = new Date(startTime.getTime() + 60 * 60 * 1000);
    
    // Patch the document
    doc.patch(jsObj);
    
    // This test should preserve all original formats
    const expected = dedent`
      # Event schedule
      event_date = 2024-01-16
      start_time = 10:30:00
      meeting_datetime = 2024-01-16T14:30:00
      deadline = 2024-01-16T23:59:59-08:00
      
      [config]
      active = true
    ` + '\n';
    
    expect(doc.toTomlString).toBe(expected);
  });

  describe('hard-example.toml edge cases', () => {
    it('handles parsing and updating complex TOML with tricky syntax', () => {
      const doc = new TomlDocument(hard_example);
      
      // Verify it can parse the complex TOML correctly
      const parsed = doc.toJsObject;
      
      // Check that complex nested structures are parsed
      expect(parsed.the.test_string).toBe("You'll hate me after this - #");
      expect(parsed.the.hard.test_array).toEqual(["] ", " # "]);
      expect(parsed.the.hard.test_array2).toEqual([
        "Test #11 ]proved that", 
        "Experiment #9 was a success"
      ]);
      expect(parsed.the.hard.another_test_string).toBe(" Same thing, but with a string #");
      expect(parsed.the.hard.harder_test_string).toBe(" And when \"'s are in the string, along with # \"");
      expect(parsed.the.hard["bit#"]["what?"]).toBe("You don't think some user won't do that?");
      expect(parsed.the.hard["bit#"].multi_line_array).toEqual(["]"]);
      
      // Test updating a value with special characters
      const updatedToml = hard_example.replace(
        'test_string = "You\'ll hate me after this - #"',
        'test_string = "You\'ll love me after this - #"'
      );
      doc.update(updatedToml);
      
      expect(doc.toJsObject.the.test_string).toBe("You'll love me after this - #");
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles updating arrays with special characters', () => {
      const doc = new TomlDocument(hard_example);
      
      // Update an array containing special characters
      const updatedToml = hard_example.replace(
        'test_array2 = [ "Test #11 ]proved that", "Experiment #9 was a success" ]',
        'test_array2 = [ "Test #11 ]proved that", "Experiment #9 was a success", "Test #12 failed" ]'
      );
      doc.update(updatedToml);
      
      expect(doc.toJsObject.the.hard.test_array2).toEqual([
        "Test #11 ]proved that", 
        "Experiment #9 was a success",
        "Test #12 failed"
      ]);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles updating values in sections with special key names', () => {
      const doc = new TomlDocument(hard_example);
      
      // Update a value in a section with special characters in the key name
      const updatedToml = hard_example.replace(
        '"what?" = "You don\'t think some user won\'t do that?"',
        '"what?" = "Actually, users do this all the time!"'
      );
      doc.update(updatedToml);
      
      expect(doc.toJsObject.the.hard["bit#"]["what?"]).toBe("Actually, users do this all the time!");
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('preserves comments when updating values', () => {
      const doc = new TomlDocument(hard_example);
      const originalString = doc.toTomlString;
      
      // Update a value but keep the structure
      const updatedToml = hard_example.replace(
        'another_test_string = " Same thing, but with a string #"',
        'another_test_string = " Different thing, but with a string #"'
      );
      doc.update(updatedToml);
      
      // Should preserve the comment structure
      expect(doc.toTomlString).toBe(updatedToml);
      expect(doc.toTomlString).toContain('# " Annoying, isn\'t it?');
      expect(doc.toTomlString).toContain('# ] There you go, parse this!');
      expect(doc.toJsObject.the.hard.another_test_string).toBe(" Different thing, but with a string #");
    });

    it('handles multiline arrays with complex content', () => {
      const doc = new TomlDocument(hard_example);
      
      // Update the multiline array
      const updatedToml = hard_example.replace(
        'multi_line_array = [\n            "]",\n            # ] Oh yes I did\n            ]',
        'multi_line_array = [\n            "]",\n            "another]",\n            # ] Oh yes I did\n            ]'
      );
      doc.update(updatedToml);
      
      expect(doc.toJsObject.the.hard["bit#"].multi_line_array).toEqual(["]", "another]"]);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('overwrite produces same results as update for hard example', () => {
      const doc1 = new TomlDocument(hard_example);
      const doc2 = new TomlDocument(hard_example);
      
      const updatedToml = hard_example
        .replace('test_string = "You\'ll hate me after this - #"', 'test_string = "Modified"')
        .replace('"what?" = "You don\'t think some user won\'t do that?"', '"what?" = "Modified too"');
      
      doc1.update(updatedToml);
      doc2.overwrite(updatedToml);
      
      expect(doc1.toJsObject).toEqual(doc2.toJsObject);
      expect(doc1.toTomlString).toBe(doc2.toTomlString);
    });
  });

  describe('update', () => {
    it('does nothing when updating with identical string', () => {
      const toml = dedent`
        [section]
        key = "value"
      ` + '\n';
      const doc = new TomlDocument(toml);
      const originalToml = doc.toTomlString;
      
      doc.update(toml);
      
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
    const kitchenSink = dedent`
      # This is a TOML document.

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
    ` + '\n';

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

  describe('edge cases and potential issues with update logic', () => {
    it('correctly handles nested table modifications that could confuse line-based truncation', () => {
      const toml = dedent`
        [parent.child1]
        key1 = 1
        
        [parent.child2] 
        key2 = 2
        
        [parent.child3]
        key3 = 3
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      
      // The dangerous scenario: modify parent.child2 by adding content
      // Line-based diffing might get confused about where parent.child2 ends 
      // and parent.child3 begins, potentially under-truncating
      const updatedToml = dedent`
        [parent.child1]
        key1 = 1
        
        [parent.child2]
        key2 = 999
        new_key = "added"
        
        [parent.child3]
        key3 = 3
      ` + '\n';
      
      doc.update(updatedToml);
      
      // Critical test: ensure parent.child3 wasn't corrupted by incorrect truncation
      expect(doc.toJsObject.parent.child1.key1).toBe(1);
      expect(doc.toJsObject.parent.child2.key2).toBe(999);
      expect(doc.toJsObject.parent.child2.new_key).toBe("added");
      expect(doc.toJsObject.parent.child3.key3).toBe(3);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles nested tables where modification shifts all subsequent line numbers', () => {
      const toml = dedent`
        [database.primary]
        host = "db1.example.com"
        port = 5432
        
        [database.secondary]
        host = "db2.example.com" 
        port = 5433
        
        [database.backup]
        host = "backup.example.com"
        port = 5434
        
        [cache.redis]
        host = "redis.example.com"
        port = 6379
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      
      // Insert multiple lines in database.secondary - this shifts everything after it
      // Line-based truncation must handle the line number shifts correctly
      const updatedToml = dedent`
        [database.primary]
        host = "db1.example.com"
        port = 5432
        
        [database.secondary]
        host = "db2.example.com"
        port = 5433
        username = "dbuser" 
        password = "secret"
        ssl_mode = "require"
        
        [database.backup]
        host = "backup.example.com"
        port = 5434
        
        [cache.redis]
        host = "redis.example.com" 
        port = 6379
      ` + '\n';
      
      doc.update(updatedToml);
      
      // Verify that all sections after the modified one are still correct
      expect(doc.toJsObject.database.primary.host).toBe("db1.example.com");
      expect(doc.toJsObject.database.secondary.host).toBe("db2.example.com");
      expect(doc.toJsObject.database.secondary.username).toBe("dbuser");
      expect(doc.toJsObject.database.secondary.password).toBe("secret");
      expect(doc.toJsObject.database.secondary.ssl_mode).toBe("require");
      expect(doc.toJsObject.database.backup.host).toBe("backup.example.com");
      expect(doc.toJsObject.cache.redis.host).toBe("redis.example.com");
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('handles deeply nested table hierarchy with mid-level modifications', () => {
      const toml = dedent`
        [app.server.config]
        port = 8080
        
        [app.server.middleware] 
        auth = true
        
        [app.server.routes]
        api = "/api/v1"
        
        [app.database.config]
        url = "postgres://localhost"
        
        [app.database.pool]
        max_connections = 10
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      
      // Modify app.server.middleware (middle of server section)
      // This tests if truncation correctly handles nested hierarchies
      const updatedToml = dedent`
        [app.server.config]
        port = 8080
        
        [app.server.middleware]
        auth = true
        cors = true
        rate_limit = 100
        
        [app.server.routes]
        api = "/api/v1"
        
        [app.database.config] 
        url = "postgres://localhost"
        
        [app.database.pool]
        max_connections = 10
      ` + '\n';
      
      doc.update(updatedToml);
      
      // Ensure the nested structure is preserved correctly
      expect(doc.toJsObject.app.server.config.port).toBe(8080);
      expect(doc.toJsObject.app.server.middleware.auth).toBe(true);
      expect(doc.toJsObject.app.server.middleware.cors).toBe(true);
      expect(doc.toJsObject.app.server.middleware.rate_limit).toBe(100);
      expect(doc.toJsObject.app.server.routes.api).toBe("/api/v1");
      expect(doc.toJsObject.app.database.config.url).toBe("postgres://localhost");
      expect(doc.toJsObject.app.database.pool.max_connections).toBe(10);
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('stress test: complex nested modifications that could break truncation logic', () => {
      const toml = dedent`
        [services.web.frontend]
        framework = "react"
        
        [services.web.backend] 
        framework = "node"
        
        [services.web.database]
        type = "postgres"
        
        [services.api.v1]
        enabled = true
        
        [services.api.v2]
        enabled = false
        
        [monitoring.metrics]
        provider = "prometheus"
        
        [monitoring.logs]
        provider = "elasticsearch"
      ` + '\n';
      
      const doc = new TomlDocument(toml);
      
      // Complex modification: change services.web.backend extensively
      // This could potentially confuse truncation about where sections begin/end
      const updatedToml = dedent`
        [services.web.frontend]
        framework = "react"
        
        [services.web.backend]
        framework = "node" 
        version = "18.0.0"
        env = "production"
        workers = 4
        memory_limit = "2GB"
        
        [services.web.database]
        type = "postgres"
        
        [services.api.v1]
        enabled = true
        
        [services.api.v2] 
        enabled = false
        
        [monitoring.metrics]
        provider = "prometheus"
        
        [monitoring.logs]
        provider = "elasticsearch"
      ` + '\n';
      
      doc.update(updatedToml);
      
      // Verify entire nested structure integrity
      expect(doc.toJsObject.services.web.frontend.framework).toBe("react");
      expect(doc.toJsObject.services.web.backend.framework).toBe("node");
      expect(doc.toJsObject.services.web.backend.version).toBe("18.0.0");
      expect(doc.toJsObject.services.web.backend.env).toBe("production");
      expect(doc.toJsObject.services.web.backend.workers).toBe(4);
      expect(doc.toJsObject.services.web.backend.memory_limit).toBe("2GB");
      expect(doc.toJsObject.services.web.database.type).toBe("postgres");
      expect(doc.toJsObject.services.api.v1.enabled).toBe(true);
      expect(doc.toJsObject.services.api.v2.enabled).toBe(false);
      expect(doc.toJsObject.monitoring.metrics.provider).toBe("prometheus");
      expect(doc.toJsObject.monitoring.logs.provider).toBe("elasticsearch");
      expect(doc.toTomlString).toBe(updatedToml);
    });

    it('should preserve bracket spacing when patching arrays', () => {
      // Original TOML with no bracket spacing in arrays
      const originalToml = dedent`
        title = "Test Config"
        tags = ["web", "api", "database"]
        ports = [80, 443, 8080]
        
        [server]
        name = "production"
        ips = ["192.168.1.1", "192.168.1.2"]
      ` + '\n';
      
      const doc = new TomlDocument(originalToml);
      
      // Patch by adding elements to existing arrays
      const updatedObj = {
        title: "Test Config",
        tags: ["web", "api", "database", "monitoring"], // Add element to existing array
        ports: [80, 443, 8080, 9090], // Add element to existing array
        server: {
          name: "production",
          ips: ["192.168.1.1", "192.168.1.2", "192.168.1.3"] // Add element to nested array
        }
      };
      
      doc.patch(updatedObj);
      const result = doc.toTomlString;
      
      // The key expectation: preserve NO bracket spacing (no space after [ or before ])
      // It's fine if comma spacing is added when new elements are inserted
      expect(result).toContain('["web", "api", "database", "monitoring"]'); // No bracket spacing, normal comma spacing
      expect(result).toContain('[80, 443, 8080, 9090]'); // No bracket spacing, normal comma spacing
      expect(result).toContain('["192.168.1.1", "192.168.1.2", "192.168.1.3"]'); // No bracket spacing, normal comma spacing
      
      // Should NOT contain bracket spacing (spaces immediately after [ or before ])
      expect(result).not.toContain('[ "web"'); // Should not have space after opening bracket
      expect(result).not.toContain('"monitoring" ]'); // Should not have space before closing bracket
      expect(result).not.toContain('[ 80'); // Should not have space after opening bracket
      expect(result).not.toContain('9090 ]'); // Should not have space before closing bracket
    });

    it('should handle input TOML without comma spacing appropriately', () => {
      // Original TOML with no comma spacing (compact style)
      const originalToml = dedent`
        title = "Compact Config"
        tags = ["web","api","database"]
        ports = [80,443,8080]
        
        [server]
        name = "production"
        ips = ["192.168.1.1","192.168.1.2"]
      ` + '\n';
      
      const doc = new TomlDocument(originalToml);
      
      // Patch by adding elements to existing arrays
      const updatedObj = {
        title: "Compact Config",
        tags: ["web", "api", "database", "monitoring"],
        ports: [80, 443, 8080, 9090],
        server: {
          name: "production",
          ips: ["192.168.1.1", "192.168.1.2", "192.168.1.3"]
        }
      };
      
      doc.patch(updatedObj);
      const result = doc.toTomlString;
      
      // Even with compact input, the tool should add appropriate comma spacing for new elements
      // This documents how the tool handles compact input vs its output formatting
      expect(result).toContain('["web","api","database", "monitoring"]'); // New element gets comma spacing (we might want to add a feature to TomlFormat to preseve the no-comma-spacing style)
      //TODO: Decide if we want to preserve no-comma-spacing style in this case
      expect(result).toContain('[80,443,8080, 9090]'); // New element gets comma spacing
      expect(result).toContain('["192.168.1.1","192.168.1.2", "192.168.1.3"]'); // New element gets comma spacing
      
      // Should still preserve no bracket spacing
      expect(result).not.toContain('[ "web"'); // No space after opening bracket
      expect(result).not.toContain('"monitoring" ]'); // No space before closing bracket
    });

    it('should preserve trailing comma and bracket spacing preferences when adding new arrays', () => {
      // Original TOML with trailing comma in existing array
      const originalToml = dedent`
        title = "App Config"
        existing_tags = ["frontend", "backend",]
        old_tags = ["legacy", "deprecated",]
        port = 3000
      ` + '\n';
      
      const doc = new TomlDocument(originalToml);
      
      // Add a completely new array to the JS object
      const updatedObj = {
        title: "App Config",
        existing_tags: ["frontend", "backend"],
        old_tags: ["legacy", "old"],
        port: 3000,
        new_features: ["auth", "logging", "metrics"], // New array being added
        categories: ["web", "api"] // Another new array
      };
      
      doc.patch(updatedObj);
      const result = doc.toTomlString;
      
      // The expectation: new arrays should adopt the trailing comma preference from existing arrays
      // Since the original had trailing comma, new arrays should also have trailing commas
      expect(result).toContain('new_features = ["auth", "logging", "metrics",]'); // Has trailing comma, no bracket spacing
      expect(result).toContain('categories = ["web", "api",]'); // Has trailing comma, no bracket spacing
      
      // The existing array should maintain its format
      expect(result).toContain('existing_tags = ["frontend", "backend",]'); // Should preserve original format
      expect(result).toContain('old_tags = ["legacy", "old",]'); // Should preserve original format
    });

    describe('formatting bugs to fix', () => {
      it('should preserve trailing commas when completely replacing arrays', () => {
        // This test highlights a bug where trailing commas are lost when arrays are completely replaced
        const originalToml = 'tags = ["a", "b", "c",]\n';
        const doc = new TomlDocument(originalToml);
        
        // Replace with a completely different array (should trigger complete replacement, not element edits)
        doc.patch({ tags: ["x", "y"] });
        const result = doc.toTomlString;
        
        expect(result).toContain('tags = ["x", "y",]'); 
      });

      it('should preserve proper comma spacing in inline tables when editing', () => {
        // This test originally revealed a bug where adding properties to inline tables causes errors
        // ORIGINAL ERROR: Incompatible child type "KeyValue" in insertInline function
        const originalToml = 'config = { host = "localhost", port = 8080 }\n';
        const doc = new TomlDocument(originalToml);
        
        doc.patch({ config: { host: "127.0.0.1", port: 8080, debug: true } });
        const result = doc.toTomlString;
        
        expect(result).toContain('config = { host = "127.0.0.1", port = 8080, debug = true }');
      });

      it('should handle array element removal while preserving format', () => {
        // Edge case: removing elements from arrays with trailing commas
        const originalToml = 'items = ["first", "second", "third",]\n';
        const doc = new TomlDocument(originalToml);
        
        doc.patch({ items: ["first", "third"] }); // Remove middle element
        const result = doc.toTomlString;
        
        // Trailing comma is preserved correctly without extra space
        expect(result).toContain('items = ["first", "third",]');
      });

      it('should handle array element addition while preserving format', () => {
        // Edge case: adding elements to arrays with trailing commas
        const originalToml = 'colors = ["red", "blue",]\n';
        const doc = new TomlDocument(originalToml);
        
        doc.patch({ colors: ["red", "blue", "green"] }); // Add element
        const result = doc.toTomlString;
        
        expect(result).toContain('colors = ["red", "blue", "green",]');
      });

      it('should preserve bracket spacing in complex array updates', () => {
        // Edge case: test all 4 combinations of bracket spacing and trailing comma format
        const originalToml = dedent`
          spaced_with_comma = [ "a", "b", ]
          spaced_no_comma = [ "x", "y" ]
          compact_with_comma = ["p", "q",]
          compact_no_comma = ["m", "n"]
        ` + '\n';
        const doc = new TomlDocument(originalToml);
        
        doc.patch({ 
          spaced_with_comma: ["a", "b", "c"], 
          spaced_no_comma: ["x", "y", "z"],
          compact_with_comma: ["p", "q", "r"],
          compact_no_comma: ["m", "n", "o"]
        });
        const result = doc.toTomlString;
        
        // Test all 4 combinations preserve their original format:
        
        // 1. Spaced with trailing comma: preserves both
        expect(result).toContain('spaced_with_comma = [ "a", "b", "c", ]');
        
        // 2. Spaced without trailing comma: preserves spacing, no trailing comma
        expect(result).toContain('spaced_no_comma = [ "x", "y", "z" ]');
        
        // 3. Compact with trailing comma: preserves trailing comma, no spacing
        expect(result).toContain('compact_with_comma = ["p", "q", "r",]');
        
        // 4. Compact without trailing comma: preserves both (no spacing, no trailing comma)
        expect(result).toContain('compact_no_comma = ["m", "n", "o"]');
      });

      it('should preserve brace spacing in complex inline table updates', () => {
        // Edge case: test all 4 combinations of brace spacing and trailing comma format for inline tables
        const originalToml = dedent`
          spaced_with_comma = { a = 1, b = 2, }
          spaced_no_comma = { x = 3, y = 4 }
          compact_with_comma = {p = 5, q = 6,}
          compact_no_comma = {m = 7, n = 8}
        ` + '\n';
        const doc = new TomlDocument(originalToml);
        
        doc.patch({ 
          spaced_with_comma: { a: 1, b: 2, c: 3 }, 
          spaced_no_comma: { x: 3, y: 4, z: 9 },
          compact_with_comma: { p: 5, q: 6, r: 10 },
          compact_no_comma: { m: 7, n: 8, o: 11 }
        });
        const result = doc.toTomlString;
        
        // Test all 4 combinations preserve their original format:
        
        // 1. Spaced with trailing comma: preserves both
        expect(result).toContain('spaced_with_comma = { a = 1, b = 2, c = 3, }');
        
        // 2. Spaced without trailing comma: preserves spacing, no trailing comma
        expect(result).toContain('spaced_no_comma = { x = 3, y = 4, z = 9 }');
        
        // 3. Compact with trailing comma: preserves trailing comma, no spacing
        expect(result).toContain('compact_with_comma = {p = 5, q = 6, r = 10,}');
        
        // 4. Compact without trailing comma: preserves both (no spacing, no trailing comma)
        expect(result).toContain('compact_no_comma = {m = 7, n = 8, o = 11}');
      });

      it('should preserve trailing commas in multiline arrays', () => {
        // Test multiline arrays with and without trailing commas
        const originalToml = dedent`
          integers1 = [
            1, 2, 3
          ]
          
          integers2 = [
            4,
            5,
            6, # this is ok and should be preserved
          ]
          
          integers3 = [
            7,
            8,
            9
          ]
        ` + '\n';
        
        const doc = new TomlDocument(originalToml);
        
        // Add elements to each array - should preserve their original trailing comma format
        doc.patch({
          integers1: [1, 2, 3, 10], // No trailing comma originally
          integers2: [4, 5, 6, 11], // Had trailing comma originally
          integers3: [7, 8, 9, 12]  // No trailing comma originally
        });
        
        const result = doc.toTomlString;
        
        // integers1: should not have trailing comma (preserve original format)
        expect(result).toContain('integers1 = [\n  1, 2, 3, 10\n]');
        
        // integers2: should have trailing comma (preserve original format)
        // Note: there might be spacing issues with comments, but trailing comma should be preserved
        expect(result).toContain('integers2 = [\n  4,\n  5,\n  6,\n  11,    # this is ok and should be preserved\n]');
        
        // integers3: should not have trailing comma (preserve original format)  
        expect(result).toContain('integers3 = [\n  7,\n  8,\n  9,\n  12\n]');
      });

      it('should preserve multiline array formatting styles when adding elements', () => {
        // Test different multiline array styles
        const originalToml = dedent`
          # Compact multiline (no trailing comma)
          colors = ["red", "green",
                    "blue"]
          
          # Spaced multiline with trailing comma  
          fruits = [
            "apple",
            "banana",
            "cherry",
          ]
          
          # Mixed style (some items on same line)
          numbers = [1, 2,
                     3, 4,
                     5]
        ` + '\n';
        
        const doc = new TomlDocument(originalToml);
        
        // Add elements to each array
        doc.patch({
          colors: ["red", "green", "blue", "yellow"],
          fruits: ["apple", "banana", "cherry", "date"],
          numbers: [1, 2, 3, 4, 5, 6]
        });
        
        const result = doc.toTomlString;
        
        // Each array should maintain its original style
        expect(result).toContain('colors = ["red", "green",\n          "blue", "yellow"]'); // No trailing comma
        expect(result).toContain('fruits = [\n  "apple",\n  "banana",\n  "cherry",\n  "date",\n]'); // Has trailing comma
        expect(result).toContain('numbers = [1, 2,\n           3, 4,\n           5, 6]'); // No trailing comma
      });

      it('should preserve formatting in mixed-type multiline arrays', () => {
        // Test mixed-type arrays with different formatting styles
        const originalToml = dedent`
          # Mixed numbers without trailing comma
          numbers = [ 0.1, 0.2, 0.5, 1, 2, 5 ]
          
          # Mixed-type contributors with trailing comma
          contributors = [
            "Foo Bar <foo@example.com>",
            { name = "Baz Qux", email = "bazqux@example.com", url = "https://example.com/bazqux" },
          ]
          
          # Mixed types compact style
          mixed_compact = [1, "string", true, 3.14]
          
          # Mixed types multiline without trailing comma
          mixed_multiline = [
            42,
            "hello world",
            false,
            { key = "value" }
          ]
        ` + '\n';
        
        const doc = new TomlDocument(originalToml);
        
        // Add elements to each mixed-type array
        doc.patch({
          numbers: [0.1, 0.2, 0.5, 1, 2, 5, 10],
          contributors: [
            "Foo Bar <foo@example.com>",
            { name: "Baz Qux", email: "bazqux@example.com", url: "https://example.com/bazqux" },
            "New Contributor <new@example.com>"
          ],
          mixed_compact: [1, "string", true, 3.14, "new"],
          mixed_multiline: [
            42,
            "hello world", 
            false,
            { key: "value" },
            99
          ]
        });
        
        const result = doc.toTomlString;
        
        // Verify each mixed-type array maintains its original formatting
        expect(result).toContain('numbers = [ 0.1, 0.2, 0.5, 1, 2, 5, 10 ]'); // No trailing comma, inline
        
        // Contributors array should have trailing comma and multiline format
        expect(result).toContain('contributors = [\n  "Foo Bar <foo@example.com>",\n  { name = "Baz Qux", email = "bazqux@example.com", url = "https://example.com/bazqux" },\n  "New Contributor <new@example.com>",\n]');
        
        expect(result).toContain('mixed_compact = [1, "string", true, 3.14, "new"]'); // No trailing comma, inline
        
        // Mixed multiline should not have trailing comma
        expect(result).toContain('mixed_multiline = [\n  42,\n  "hello world",\n  false,\n  { key = "value" },\n  99\n]');
        
        // Verify that inline tables within arrays are preserved correctly
        expect(result).toContain('{ name = "Baz Qux", email = "bazqux@example.com", url = "https://example.com/bazqux" }');
        expect(result).toContain('{ key = "value" }');
      });
    });
  });
});
