test.fails('distilled regression for fuzz seed 771152', () => {
  const src = dedent`
    b_3cmsbhh.al1erl4-9 = [236463, '''
    -xl6''', 0o34, 90356.53508, true, [{ us.xl."/" = """
    fr;,Iq*!9""" }, 1986-03-02]]
  `;

  const obj = parse(src) as any;
  obj.b_3cmsbhh["al1erl4-9"][5][0].us.xl = { "k51": -3337.0673237368464, "k49": "QhvX_vl aKj9dsQ0r7" };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("b_3cmsbhh.al1erl4-9 = [236463, '''\n-xl6''', 0o34, 90356.53508,]true, [{us.xl.k51 = -3337.0673237368464, us.xl.k49 = \"QhvX_vl aKj9dsQ0r7\"}, 1986-03-02]");
});
