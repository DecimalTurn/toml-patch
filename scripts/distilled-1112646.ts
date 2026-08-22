import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 1112646', () => {
  const src = dedent`
    [["2S38X#"]]
    "dj/{gXY".sp_ya888x.mx7h8hlr = '''
    D<'''
    ln_n = [
        '''
    ,''',
        [{ "t&R/jR" = '''
    TPV!''' }, false, 287_173, "NAzv Be{}8z]C2QzJpyz}_]idd", 1984-04-16T12:37:13Z],
    ]
  `;

  const obj = parse(src) as any;
  obj["2S38X#"][0]["dj/{gXY"].sp_ya888x = [new Date(Date.UTC(2018, 5, 14)), -2069, 784];

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("[[\"2S38X#\"]]\n\"dj/{gXY\".sp_ya888x = [ 2018-06-14T00:00:00.000Z, -2069, 784, ]\nln_n = [\n    '''\n,''',\n    [{ \"t&R/jR\" = '''\nTPV!''' }, false, 287_173, \"NAzv Be{}8z]C2QzJpyz}_]idd\", 1984-04-16T12:37:13Z],\n]");
});
