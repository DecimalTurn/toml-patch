import parseTOML, { continueParsingTOML } from '../parse-toml';
import toJS from '../to-js';
import dedent from 'dedent';

describe('continueParsingTOML', () => {
  it('appends parsed items from remaining string to existing CST', () => {
    const initialToml = dedent`
      [section1]
      key1 = "value1"
    `;
    const remainingToml = dedent`
      [section2]
      key2 = "value2"
    `;
    
    const initialCst = parseTOML(initialToml);
    const completeCst = continueParsingTOML(initialCst, remainingToml);
    
    const result = toJS(completeCst);
    expect(result).toEqual({
      section1: { key1: 'value1' },
      section2: { key2: 'value2' }
    });
  });

  it('combines two CSTs for conversion to JS', () => {
    const initialToml = dedent`
      # Initial comment
      [section1]
      key1 = 1
    `;
    const remainingToml = dedent`
      # Second section
      [section2]
      key2 = 2
    `;
    
    const initialCst = parseTOML(initialToml);
    const completeCst = continueParsingTOML(initialCst, remainingToml);
    
    // This works for toJS because it doesn't rely on line numbers
    const result = toJS(completeCst);
    expect(result).toEqual({
      section1: { key1: 1 },
      section2: { key2: 2 }
    });
  });

  it('handles empty remaining string', () => {
    const initialToml = dedent`
      [section]
      key = "value"
    `;
    const remainingToml = '';
    
    const initialCst = parseTOML(initialToml);
    const completeCst = continueParsingTOML(initialCst, remainingToml);
    
    const result = toJS(completeCst);
    expect(result).toEqual({
      section: { key: 'value' }
    });
  });

  it('handles empty initial CST', () => {
    const initialToml = '';
    const remainingToml = dedent`
      [section]
      key = "value"
    `;
    
    const initialCst = parseTOML(initialToml);
    const completeCst = continueParsingTOML(initialCst, remainingToml);
    
    const result = toJS(completeCst);
    expect(result).toEqual({
      section: { key: 'value' }
    });
  });

  it('works with nested tables', () => {
    const initialToml = dedent`
      [parent.child1]
      key1 = 1
    `;
    const remainingToml = dedent`
      [parent.child2]
      key2 = 2
    `;
    
    const initialCst = parseTOML(initialToml);
    const completeCst = continueParsingTOML(initialCst, remainingToml);
    
    const result = toJS(completeCst);
    expect(result).toEqual({
      parent: {
        child1: { key1: 1 },
        child2: { key2: 2 }
      }
    });
  });

  it('works with table arrays', () => {
    const initialToml = dedent`
      [[products]]
      name = "Product 1"
    `;
    const remainingToml = dedent`
      [[products]]
      name = "Product 2"
    `;
    
    const initialCst = parseTOML(initialToml);
    const completeCst = continueParsingTOML(initialCst, remainingToml);
    
    const result = toJS(completeCst);
    expect(result).toEqual({
      products: [
        { name: 'Product 1' },
        { name: 'Product 2' }
      ]
    });
  });

  it('rebases newly parsed positions when a start position is provided', () => {
    const initialCst = [...parseTOML(`a = 1\n`)];
    const completeCst = [...continueParsingTOML(initialCst, `b = 2\n`, { line: 3, column: 0 })];

    expect(completeCst).toHaveLength(2);
    expect(completeCst[0].loc.start).toEqual({ line: 1, column: 0 });
    expect(completeCst[1].loc.start).toEqual({ line: 3, column: 0 });
  });

  it('offsets the first suffix line column by the start column', () => {
    const completeCst = [...continueParsingTOML([], `key = "value"\n`, { line: 2, column: 4 })];

    expect(completeCst).toHaveLength(1);
    expect(completeCst[0].loc.start).toEqual({ line: 2, column: 4 });
  });
});
