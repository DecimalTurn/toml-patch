import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = resolve(process.argv[2] ?? process.cwd());
const api = await import(pathToFileURL(resolve(target, 'src/index.ts')).href);
const { parse, patch } = api;

const source = `w2 = 2049-04-03T21:46:36.579301
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
const object = parse(source) as any;
delete object.w2;
object['AKy:}nV@'].p8['(J<nemN,8'].s2['+)3k/'] = [true, false, true, 3173];
object['AKy:}nV@'].p8['(J<nemN,8'].s2['+)3k/'].splice(3, 0, 3173);
try {
  const result = patch(source, object);
  console.log(result);
  console.log('roundtrip', JSON.stringify(parse(result)) === JSON.stringify(object));
} catch (error) {
  console.log('throws', (error as Error).message);
}
