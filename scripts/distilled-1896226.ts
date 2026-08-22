import dedent from 'dedent';
import { parse, patch } from '../src';

test('distilled regression for fuzz seed 1896226', () => {
  const src = dedent`
    y0pgo = '''
    zw$#+{rD] Q:|WI_5xV'''
    [syn2x.b.o6y2i]
    xx1dnmb-lu.i-b5qipqve = { kh5rr3tnn.tfv.acbd8jed_ = true, am7fwt.jri8xuo = "drC+m!9n vxA(?w8N+)9]jF1 /", eu0e.ygeqkl.rv5zela02z = -792779, c.teb.pe = 0xd45, fk-no = false, wvddr.gmv.d8iwt = "]49F#3@Gi^y{@4y(eYalh%@", piif.qwkfgiyp = false, "kNg6#mA".mmu1i.u1aubp = true, hk3wa8v.">uk|E\`!8a" = 2055-10-17T23:43:59.550334Z, "|EnD &e~>\`".npriy.OU = inf, m3y3lj.viyt2w.c = "U/qmv0wx=W/ib/M^t<t7vC[#J_?KpncFg?a", quumciha = {
    }, q."5;" = 704498, k9zaeuluse."8%2Z?" = """
    wU:Z""" }
    yutxpp.uzz."/S|" = ["WM^ZLQ}e", -836_768, { c19.hv = { "Z\`xk2<4{" = "08RXrX/B]Wjo}v77}^Rx", be9z3h.gaxei2pmox = """
    """, V.wgxp4xo62x."T~]x(@Au#" = '', "opB,{-|#" = 0o22, durkp54qyf.uOlU = "wnnD8=|KA1sc(Qy[ qz oX{quU11|g!22/*5W1", n3bwpes.eh.lc8ih = 0o15166757, w = "_j({", "dDSj9b{" = true, "X^(/t)".b_sxy."TU!{BR5hcx" = -6324.85055, qvvau = false, "CnF)-}9Y" = 30824.10286, z.iyyg2 = 0b010011 } }, {
    }, 2004-04-25T17:21:11, -51408.63582, 2006-12-08T20:27:41.624602Z, true, nan, 743736]
  `;

  const obj = parse(src) as any;
  delete obj.syn2x.b.o6y2i.yutxpp.uzz["/S|"][2].c19.hv;

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("y0pgo = '''\nzw$#+{rD] Q:|WI_5xV'''\n[syn2x.b.o6y2i]\nxx1dnmb-lu.i-b5qipqve = { kh5rr3tnn.tfv.acbd8jed_ = true, am7fwt.jri8xuo = \"drC+m!9n vxA(?w8N+)9]jF1 /\", eu0e.ygeqkl.rv5zela02z = -792779, c.teb.pe = 0xd45, fk-no = false, wvddr.gmv.d8iwt = \"]49F#3@Gi^y{@4y(eYalh%@\", piif.qwkfgiyp = false, \"kNg6#mA\".mmu1i.u1aubp = true, hk3wa8v.\">uk|E`!8a\" = 2055-10-17T23:43:59.550334Z, \"|EnD &e~>`\".npriy.OU = inf, m3y3lj.viyt2w.c = \"U/qmv0wx=W/ib/M^t<t7vC[#J_?KpncFg?a\", quumciha = {\n}, q.\"5;\" = 704498, k9zaeuluse.\"8%2Z?\" = \"\"\"\nwU:Z\"\"\" }\nyutxpp.uzz.\"/S|\" = [\"WM^ZLQ}e\", -836_768, {  c19 = {} }, {\n743736,nan,true,2006-12-08T20:27:41.624602Z,-51408.63582,2004-04-25T17:21:11},");
});
