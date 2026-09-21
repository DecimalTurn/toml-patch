import { getLine } from '../location';
import dedent from 'dedent';

describe('location.getLine', () => {
  test('returns the correct line across successive inputs', () => {
    const first = dedent`
      one . two = 1
      three = 2
    `;
    const second = dedent`
      different
      content
      here
    `;

    expect(getLine(first, { line: 1, column: 0 })).toBe('one . two = 1');
    expect(getLine(first, { line: 2, column: 0 })).toBe('three = 2');

    // Switching inputs must not reuse the previous input's line indexes.
    expect(getLine(second, { line: 1, column: 0 })).toBe('different');
    expect(getLine(second, { line: 3, column: 0 })).toBe('here');

    // Switching back is also correct.
    expect(getLine(first, { line: 2, column: 0 })).toBe('three = 2');
  });

  test('returns the correct line for inputs with different line boundaries', () => {
    const first = 'aa\nbb';
    const second = 'a\nbbb';

    expect(getLine(first, { line: 2, column: 0 })).toBe('bb');
    expect(getLine(second, { line: 2, column: 0 })).toBe('bbb');
  });
});
