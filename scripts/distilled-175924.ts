test.fails('distilled regression for fuzz seed 175924', () => {
  const src = dedent`
    [[l."=".p]]
    m = {
    }
    qsof = ["--2#k+z+M,Et1[EnDbG0_Ykh7^ ", 1988-12-04T04:19:06, [
        0b000000110001011,
        { t7a5uwjr2 = """
    ]UjKeB""" },
        -907693,
    ], 65260.050825]
  `;

  const obj = parse(src) as any;
  delete obj.l["="].p[0].qsof[2][1].t7a5uwjr2;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("﻿[[l.\"=\".p]]\r\nm = {\r\n}\r\nqsof = [\"--2#k+z+M,Et1[EnDbG0_Ykh7^ \", 1988-12-04T04:19:06, [\r\n    0b000000110001011,\r\n    {},\r\n-90769,\r\n,]               ]\r\n   65260.050825\r\n");
});
