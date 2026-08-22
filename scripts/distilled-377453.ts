test.fails('distilled regression for fuzz seed 377453', () => {
  const src = dedent`
    eqki- = {
        v1xubvr5b2 = [false, true, '''
    <6@Qd}q =\`q]B>FSx''', -49_687.079945, { czt."@C~NuX" = "o5!A|8C-ri)@-U{I", t7.V.v = 0x5c5fa0, ")iE=18F=" = "h#\`^&yX^7wqnyK}(2j?~uEXfHhW1VmI;7)zeF54:Z&+whORWa", zC."&E".p2-fnhimsk = true, zo.HK.o_etoxccp6 = 0o26771, y95lhy8.x.ibl4bqh4di = 0xcfe, hmmu35k7g.iit__292.zjjfy = 15:08:47, c4u9he.";[c76C".bkkhwx2_5w = """
    o0q*""" }, "I3q/hH", 753862, 'z', -64864.2541],
        gmpmfyn4.y1np1 = 0o4755211,
    }
  `;

  const obj = parse(src) as any;
  obj["eqki-"].v1xubvr5b2[4] = { "k94": -4472 };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("eqki- = {\n    v1xubvr5b2 = [false, true, '''\n<6@Qd}q =`q]B>FSx''', -49_687.079945, { k94 = -4472.0 }, \"I3q/hH\", 753862, 'z', -64864.2541],\n\n}   gmpmfyn4.y1np1 = 0o4755211,\n");
});
