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
    
    const initialAst = parseTOML(initialToml);
    const completeAst = continueParsingTOML(initialAst, remainingToml);
    
    const result = toJS(completeAst);
    expect(result).toEqual({
      section1: { key1: 'value1' },
      section2: { key2: 'value2' }
    });
  });

  it('combines two ASTs for conversion to JS', () => {
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
    
    const initialAst = parseTOML(initialToml);
    const completeAst = continueParsingTOML(initialAst, remainingToml);
    
    // This works for toJS because it doesn't rely on line numbers
    const result = toJS(completeAst);
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
    
    const initialAst = parseTOML(initialToml);
    const completeAst = continueParsingTOML(initialAst, remainingToml);
    
    const result = toJS(completeAst);
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
    
    const initialAst = parseTOML(initialToml);
    const completeAst = continueParsingTOML(initialAst, remainingToml);
    
    const result = toJS(completeAst);
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
    
    const initialAst = parseTOML(initialToml);
    const completeAst = continueParsingTOML(initialAst, remainingToml);
    
    const result = toJS(completeAst);
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
    
    const initialAst = parseTOML(initialToml);
    const completeAst = continueParsingTOML(initialAst, remainingToml);
    
    const result = toJS(completeAst);
    expect(result).toEqual({
      products: [
        { name: 'Product 1' },
        { name: 'Product 2' }
      ]
    });
  });
});
