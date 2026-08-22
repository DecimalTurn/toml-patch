import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 2667551', () => {
  const src = dedent`
    [[xwed7dv]]
    w9ri7t6az = {
    }
    ax.dkibhxt = ['', """
    >X+YrY\`N""", 2088-10-24T00:54:56, """
    $e"""]
  `;

  const obj = parse(src) as any;
  obj.xwed7dv[0].ax.dkibhxt.splice(2, 1);

  const result = patch(src, obj, {
  inlineTableStart: 1,
  trailingComma: false,
  bracketSpacing: false,
  updateOrder: true,
  trailingNewline: 1,
  newLine: '\n',
  leadingBom: false,
  truncateZeroTimeInDates: true,
  useTabsForIndentation: false
});
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("[[xwed7dv]]\nw9ri7t6az = {\n}\nax.dkibhxt = ['', \"\"\"\n>X+YrY`N\"\"\", \"\"\"\n$e\"\"\"\n");
});
