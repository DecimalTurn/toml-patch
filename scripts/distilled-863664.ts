test.fails('distilled regression for fuzz seed 863664', () => {
  const src = dedent`
    [pm."+w_y2".nlgwd4]
    k86xv_q."]7]P2g".xq99y = [
        { chm72ws.si3 = 0xd5c289d, x = 2075-01-15T23:10:01.402080, s9gatl14xa.f6fbq_msjy = { f.nl = 597050, k.z30i = 939925, i_6d2w."g3}7A0" = 785203, 5C = 465053, e3tzu = 822110, "_hGRMk\`Qg~".ku = 412e-33, fvemmt = false, wrs2ylbfaf."AQ#B,[LL=c".ep = -282456, bs3o4.knr3jqyf.h = 70302.033641, h.z3ohf3j16 = -75001.099256, nju0p.tipdjb3pfk = 54219.46102 }, "w@LY+a#1<".z.")e$TtimN7" = 482015, "fa}@[\`"."ae,>ImvDxv".49e = true, "~/yZqL.$" = "gze@7dH;YExh", by1 = '|Xd', "".nytor2grmi."" = { h53y.uujhq.hxk5o = """
    2^t""" }, axau5."NQ6U?Fo{" = false, ubqaz = 0b111111110111000 },
        '''
    ''',
    ]
    [d5.dlf.n]
  `;

  const obj = parse(src) as any;
  obj.d5 = "P- L9H";

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("d5 = \"P- L9H\"\n\n[pm.\"+w_y2\".nlgwd4]\nk86xv_q.\"]7]P2g\".xq99y = [\n    { chm72ws.si3 = 0xd5c289d, x = 2075-01-15T23:10:01.402080, s9gatl14xa.f6fbq_msjy = { f.nl = 597050, k.z30i = 939925, i_6d2w.\"g3}7A0\" = 785203, 5C = 465053, e3tzu = 822110, \"_hGRMk`Qg~\".ku = 412e-33, fvemmt = false, wrs2ylbfaf.\"AQ#B,[LL=c\".ep = -282456, bs3o4.knr3jqyf.h = 70302.033641, h.z3ohf3j16 = -75001.099256, nju0p.tipdjb3pfk = 54219.46102 }, \"w@LY+a#1<\".z.\")e$TtimN7\" = 482015, \"fa}@[`\".\"ae,>ImvDxv\".49e = true, \"~/yZqL.$\" = \"gze@7dH;YExh\", by1 = '|Xd', \"\".nytor2grmi.\"\" = { h53y.uujhq.hxk5o = \"\"\"\n2^t\"\"\" }, axau5.\"NQ6U?Fo{\" = false, ubqaz = 0b111111110111000 },\n    '''\n''',\n]");
});
