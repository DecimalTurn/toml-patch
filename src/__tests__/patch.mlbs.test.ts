import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';


// Specific tests for literal multiline strings (''') - testing literal behavior
describe('literal multiline strings - specific behavior', () => {
  test('should preserve literal multiline string without escaping backslashes', () => {
    const existing = dedent`
      [package]
      name = "example"
      path = '''
      C:\\Users\\Example\\Path
      '''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // When setting a JavaScript string with single backslashes
    obj.package.path = "D:\\Data\\Files";
    const patched = patch(existing, obj);
    
    // In literal strings, backslashes are NOT doubled - they remain as single backslashes
    const expectedOutput = dedent`
      [package]
      name = "example"
      path = '''
      D:\Data\Files'''
      version = "1.0.0"
      ` + '\n';

    expect(patched).toEqual(expectedOutput);
  });

  test('should handle literal multiline string with actual newlines vs escape sequences', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''
      Old text
      '''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Setting a JavaScript string that contains the characters \ and n
    obj.package.text = "Line with \\n literal backslash-n";
    const patched = patch(existing, obj);
    
    // Literal strings show backslash-n as actual characters (not newline)
    // In the template we need to escape the backslash as \\n
    const expectedOutput = `[package]
name = "example"
text = '''
Line with \\n literal backslash-n'''
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });

  test('should handle literal multiline string with triple quotes in content', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''Old text'''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Literal strings cannot contain ''' so it should convert to basic string
    obj.package.text = "Text with ''' quotes";
    const patched = patch(existing, obj);
    
    // Should convert from literal (''') to basic (""")
    // Note: ''' doesn't need escaping in basic strings, only """ needs escaping
    const expectedOutput = `[package]
name = "example"
text = """Text with ''' quotes"""
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });

  test('should NOT add leading newline when converting literal string with newline in middle', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''line one
      line two'''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Change value to require conversion to basic string
    obj.package.text = "has ''' quotes";
    const patched = patch(existing, obj);
    
    // Should convert to basic string WITHOUT leading newline
    // (the original literal string had newline in content, not at the start)
    const expectedOutput = `[package]
name = "example"
text = """has ''' quotes"""
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });

  test('should preserve leading newline when converting literal string with leading newline', () => {
    const existing = dedent`
      [package]
      name = "example"
      text = '''
      Old text
      '''
      version = "1.0.0"
      ` + '\n';

    const obj = parse(existing);
    // Change value to require conversion to basic string
    obj.package.text = "New with ''' quotes";
    const patched = patch(existing, obj);
    
    // Should convert to basic string WITH leading newline
    const expectedOutput = `[package]
name = "example"
text = """
New with ''' quotes"""
version = "1.0.0"
`;

    expect(patched).toEqual(expectedOutput);
  });
});

