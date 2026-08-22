import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 1693919', () => {
  const src = dedent`
    [g3s_y5jv_d.mfdfdc]
    "".c4esqy.t79d__y = {
        bnJF1EQ = { jg08iizbia = """
     fP=SCd-/e]!;bs(AR*w3L""" },
        "#?VRmg"."<mhN6Oe|cu" = ["""
    v[""", nan, "1T4f9 KxuH<=a3UzaPuktBT"],
    }
  `;

  const obj = parse(src) as any;
  obj.g3s_y5jv_d.mfdfdc[""].c4esqy.t79d__y.bnJF1EQ = { "k27": { "k57": false, "k17": false, "k67": [new Date(Date.UTC(2036, 8, 23)), true, -1287.6224634237587] } };

  const result = patch(src, obj, {
  inlineTableStart: 1,
  trailingComma: true,
  bracketSpacing: true,
  updateOrder: false,
  trailingNewline: 1,
  newLine: '\r\n',
  leadingBom: false,
  truncateZeroTimeInDates: false,
  useTabsForIndentation: true
});
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("[g3s_y5jv_d.mfdfdc]\r\n\"\".c4esqy.t79d__y = {\r\n\t\t\t\tbnJF1EQ = { k27 = { k57 = false, k17 = false, k67 = [ 2036-09-23T00:00:00.000Z, true, -1287.6224634237587, ], } },\r\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\"#?VRmg\".\"<mhN6Oe|cu\" = [\"\"\"\r\nv[\"\"\",                               ],                                                          nan, \"1T4f9 KxuH<=a3UzaPuktBT\"\r\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t}\r\n");
});
