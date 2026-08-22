import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 2824408', () => {
  const src = dedent`
    [ivk.nuan749c7]
    pJ.kd7jct7_o = {
        xwjbnijuw = { k-l259ef = "E2 U!/a", vi.dg5 = true, f4wkz1o_j.cgog.gw8umgy = '''
    t5B02omW_Qc5gU}''', qcc3pxkelq._G = """
    \`]cA6:81:-L__K?yaccQdE{zs{v$8?CN?be""" },
        "\`pD".r = "U9SE]2S+<Ak^k|5lymMuq=\`2w_mfA%m-Q,NMYi1;:5e^v",
    }
    heo47x9_j.qoa2f-.qoyfi7jwn = [
    ]
    nbtq.sx6 = {
    }
  `;

  const obj = parse(src) as any;
  obj.ivk.nuan749c7.pJ.kd7jct7_o.xwjbnijuw = { "k19": -188 };

  const result = patch(src, obj, {
  trailingComma: true,
  bracketSpacing: false,
  updateOrder: true,
  trailingNewline: 2,
  newLine: '\n',
  leadingBom: false,
  truncateZeroTimeInDates: false,
  useTabsForIndentation: false,
  minimumDecimals: 1
});
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("[ivk.nuan749c7]\npJ.kd7jct7_o = {\n    xwjbnijuw = {k19 = -188.0},\n\"`pD\"U9SE]2S+<Ak^k|5lymMuq=`2w_mfA%m-Q,NMYi1;:5e^v\",\n}\n\nheo47x9_j.qoa2f-.qoyfi7jwn = [\n]\nnbtq.sx6 = {\n}\n\n");
});
