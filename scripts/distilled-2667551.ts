test.fails('distilled regression for fuzz seed 2667551', () => {
  const src = dedent`
    [[xwed7dv]]
    w9ri7t6az = {
    }
    ax.dkibhxt = ['', """
    >X+YrY\`N""", 2088-10-24T00:54:56, """
    $e"""]
  `;

  const obj = parse(src) as any;
  obj.xwed7dv[0].ax.dkibhxt.splice(2, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("[[xwed7dv]]\nw9ri7t6az = {\n}\nax.dkibhxt = ['', \"\"\"\n>X+YrY`N\"\"\", \"\"\"\n$e\"\"\"\n");
});
