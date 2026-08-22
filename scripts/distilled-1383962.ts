test.fails('distilled regression for fuzz seed 1383962', () => {
  const src = dedent`
    "1vn[1flkZ".qmam4fx = [{ dxnzi0.d0hc = [true, 47577.29573, true, 2077-04-05, 282_582, """
    s~""", 76968.6746, 'Qr+qJ|jGKM n=c1oEx^\`p2;L0H_Nyg*3K$:A{?jJg:I', 2069-08-08T04:34:33, "A3!)hHn6}I"] }, 574310, 28569, -63757100000000418476, """
    8=Qed7]-^jftM""", -50759.88688, -inf, true]
    [[kmza]]
    ptvl.s2fdfonrz9 = 'vQb/mr3cU )zJScrEv2bQ-$}kK1U&o,5hpf9@N|Ke['
  `;

  const obj = parse(src) as any;
  obj.kmza[0].ptvl = new Date(Date.UTC(2006, 1, 14));

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: assert exact output after the implementation fix.
  // expect(result).toEqual("\"1vn[1flkZ\".qmam4fx = [{ dxnzi0.d0hc = [true, 47577.29573, true, 2077-04-05, 282_582, \"\"\"\ns~\"\"\", 76968.6746, 'Qr+qJ|jGKM n=c1oEx^`p2;L0H_Nyg*3K$:A{?jJg:I', 2069-08-08T04:34:33, \"A3!)hHn6}I\"] }, 574310, 28569, -63757100000000418476, \"\"\"\n8=Qed7]-^jftM\"\"\", -50759.88688, -inf, true]\n[[kmza]]\nptvl = 2006-02-14T00:00:00.000Z");
});
