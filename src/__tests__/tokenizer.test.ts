import { tokenize } from '../tokenizer';
import { example } from '../__fixtures__';

test('should tokenize simple input', () => {
  expect([...tokenize(`a = "b"`)]).toMatchSnapshot();
});

test('should tokenize multiline strings', () => {
  expect([
    ...tokenize(`
    a = "b"
    c = 'd'
    e = """
      f
    """
    g = '''
      h
    '''
    "i".'j'.k = "l"
  `)
  ]).toMatchSnapshot();
});

test('should tokenize dotted key with spaces', () => {
  expect([...tokenize(`[[ a . "b" . 'c' ]]`)]).toMatchSnapshot();
});

test('should tokenize complex input', () => {
  expect([...tokenize(example)]).toMatchSnapshot();
});

test('should handle escaped solidus', () => {
  expect([...tokenize(`a = "\\\\"`)]).toMatchSnapshot();
});

test('should reject control characters in unquoted values', () => {
  expect(() => [...tokenize('x = 1.5\u000B')]).toThrow(); // vertical tab
  expect(() => [...tokenize('x = 1.5\u007F')]).toThrow(); // DEL
  expect(() => [...tokenize('x = 1.5\u000C')]).toThrow(); // form feed
});

test('should reject control characters in comments', () => {
  expect(() => [...tokenize('a = 1 # c\u007F')]).toThrow(); // DEL
});
