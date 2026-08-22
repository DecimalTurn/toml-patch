import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 2185943', () => {
  const src = dedent`
    ei.Nj = """
    >!~Wg-y)~"""
    [[megac68k-]]
    z = [
    ]
    kw = [46674.18719, 48559.13327, 2091-08-20T06:58:11, 2024-05-10, 275_068, {
        cnoff = { l7."UMN$eUS9="."" = '''
    C/,9''' },
        aujqbb = '''
    P/*''',
    }, 22787.072880, 79051.79185, true]
    "1x(4u.WK2x".v4r4evh1.c3pw90 = """
    m@7"""
  `;

  const obj = parse(src) as any;
  delete obj["megac68k-"][0].kw[5].cnoff.l7["UMN$eUS9="];

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("ei.Nj = \"\"\"\n>!~Wg-y)~\"\"\"\n[[megac68k-]]\nz = [\n]\nkw = [46674.18719, 48559.13327, 2091-08-20T06:58:11, 2024-05-10, 275_068, {\n    cnoff = {  l7 = {} },\n                   aujqbb = '''\nP/*''',\n               },                 ]\n   22787.072880, 79051.79185, true\n\"1x(4u.WK2x\".v4r4evh1.c3pw90 = \"\"\"\nm@7\"\"\"");
});
