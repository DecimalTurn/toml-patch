test.fails('distilled regression for fuzz seed 2858114', () => {
  const src = dedent`
    sw2.rfc4998bx = [true, 22866.4194, 890412, 399573, "qEZv", 0x703714, "p_\`:SMIvsp(<$", "m|2Z@v-c},BQ~+EDUZQr(lxlbX^iy0Mi>{G%c", """
    ;(d7x""", {
        e_8y4s = 59108.35246,
    }]
    xe_p.w5yln8z5 = '''
    xo5o'''
  `;

  const obj = parse(src) as any;
  obj.sw2.rfc4998bx.splice(5, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("sw2.rfc4998bx = [true, 22866.4194, 890412, 399573, \"qEZv\", \"p_`:SMIvsp(<$\", \"m|2Z@v-c},BQ~+EDUZQr(lxlbX^iy0Mi>{G%c\", \"\"\"\n;(d7x\"\"\", {\n              e_8y4s = 59108.35246,\n ]\nxe_p.w5yln8z5 = '''\nxo5o'''");
});
