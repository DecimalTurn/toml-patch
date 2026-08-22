import dedent from 'dedent';
import { parse, patch } from '../';

test.fails('distilled fuzz seed 175924: delete a multiline string field in a nested array object', () => {
  const src = dedent`
    [[l."=".p]]
    qsof = [0b000000110001011, { t7a5uwjr2 = """
    ]UjKeB""" }, -907693]
  `;
  const obj = parse(src) as any;
  delete obj.l['='].p[0].qsof[1].t7a5uwjr2;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 377453: edit an item in a multiline nested array', () => {
  const src = dedent`
    eqki- = { v1xubvr5b2 = [false, true, '''
    <6@Qd}q =\`q]B>FSx''', -49_687.079945, { czt."@C~NuX" = "x", t7.V.v = 0x5c5fa0, c4u9he = """
    o0q*""" }, "I3q/hH"] }
  `;
  const obj = parse(src) as any;
  obj['eqki-'].v1xubvr5b2[4] = { k94: -4472 };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 771152: edit a dotted key in an inline object', () => {
  const src = dedent`
    b_3cmsbhh.al1erl4-9 = [236463, '''
    -xl6''', 0o34, 90356.53508, true, [{ us.xl."/" = """
    fr;,Iq*!9""" }, 1986-03-02]]
  `;
  const obj = parse(src) as any;
  obj.b_3cmsbhh['al1erl4-9'][5][0].us.xl = { k51: -3337.0673237368464, k49: 'QhvX_vl aKj9dsQ0r7' };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 863664: delete the only key of a multiline inline object', () => {
  const src = dedent`
    [pm."+w_y2".nlgwd4]
    k86xv_q."]7]P2g".xq99y = [{ "".nytor2grmi."" = { h53y.uujhq.hxk5o = """
    2^t""" }, axau5 = false }, '''
    ''']
  `;
  const obj = parse(src) as any;
  delete obj.pm['+w_y2'].nlgwd4.k86xv_q[']7]P2g'].xq99y[0][''].nytor2grmi[''].h53y;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 1112646: replace a multiline AOT value with an array', () => {
  const src = dedent`
    [["2S38X#"]]
    "dj/{gXY".sp_ya888x.mx7h8hlr = '''
    D<'''
    ln_n = [
      '''
    ,''',
      [{ "t&R/jR" = '''
    TPV!''' }, false, 287_173, "NAzv", 1984-04-16T12:37:13Z],
    ]
  `;
  const obj = parse(src) as any;
  obj['2S38X#'][0]['dj/{gXY'].sp_ya888x = [new Date(Date.UTC(2018, 5, 14)), -2069, 784];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 1286183: delete a multiline nested dotted value', () => {
  const src = dedent`
    [p7jqr__s]
    j1."d<xHv+]#" = {
      w1ps6jnb.rmo5yjem.ifd71k5 = { c_ww5.sp0r.psodl-swm- = '''
    ''' },
      qbidoiww1 = { o6 = { t0n9.qj = """
    >1bJi gG""", ZZ = 0o64 } },
    }
  `;
  const obj = parse(src) as any;
  delete obj.p7jqr__s.j1['d<xHv+]#'].w1ps6jnb.rmo5yjem.ifd71k5.c_ww5.sp0r['psodl-swm-'];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 1383962: change a table-array value to a date', () => {
  const src = dedent`
    "1vn[1flkZ".qmam4fx = [{ dxnzi0.d0hc = [true, 47577.29573, true, 2077-04-05, 282_582, """
    s~""", 76968.6746] }, 574310, 28569, -63757100000000418476, """
    8=Qed7]-^jftM""", -50759.88688, -inf, true]
    [[kmza]]
    ptvl.s2fdfonrz9 = 'vQb/mr3cU'
  `;
  const obj = parse(src) as any;
  obj.kmza[0].ptvl = new Date(Date.UTC(2006, 1, 14));
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 1693919: replace a nested multiline object', () => {
  const src = dedent`
    [g3s_y5jv_d.mfdfdc]
    "".c4esqy.t79d__y = {
      bnJF1EQ = { jg08iizbia = """
     fP=SCd-/e]!;bs(AR*w3L""" },
      "#?VRmg"."<mhN6Oe|cu" = ["""
    v[""", nan, "1T4f9"],
    }
  `;
  const obj = parse(src) as any;
  obj.g3s_y5jv_d.mfdfdc[''].c4esqy.t79d__y.bnJF1EQ = { k27: { k57: false, k17: false, k67: [new Date(Date.UTC(2036, 8, 23)), true, -1287.6224634237587] } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 1896226: delete a nested inline-table field', () => {
  const src = dedent`
    [syn2x.b.o6y2i]
    yutxpp.uzz."/S|" = ["WM^ZLQ}e", -836_768, { c19.hv = { "Z\`xk2<4{" = "08RXrX/B]Wjo}v77}^Rx", be9z3h.gaxei2pmox = """
    """ } }, { }, 2004-04-25T17:21:11]
  `;
  const obj = parse(src) as any;
  delete obj.syn2x.b.o6y2i.yutxpp.uzz['/S|'][2].c19.hv;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2185943: delete a leaf in a nested multiline table', () => {
  const src = dedent`
    [[megac68k-]]
    kw = [46674.18719, 48559.13327, 2091-08-20T06:58:11, 2024-05-10, 275_068, {
      cnoff = { l7."UMN$eUS9="."" = '''
    C/,9''' },
      aujqbb = '''
    P/*''',
    }, 22787.072880, true]
  `;
  const obj = parse(src) as any;
  delete obj['megac68k-'][0].kw[5].cnoff.l7['UMN$eUS9='];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2497422: delete a multiline inline-table member', () => {
  const src = dedent`
    "x^@zw" = [' ', -78860.81892, { ik4o2d6z4j = """
    DM}T+uCZVx*t+qMtQtbPrFiI""" }, "tail", 36709.83314, [true, false]]
  `;
  const obj = parse(src) as any;
  delete obj['x^@zw'][2].ik4o2d6z4j;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2531104: replace an inline-table array object', () => {
  const src = dedent`
    wcyw = { tf."O\`aB" = [true, { "%#FUrN".cvmmswb.">&K?" = 115668, kvy9 = false, kvy9h1bo.fe7b1px4bb = """
    :-i1""" }, 745102, 96226.27680, 0o21016, false] }
  `;
  const obj = parse(src) as any;
  obj.wcyw.tf['O`aB'][1] = { k96: 1640, k18: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2667551: remove an array item before multiline strings', () => {
  const src = dedent`
    [[xwed7dv]]
    ax.dkibhxt = ['', """
    >X+YrY\`N""", 2088-10-24, """
    $e""]
  `;
  const obj = parse(src) as any;
  obj.xwed7dv[0].ax.dkibhxt.splice(2, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2824408: replace a nested object beside multiline values', () => {
  const src = dedent`
    [ivk.nuan749c7]
    pJ.kd7jct7_o = { xwjbnijuw = { k-l259ef = "E2 U!/a", vi.dg5 = true, f4wkz1o_j.cgog.gw8umgy = '''
    t5B02omW_Qc5gU}''', qcc3pxkelq._G = """
      \`]cA6:81:-L__K?yaccQdE{zs{v$8?CN?be""" }, "\`pD".r = "U9SE]2S+<Ak^k|5lymMuq=\`2w_mfA%m-Q,NMYi1;:5e^v" }
  `;
  const obj = parse(src) as any;
  obj.ivk.nuan749c7.pJ.kd7jct7_o.xwjbnijuw = { k19: -188 };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2858114: remove an item before a multiline inline table', () => {
  const src = dedent`
    sw2.rfc4998bx = [true, 22866.4194, 890412, 399573, "qEZv", 0x703714, """
    ;(d7x""", { e_8y4s = 59108.35246 }]
  `;
  const obj = parse(src) as any;
  obj.sw2.rfc4998bx.splice(5, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test.fails('distilled fuzz seed 2591153: preserve nested array coordinates across edits', () => {
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
