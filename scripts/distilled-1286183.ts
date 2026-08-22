test.fails('distilled regression for fuzz seed 1286183', () => {
  const src = dedent`
    i5qpju2q = """
    8="""
    [p7jqr__s]
    j1."d<xHv+]#" = {
        w1ps6jnb.rmo5yjem.ifd71k5 = { c_ww5.sp0r.psodl-swm- = '''
    ''' },
        qbidoiww1 = { irw1v_-6r.b9ntzo.aydex63ad = -65079.12231, z70g = false, ":m.$2".nokM.k2hl6 = false, o6 = { gqix0c.tnyivr = 770012, t0n9.qj = """
    >1bJi gG""", i-43c9963p.bre5k8g28.guv2pn = 'l0-Y?;FYxwz', su.p = 36740, "Pv3!oN4".ub_k79_ = false, dnc3w6 = "", "ag/MY[2".ud = 527558, "Y][2vRao-".ekiao1h.t88fjn = 2080-12-04, "@" = 31256.58522, kqk32ihb.xcd01 = 819597, xf79wkh3q = 0x08, i = -284092, ZZ = 0o64, jbr.r0acvtrwd = true }, "&f".ck.pe = 2081-06-28T00:40:23Z, "5BN)X3P5:".b6dgagg = """
    DU)$R8E>JL*""", do8b6z.f4f-0l = {}, zhd31f5qk.h862qtmhq = 90692.79376, hc."+ZlY;4|" = true },
    }
  `;

  const obj = parse(src) as any;
  delete obj.p7jqr__s.j1["d<xHv+]#"].w1ps6jnb.rmo5yjem.ifd71k5.c_ww5.sp0r["psodl-swm-"];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("i5qpju2q = \"\"\"\r\n8=\"\"\"\r\n[p7jqr__s]\r\nj1.\"d<xHv+]#\" = {\r\n    w1ps6jnb.rmo5yjem.ifd71k5 = {  c_ww5.sp0r = {} },\r\n                                                   qbidoiww1 = { irw1v_-6r.b9ntzo.aydex63ad = -65079.12231, z70g = false, \":m.$2\".nokM.k2hl6 = false, o6 = { gqix0c.tnyivr = 770012, t0n9.qj = \"\"\"\r\n>1bJi gG\"\"\",                                                i-43c9963p.bre5k8g28.guv2pn = 'l0-Y?;FYxwz', su.p = 36740, \"Pv3!oN4\".ub_k79_ = false, dnc3w6 = \"\", \"ag/MY[2\".ud = 527558, \"Y][2vRao-\".ekiao1h.t88fjn = 2080-12-04, \"@\" = 31256.58522, kqk32ihb.xcd01 = 819597, xf79wkh3q = 0x08,,i = -284092, ZZ = 0o64, jbr.r0acvtrwd = true    \"&f\".ck.pe = 2081-06-28T00:40:23Z, \"5BN)X3P5:\".b6dgagg = \"\"\"\r\nDU)$R8E>JL*\"\"\",                                                do8b6z.f4f-0l = {}, zhd31f5qk,h862qtmhq = 90692.79376, hc.\"+ZlY;4|\" = true\r\n                                               }\r\n");
});
