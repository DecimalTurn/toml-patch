import dedent from 'dedent';
import { parse, patch } from '../';

import '../../scripts/distilled-175924';
import '../../scripts/distilled-377453';
import '../../scripts/distilled-771152';
import '../../scripts/distilled-863664';
import '../../scripts/distilled-1112646';
import '../../scripts/distilled-1286183';
import '../../scripts/distilled-1383962';
import '../../scripts/distilled-1693919';
import '../../scripts/distilled-1896226';
import '../../scripts/distilled-2185943';
import '../../scripts/distilled-2497422';
import '../../scripts/distilled-2531104';
import '../../scripts/distilled-2667551';
import '../../scripts/distilled-2824408';
import '../../scripts/distilled-2858114';

test('distilled fuzz seed 2591153: preserve nested array coordinates across edits', () => {
  const src = dedent`
    w2 = 2049-04-03T21:46:36.579301
    ["AKy:}nV@"]
    p8 = {
      uyvk4h."m}5?" = "Jl*~zOV7.6JlX?C~VdO$dA3A~},$#/*w<JO",
      "(J<nemN,8".s2."+)3k/" = [967985, -25027300000000694064, true, true, 50_953.25829, ["yXG33^DO3b4iLEKw?", 0b100101, -650416], """
    uP,\`RY
    ,n\`
    nZ7mx[

    P9
    5=2O"""],
      z8o4hp = 'sr3[0&q}/SDjQc)Ado5zrkdi4bAp0]nkTFHbTWgme<?a)',
    }
  `;
  const obj = parse(src) as any;
  delete obj.w2;
  obj['AKy:}nV@'].p8['(J<nemN,8'].s2['+)3k/'] = [true, false, true, 3173];
  obj['AKy:}nV@'].p8['(J<nemN,8'].s2['+)3k/'].splice(3, 0, 3173);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});
