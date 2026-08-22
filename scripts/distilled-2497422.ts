import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 2497422', () => {
  const src = dedent`
    "x^@zw" = [' ', -78860.81892, { ik4o2d6z4j = """
    DM}T+uCZVx*t+qMtQtbPrFiI""" }, "\`kO^E(R8324tzB;#iBmn9aX!9KUL*N0eWvf/J:R", 36709.83314, [true, "ZrS|K#MaiwaYr4UOIP<$=8clcC*+Px{^#v@>G|(@>;a>w&X&Jb", 945e+85, -30134.83738, {
    }, """
    HLzq$8|?""", "<Rfs2A h+<TD:_8+oKb64ffE,uqNI-WjbafZn!", 17:57:10, false, false], -31687.66292]
  `;

  const obj = parse(src) as any;
  delete obj["x^@zw"][2].ik4o2d6z4j;

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("\"x^@zw\" = [' ', -78860.81892, {}, \"`kO^E(R8324tzB;#iBmn9aX!9KUL*N0eWvf/J:R\", 36709.83314, [true, \"ZrS|K#MaiwaYr4UOIP<$=8clcC*+Px{^#v@>G|(@>;a>w&X&Jb\", 945e+85, -30134.83738, {\n},    \"\"\"\nHLzq$8|?\"\"\",    \"<Rfs2A h+<TD:_8+oKb64ffE,uqNI-WjbafZn!\", 17:57:10, false, fal,e   -31687.66292]");
});
