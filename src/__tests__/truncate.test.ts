import parseTOML from '../parse-toml';
import { truncateAst, findLastNodeBeforePosition } from '../truncate';
import toJS from '../to-js';
import { NodeType } from '../ast';
import dedent from 'dedent';

describe('truncateAst', () => {
  it('truncates AST at specified position', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
      
      [section2]
      key2 = "value2"
    `;
    
    const ast = parseTOML(toml);
    // Truncate at line 3 (before section2)
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 3, 0);
    
    const result = toJS(truncatedAst);
    expect(result).toEqual({
      section1: { key1: 'value1' }
    });
    expect(lastEndPosition).not.toBeNull();
  });

  it('includes all nodes when position is after the document', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
      
      [section2]
      key2 = "value2"
    `;
    
    const ast = parseTOML(toml);
    // Truncate at a position beyond the document
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 100, 0);
    
    const result = toJS(truncatedAst);
    expect(result).toEqual({
      section1: { key1: 'value1' },
      section2: { key2: 'value2' }
    });
    expect(lastEndPosition).not.toBeNull();
  });

  it('returns empty AST when position is before any content', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
    `;
    
    const ast = parseTOML(toml);
    // Truncate at line 0 (before everything)
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 0, 0);
    
    const result = toJS(truncatedAst);
    expect(result).toEqual({});
    expect(lastEndPosition).toBeNull();
  });

  it('handles comments correctly', () => {
    const toml = dedent`
      # Comment 1
      [section1]
      key1 = "value1"
      
      # Comment 2
      [section2]
      key2 = "value2"
    `;
    
    const ast = parseTOML(toml);
    // Truncate just before section2 (line 6 starts section2, so use line 5)
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 5, 999);
    const truncated = [...truncatedAst];
    
    // Should include: Comment 1, section1 (with key1 and Comment 2 inside its items)
    expect(truncated).toHaveLength(2); // Comment, Table
    expect(truncated[0].type).toBe(NodeType.Comment);
    expect(truncated[1].type).toBe(NodeType.Table);
    expect(lastEndPosition).not.toBeNull();
  });

  it('truncates at exact column position', () => {
    const toml = dedent`
      a = 1
      b = 2
      c = 3
    `;
    
    const ast = parseTOML(toml);
    // Truncate at line 2, column 0 (right at the start of "b = 2")
    // With the new semantics, this should only include blocks that END before line 2, column 0
    // So only "a = 1" which ends at line 1
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 2, 0);
    
    const result = toJS(truncatedAst);
    expect(result).toEqual({ a: 1 });
    expect(lastEndPosition).not.toBeNull();
  });

  it('handles table arrays', () => {
    const toml = dedent`
      [[products]]
      name = "Product 1"
      
      [[products]]
      name = "Product 2"
      
      [[products]]
      name = "Product 3"
    `;
    
    const ast = parseTOML(toml);
    // Truncate to include only first two products
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 6, 0);
    
    const result = toJS(truncatedAst);
    expect(result).toEqual({
      products: [
        { name: 'Product 1' },
        { name: 'Product 2' }
      ]
    });
    expect(lastEndPosition).not.toBeNull();
  });

  it('works with nested tables', () => {
    const toml = dedent`
      [parent.child1]
      key1 = 1
      
      [parent.child2]
      key2 = 2
      
      [parent.child3]
      key3 = 3
    `;
    
    const ast = parseTOML(toml);
    // Truncate at line 5, column 0 (start of [parent.child2])
    // With the new semantics, this should only include blocks that END before line 5
    // So only [parent.child1] which ends at line 2
    const { truncatedAst, lastEndPosition } = truncateAst(ast, 5, 0);
    
    const result = toJS(truncatedAst);
    expect(result).toEqual({
      parent: {
        child1: { key1: 1 }
      }
    });
    expect(lastEndPosition).not.toBeNull();
  });
});

describe('findLastNodeBeforePosition', () => {
  it('finds the last node before the specified position', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
      
      [section2]
      key2 = "value2"
    `;
    
    const ast = parseTOML(toml);
    const lastNode = findLastNodeBeforePosition(ast, 3, 0);
    
    expect(lastNode).toBeDefined();
    expect(lastNode?.type).toBe(NodeType.Table);
  });

  it('returns undefined when no nodes are before the position', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
    `;
    
    const ast = parseTOML(toml);
    const lastNode = findLastNodeBeforePosition(ast, 0, 0);
    
    expect(lastNode).toBeUndefined();
  });

  it('returns the last node when position is after all content', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
      
      [section2]
      key2 = "value2"
    `;
    
    const ast = parseTOML(toml);
    const lastNode = findLastNodeBeforePosition(ast, 100, 0);
    
    expect(lastNode).toBeDefined();
    expect(lastNode?.type).toBe(NodeType.Table);
  });

  it('finds last top-level block', () => {
    const toml = dedent`
      [section1]
      key1 = "value1"
      
      # Important comment
      
      [section2]
      key2 = "value2"
    `;
    
    // Parse each time to get a fresh generator
    const lastNode = findLastNodeBeforePosition(parseTOML(toml), 4, 999);
    
    expect(lastNode).toBeDefined();
    // The last top-level block before line 5 is section1 (the comment is inside it)
    expect(lastNode?.type).toBe(NodeType.Table);
  });

  it('handles exact position matches', () => {
    const toml = dedent`
      a = 1
      b = 2
      c = 3
    `;
    
    const ast = parseTOML(toml);
    // Position at the start of "b = 2"
    const lastNode = findLastNodeBeforePosition(ast, 2, 0);
    
    expect(lastNode).toBeDefined();
    expect(lastNode?.type).toBe(NodeType.KeyValue);
  });
});
