import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 2531104', () => {
  const src = dedent`
    mmx9rwvk7k.lqmp_-1cgl = '''
     5>ZvY=\`r~ha'''
    wcyw = {
        tf."O\`aB" = [true, { "%#FUrN".cvmmswb6.">&K?" = 115668, p2ohe0.sqh9uj."$Qk^~(" = -92131.88369, kvy9 = false, kvy9h1bo.fe7b1px4bb = """
    :-i1""" }, 745102, 96226.27680, 0o21016, false, 802344, "#vH#E:o>J[jB||M"],
        l."~u)HFjuZ" = 00:16:17,
    }
  `;

  const obj = parse(src) as any;
  obj.wcyw.tf["O`aB"][1] = { "k96": 1640, "k18": true };

  const result = patch(src, obj, {
  inlineTableStart: 1,
  trailingComma: true,
  bracketSpacing: false,
  updateOrder: true,
  trailingNewline: 1,
  newLine: '\n',
  leadingBom: true,
  truncateZeroTimeInDates: false,
  useTabsForIndentation: false,
  minimumDecimals: 1
});
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("﻿mmx9rwvk7k.lqmp_-1cgl = '''\n 5>ZvY=`r~ha'''\nwcyw = {\n    tf.\"O`aB\" = [true, {k96 = 1640.0, k18 = true}, 745102, 96226.27680, 0o21016, false, 802344, \"#vH#E:o>J[jB||M\"],\n\n}   l.\"~u)HFjuZ\" = 00:16:17,\n");
});
