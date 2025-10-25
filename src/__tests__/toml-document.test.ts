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
});
