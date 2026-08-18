
import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';

test('regression for fuzz seed 1845422 (array index leaks into dotted key)', () => {
  const src = dedent`
    [[a]]

    [a.q]
    v = [0, 0, 0, { p.g.h = 3 }]
    `;

  const obj = parse(src) as any;
  // Deleting this dotted leaf should keep `p.g = {}` inside the inline table,
  // but patch injects the array index (`3`) into the key path.
  delete obj.a[0].q.v[3].p.g.h;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test('restoring anchored rows also restores their key and value nodes (seed 19506)', () => {
    // Removing a leading item moves the inline table left; its interior rows
    // are anchored to the preceding multiline string's end.  The rigid
    // shift moved the row and KeyValue back but left the Key value node at
    // its shifted column, so toTOML wrote it there — `END'''` became `EaD=`
    // and the re-parse failed with an unterminated multiline string.
    const src = dedent`
      k = [false, { x = '''
      END''', a = 1 }, 9, false]
    `;
    const obj = parse(src) as any;
    obj.k.splice(0, 1);
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      k = [{ x = '''
      END''', a = 1 }, 9, false]
    `);
  });

  test('appending an AOT entry skips the previous entry sub-tables (seed 21525)', () => {
    // Deleting the last key of a dotted key (`vyujik.bwe`) empties `vyujik`
    // to `{}` and materialises `[a.vyujik]` as a document-level sub-table of
    // entry 0.  Appending entry 1 must land AFTER that sub-table, or the
    // new [[a]] header cuts in front of it and the re-parse reassigns
    // vyujik to the new entry.
    const src = dedent`
      [[a]]
      vyujik.bwe = 1
    `;
    const obj = parse(src) as any;
    delete obj.a[0].vyujik.bwe;
    obj.a.push({ k93: true });
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [[a]]

      [a.vyujik]

      [[a]]
      k93 = true
    `);
  });

  test('regression for fuzz seed 742554 (non-contiguous AOT sub-table skipped on append)', () => {
    // `[[y."!"]]` is a sub-table of `y` entry 0, but it is separated from the
    // `[[y]]` header by an unrelated `[[c]]` section.  Appending a new `y`
    // entry must land AFTER that trailing sub-table, or the new `[[y]]`
    // header cuts in front of it and TOML re-associates `!` with entry 1.
    const src = dedent`
      [[y]]
      a = 1

      [[c]]
      b = 2

      [[y."!"]]
      ll = 3
    `;
    const obj = parse(src, { integersAsBigInt: false }) as any;
    obj.y.push({ k33: 4597 });
    const result = patch(src, obj);
    expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
    expect(result).toEqual(dedent`
      [[y]]
      a = 1

      [[c]]
      b = 2

      [[y."!"]]
      ll = 3

      [[y]]
      k33 = 4597
    `);
  });

// FIXME(seed 30330): collapsing a dotted key whose value is a multiline array
// into a flat array leaked the old closing `]` delimiter.  The diff truncates
// `b.c` (an implicit table) to `b` and replaces its multiline-array value with
// the new array, but the preserved trailing comma (`preserveFormatting` copying
// the old array's trailing comma onto the regenerated value) was not accounted
// for in the replacement's `loc.end`, so the closing `]` collided with the
// comma and produced `b = [true, "x", "y",,` — "Consecutive commas in array".
// Fixed by widening the replacement's `loc.end` when a trailing comma is added.
test('collapsing a multiline-array dotted key into a flat array (seed 30330)', () => {
  const src = dedent`
    a5 = [1]

    h.z = {
        b.c = [
        true,
        8,
    ],
    }
  `;

  const obj = parse(src) as any;
  obj.h.z.b = [true, 'x', 'y'];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a5 = [1]

    h.z = {
        b = [true, "x", "y",],
    }
  `);
});


// FIXME(seed 31662): collapsing a dotted key to a scalar while a section
// `[b.y]` (with its own leading comment) extends the `b` prefix threw
// "Cannot read properties of undefined (reading 'type')".  The key-truncation
// sibling sweep iterated the live items array while removeMember() spliced the
// section AND its leading comment, so the next index read past the shrunk
// array.  Fixed by iterating a snapshot of the items.
test('collapsing a dotted key whose prefix has a section sibling (seed 31662)', () => {
  const src = dedent`
      b.x = -inf
      # c
      [b.y]
    `;

  const obj = parse(src) as any;
  obj.b = 2244;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    b = 2244
  `);
});


// FIXME(seed 32801): collapsing `""` (a Date that also owns a dotted-key
// child `"".x`, the parser attaches the child onto the Date) to a scalar
// string left the `"".x` key-value in place, re-defining `""` on re-parse
// ("Value already defined").  A single-segment key collapsing to a leaf must
// drop sibling keys/sections that extend its prefix.  Fixed by sweeping those
// siblings whenever the new value is a scalar.
test('collapsing a Date key that owns a dotted-key child (seed 32801)', () => {
  const src = dedent`
      [[a]]
      "" = 1998-03-05T13:50:08Z
      "".x = 1
    `;

  const obj = parse(src) as any;
  obj.a[0][""] = "str";

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]
    "" = "str"
  `);
});


// FIXME(seed 35943): removing one element from a multiline array that holds
// duplicate scalar values ABOVE a nested multiline array made the diff resolve
// the deletion as a chain of Moves (the duplicate `true`s are indistinguishable,
// so the walk treated the scalars after them as "moved" into place, drifting the
// nested array right one slot) instead of a single in-place Remove.  The writer
// then relocated the nested array and corrupted its tail — the closing `"""` of
// its last multiline string was dropped and the DateTime slid onto extra spaces
// ("Unterminated multiline").  Fixed by identifying the displaced element as a
// surplus duplicate (more copies in `before` than `after`) and removing it in
// place, matching the existing multiline-safety guard.
test('removing one of several duplicate scalars above a nested multiline array (seed 35943)', () => {
  const src = dedent`
      [[g--]]
      v = ['''
      a
      b
      ''', true, true, true, 50190.5, 826, ["""
      c
      d
      """, """
      e
      f
      """, 2068-08-05T05:20:32]]
    `;

  const obj = parse(src) as any;
  obj["g--"][0].v.splice(1, 1);

  const result = patch(src, obj, { trailingComma: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[g--]]
    v = ['''
    a
    b
    ''', true, true, 50190.5, 826, ["""
    c
    d
    """, """
    e
    f
    """, 2068-08-05T05:20:32]]
  `);
});


test('regression for fuzz seed 37465', () => {
  const src = dedent`
    [[n.a.x]]
    b = true

    [n]
    c = 1
  `;

  const obj = parse(src) as any;
  obj.n.a = 42;

  const result = patch(src, obj, { inlineTableStart: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [n]
    c = 1
    a = 42
    `);
});


test('regression for fuzz seed 39363', () => {
  const src = dedent`
    "" = 11:43:08
    ["".g]
    b = 1
  `;

  const obj = parse(src) as any;
  obj[""] = ["h"];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    "" = [ "h" ]
    `);
});


test('regression for fuzz seed 40181', () => {
  const src = dedent`
    a = [1, false, [
        2,
        "x"
    ]]
  `;

  const obj = parse(src) as any;
  obj.a.splice(1, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [1, [
        2,
        "x"
    ]]
    `);
});


test('regression for fuzz seed 41613', () => {
  const src = dedent`
    [a.b]
    x = 1
  `;

  const obj = parse(src) as any;
  obj.a.b = [{ p: false }];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a.b]]
    p = false
    `);
});

test('regression for fuzz seed 43159', () => {
  const src = dedent`
    a = """
    -x
    y"""
    "|t" = 99
    # c
    z = 1
  `;

  const obj = parse(src) as any;
  obj["|t"] = { k8: { k36: { k89: { k83: "x", k28: "y", k10: 865 } } } };

  const result = patch(src, obj, { inlineTableStart: 2, updateOrder: true, trailingNewline: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = """
    -x
    y"""
    # c
    z = 1

    ["|t"]
    k8 = { k36 = { k89 = { k83 = "x", k28 = "y", k10 = 865 } } }
    `);
});

test('regression for fuzz seed 43199', () => {
  const src = dedent`
    a.p37xq = 61459
    [[a.l1.zoyksoh]]
    x = 1
  `;

  const obj = parse(src) as any;
  obj.a.l1 = -4489;

  const result = patch(src, obj, { inlineTableStart: 0, updateOrder: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a.p37xq = 61459
    a.l1 = -4489
    `);
});

test('regression for fuzz seed 46522', () => {
  const src = dedent`
    [[y]]
    a.t = true
  `;

  const obj = parse(src) as any;
  const entry = obj.y[0].a;
  entry.k75 = entry.t;
  delete entry.t;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[y]]
    a.k75 = true
    `);
});

test('regression for fuzz seed 54607', () => {
  const src = dedent`
    vvyka = [{
        a = 1,
    }, """
    EY""", 'tail']
  `;

  const obj = parse(src) as any;
  obj.vvyka[1] = -3320;
  obj.vvyka.splice(2, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    vvyka = [{
        a = 1,
    }, -3320]
    `);
});

test('regression for fuzz seed 61827', () => {
  const src = dedent`
    q = {
        "".x = 1,
        "".y = 2,
    }
  `;

  const obj = parse(src) as any;
  obj.q = { k47: 2555 };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    q = {
        k47 = 2555
    }
    `);
});

test('regression for fuzz seed 62163', () => {
  const src = dedent`
    [[""]]
    w4 = "x"
    [["".Lpfz]]
    xwd = 5
  `;

  const obj = parse(src) as any;
  obj[""][0]["Lpfz"] = [];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    w4 = "x"
    Lpfz = []
    `);
});

test('regression for fuzz seed 62263', () => {
  const src = dedent`
    a = [1, [false, true, '''
    x
    y'''], { a."b" = """
    ,
    rOuMBE7LfK|o|RI""", c.d = """
    YI~(<
    $Km2l
    w#""" }, true, 2, "z"]
  `;

  const obj = parse(src) as any;
  obj.a[1] = true;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [1, true, { a."b" = """
    ,
    rOuMBE7LfK|o|RI""", c.d = """
    YI~(<
    $Km2l
    w#""" }, true, 2, "z"]
    `);
});

test('regression for fuzz seed 65785', () => {
  const src = dedent`
    [a.b.c]

    [d]

    [f]
  `;

  const obj = parse(src) as any;
  obj.a.b = { k: 4 };
  delete obj.d;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a]
    b = { k = 4 }

    [f]
    `);
});

test('regression for fuzz seed 67221', () => {
  const src = dedent`
    [""]
    a = 1

    [["".b.c]]
    d = 2
  `;

  const obj = parse(src) as any;
  obj[""].b.c.splice(0, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    a = 1
    b.c = []
    `);
});

test('regression for fuzz seed 68244', () => {
  const src = dedent`
    ["".a]
    x = 1

    ["".b.c]
    y = 2
  `;

  const obj = parse(src) as any;
  obj[""].b = 5;

  const result = patch(src, obj, { inlineTableStart: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    "".b = 5

    ["".a]
    x = 1
    `);
});

test('regression for fuzz seed 68861', () => {
  const src = dedent`
    [t]
    xepe5 = ['''
    n
    J
    ''', "v", -1, true, [
        -2,
        'x',
    ]]
  `;

  const obj = parse(src) as any;
  obj.t.xepe5.splice(2, 0, true);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [t]
    xepe5 = ['''
    n
    J
    ''', "v", true, -1, true, [
        -2,
        'x',
    ]]
    `);
});

test('regression for fuzz seed 78079', () => {
  const src = dedent`
    ["".i3asc2k3y]
    a = false

    [""]
    b = 1
  `;

  const obj = parse(src) as any;
  obj[""].i3asc2k3y = "X";

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    b = 1
    i3asc2k3y = "X"
    `);
});

test('regression for fuzz seed 79938', () => {
  const src = dedent`
    q = 2019-06-13T09:28:26
    q."X,O{&v6D".kwkxclp2d = true

    [q."Zr%@lBr"]
    lidz78h = 1
  `;

  const obj = parse(src) as any;
  delete obj.q;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent``);
});

test('regression for fuzz seed 80004', () => {
  const src = dedent`
    [a.b]
    "" = 11:17:13.346128
    "".x.y = "v"
  `;

  const obj = parse(src) as any;
  obj.a.b[""] = { k60: 1 };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a.b]
    "" = { k60 = 1 }
    `);
});

test('regression for fuzz seed 82825', () => {
  const src = dedent`
    x = { "".1.w46j = -916648, "".e-0cxz9.";" = "v" }
  `;

  const obj = parse(src) as any;
  obj.x[""] = "moq45";

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    x = { "" = "moq45" }
    `);
});

test('regression for fuzz seed 86547', () => {
  const src = dedent`
    b.c.d = [01:48:53, { iuqh = 7544.95655 }, "s", false]
  `;

  const obj = parse(src) as any;
  obj.b.c.d[0] = false;
  obj.b.c.d[1].iuqh = new Date('2010-12-09T00:00:00.000Z');

  const result = patch(src, obj, { trailingComma: true, bracketSpacing: true, inlineTableStart: 2 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    b.c.d = [false, { iuqh = 2010-12-09T00:00:00.000Z, }, "s", false]
    `);
});

test('regression for fuzz seed 86724', () => {
  const src = dedent`
    [[x_i42]]
    m = 1
    wxq = 2
  `;

  const obj = parse(src) as any;
  obj.x_i42 = [new Date('2008-09-12T00:00:00.000Z'), new Date('2031-08-14T00:00:00.000Z')];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    x_i42 = [ 2008-09-12T00:00:00.000Z, 2031-08-14T00:00:00.000Z ]
    `);
});

test('regression for fuzz seed 121096', () => {
  const src = dedent`
    wn9c0 = [ 192915 ]
  `;

  const obj = parse(src) as any;
  obj.wn9c0[0] = { k21: 'zxZ' };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    wn9c0 = [ { k21 = "zxZ" } ]
    `);
});

test('regression for fuzz seed 129645', () => {
  const src = dedent`
    [[""]]
    x = 1
    a = 2

    [[""."=M._!wD>]".l8401w1]]
    k.Bh = 1
    wix2 = 2
  `;

  const obj = parse(src) as any;
  obj[''][0]['=M._!wD>]']['l8401w1'][0] = 4567;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    x = 1
    a = 2

    [""."=M._!wD>]"]
    l8401w1 = [ 4567 ]
    `);
});

test('regression for fuzz seed 136292', () => {
  const src = dedent`
    [x]
    a = 1

    [[x.y]]
    b = 2
  `;

  const obj = parse(src) as any;
  delete obj.x;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test('regression for fuzz seed 136865', () => {
  const src = dedent`
    [[ng.tll]]
    a = 1
    b = 2
  `;

  const obj = parse(src) as any;
  obj.ng.tll = [{ k8: 187, k78: [3357.17] }, -4619];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [ng]
    tll = [ { k8 = 187, k78 = [ 3357.17 ] }, -4619 ]
    `);
});

test('regression for fuzz seed 179377', () => {
  const src = dedent`
    o4s = [false, '''
    aaa''', 30325, false, '''
    bbb
    ccc''', false, "x", 'y']
  `;

  const obj = parse(src) as any;
  obj.o4s[1] = false;
  obj.o4s.splice(3, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    o4s = [false, false, 30325, '''
    bbb
    ccc''', false, "x", 'y']
    `);
});

test('regression for fuzz seed 186384', () => {
  const src = dedent`
    K = { iw.h6dhsnnqm.ho = false }
  `;

  const obj = parse(src) as any;
  obj.K.iw.h6dhsnnqm = { k75: false, k85: 66.66 };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    K = { iw.h6dhsnnqm.k75 = false, iw.h6dhsnnqm.k85 = 66.66 }
    `);
});

test('regression for fuzz seed 208822', () => {
  const src = dedent`
    zrrm9 = ["a", ["fn", 1, false, true, "K", 2, "PLAIN", """
    q9
    FB""", 3], 4]
  `;

  const obj = parse(src) as any;
  obj.zrrm9[1][2] = true;
  obj.zrrm9[1].splice(6, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    zrrm9 = ["a", ["fn", 1, true, true, "K", 2, """
    q9
    FB""", 3], 4]
    `);
});

test('regression for fuzz seed 224081', () => {
  const src = dedent`
    [[""]]
    a = 1

    ["".o96]
    GD64qOzFQn = { x.fj = "abc" }
  `;

  const obj = parse(src) as any;
  delete obj[""][0].o96.GD64qOzFQn.x.fj;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1

    ["".o96]
    GD64qOzFQn = {  x = {} }
    `);
});

test('regression for fuzz seed 272851', () => {
  // A nested inline table whose only key holds a multiline string is emptied,
  // then re-populated with a short key. The multiline string's content lines
  // are not collapsed, so the trailing sibling of the enclosing inline table
  // is swallowed into the nested table.
  const src = dedent`
    o6z = { ut = { g7k5gct = { kr9 = """
    Bz5~
    5
    """ } }, w.x = 5 }
  `;

  const obj = parse(src) as any;
  obj.o6z.ut.g7k5gct = { k12: "OGB" };

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // The sibling `w.x` must stay a sibling of `ut` inside `o6z`, not be
  // absorbed into `ut`.
  expect((parse(result) as any).o6z).toEqual({ ut: { g7k5gct: { k12: 'OGB' } }, w: { x: 5 } });
});

test('regression for fuzz seed 863085 (delete dotted key empties nested inline table)', () => {
  // A nested inline table `nn` holds a single dotted key `"k1".k2.k3` whose
  // value is a multiline string, so `nn` spans several lines. Deleting the
  // last segment (`k3`) empties the dotted prefix to `{}` and re-serialises
  // `nn` as `{  k1.k2 = {} }`. The re-materialisation collapsed `nn` to a
  // single line but left its `loc.end` on the multiline string's old end
  // line, so the enclosing table's trailing siblings `sib1`/`sib2` were
  // pulled inside `nn`.
  const src = dedent`
    root = { nn = { "k1".k2.k3 = '''
    AAA
    BBB''' }, sib1 = "x", sib2 = "y" }
  `;

  const obj = parse(src) as any;
  delete obj.root.nn.k1.k2.k3;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // `sib1`/`sib2` must stay siblings of `nn` inside `root`, not be absorbed
  // into `nn`.
  expect((parse(result) as any).root).toEqual({
    nn: { k1: { k2: {} } },
    sib1: 'x',
    sib2: 'y',
  });
});

test('regression for fuzz seed 299772 (AOT entry replaced by scalar)', () => {
  // Replacing the first entry of an array-of-tables with a scalar collapses
  // the whole AOT to a plain array — the regenerated `hc8v = [...]` KV must
  // replace ALL the old [[hc8v]] entries, not just entry 0.
  const src = dedent`
    [[hc8v]]
    a = 1
    [[hc8v]]
    b = 2
  `;

  const obj = parse(src) as any;
  obj.hc8v[0] = -1937;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    hc8v = [ -1937, { b = 2 } ]
  `);
});

test('regression for fuzz seed 299772 (LocalTime truncated by truncateZeroTimeInDates)', () => {
  // A LocalTime (time-only) must never be collapsed to a date when
  // truncateZeroTimeInDates is enabled — its internal base date is year 0,
  // so truncating it emitted `0NaN-NaN-NaN`.
  const src = dedent`
    nm5drkk.p9izjo3 = 00:00:00
    other = 1
  `;

  const obj = parse(src) as any;
  // Touch an unrelated key so patch() re-renders the untouched LocalTime.
  obj.other = 2;

  const result = patch(src, obj, { truncateZeroTimeInDates: true, minimumDecimals: 1 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    nm5drkk.p9izjo3 = 00:00:00
    other = 2.0
  `);
});

test('regression for fuzz seeds 358055 / 362151 (deleting the first table and collapsing a later table to a scalar)', () => {
  // Deleting the first table (`[v8]`) AND collapsing a later table (`[s]`) to
  // a scalar in the same patch left the hoisted `s = 282` KV on a phantom
  // (negative) line, crashing the writer with `undefined.length`.
  const src = dedent`
    [v8]
    x = 1

    [other]
    x = 1

    [s]
    y = 1
  `;

  const obj = parse(src) as any;
  obj.s = 282;
  delete obj.v8;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    s = 282

    [other]
    x = 1
  `);
});

test('regression for fuzz seed 421965 (moving a multiline string to the front and removing the tail)', () => {
  // Changing index 2 to `false` duplicates the leading `false`, so the diff
  // moves the multiline string from index 1 to index 0 and removes the tail.
  // The move relocates the multiline string across lines and drops its closing
  // delimiter, merging `false` into the string's content.
  const src = dedent`
    q7_8 = [false, """
    AAA
    """, "z"]
  `;

  const obj = parse(src) as any;
  obj.q7_8[2] = false;
  obj.q7_8.splice(0, 1);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
});

test('regression for fuzz seed 460447 (table replaced by an array-of-tables drops the second entry)', () => {
  // Replacing a plain table `[jv_c.g5y2632gh]` with a two-element array turns
  // it into an array-of-tables.  parseJS renders each array element as its
  // own `[[key]]` section, but the table→AOT branch only grabbed `items[0]`,
  // silently dropping entry 1 (and its nested sub-table).
  const src = dedent`
    [jv_c.g5y2632gh]
    k78 = "a"
    k59 = "b"
    k53 = 1
  `;

  const obj = parse(src) as any;
  obj.jv_c.g5y2632gh = [
    { k78: 'a', k59: 'b', k53: 1 },
    { k61: 'NGbdHzIsNOmfVz', k21: 3835, k9: { k10: 2198, k26: 'oGNuD5FeWfa6QP0AVy' } },
  ];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[jv_c.g5y2632gh]]
    k78 = "a"
    k59 = "b"
    k53 = 1

    [[jv_c.g5y2632gh]]
    k61 = "NGbdHzIsNOmfVz"
    k21 = 3835
    k9 = { k10 = 2198, k26 = "oGNuD5FeWfa6QP0AVy" }
  `);
});

test('regression for fuzz seed 599513: moving a multiline inline table left corrupts its interior rows', () => {
  // Changing index 0 from a long string to `true` makes the diff align the
  // pre-existing `true` (index 1) with it, producing a Move of the multiline
  // inline table toward the front of a shared-line array.  insert()'s rigid
  // horizontal translation dragged the table's interior rows to negative
  // columns, and toTOML then emitted `,-1.5nx=` (value before key, leading
  // comma) — invalid TOML.
  const src = dedent`
    a = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true, {
        nx = -1.5,
        bv = 94479.23159,
    }, true]
  `;

  const obj = parse(src) as any;
  obj.a[0] = true;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [true, true, {
        nx = -1.5,
        bv = 94479.23159,
    }, true]
  `);
});

test('regression for fuzz seed 1020868 (empty sub-table of an AOT entry leaks the entry index)', () => {
  // Deleting `fv.dtmo2qe` empties `fv` to `{}`.  `change.path` is the JS-object
  // path `["", 0, "fv", "dtmo2qe"]`, whose parent prefix `["", 0, "fv"]`
  // interleaves the numeric AOT entry index.  Materialising the parent with
  // that prefix emitted `["".0.fv]` and the re-parse nested `fv` under a key
  // literally named "0".  The in-place materialisation must use the CST key
  // `["", "fv"]` instead.
  const src = dedent`
    [[""]]
    x = 1

    ["".fv.dtmo2qe]
    y = 2
  `;

  const obj = parse(src, { integersAsBigInt: false }) as any;
  delete obj[''][0].fv.dtmo2qe;

  const result = patch(src, obj);
  expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    x = 1

    ["".fv]
  `);
});

test('regression for fuzz seed 1024477 (table to AOT misplaces a nested sub-table)', () => {
  // Changing a table into an array-of-tables whose first entry holds a nested
  // object (depth >= inlineTableStart) forces that object out into a separate
  // `[key.sub]` section.  It must land directly after its `[[key]]` entry, not
  // after a later entry — otherwise the re-parse reassigns the sub-table to
  // the wrong array element.
  const src = dedent`
    tp6.":" = 451070
  `;

  const obj = parse(src) as any;
  obj.tp6 = [
    { k61: 439, k41: { k96: new Date('2012-04-07T00:00:00.000Z') } },
    { k76: -2790, k10: 1301, k89: 798.6 },
  ];

  const result = patch(src, obj, { inlineTableStart: 2, minimumDecimals: 2 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[tp6]]
    k61 = 439.00

    [tp6.k41]
    k96 = 2012-04-07T00:00:00.000Z

    [[tp6]]
    k76 = -2790.00
    k10 = 1301.00
    k89 = 798.60
  `);
});

// Regression for fuzz seed 1137525: the diff emits `Remove[1], Add[2], Add[3],
// Remove[6]` for a multiline array where a duplicate scalar was inserted and a
// scalar was removed.  reorder() used to move the higher-index `Remove[6]` in
// front of the two Adds, so it was applied against the ORIGINAL array — index 6
// is `"g"`, not the surplus duplicate `"f"` (source index 5) — and the wrong
// element was removed.  The fix: reorder() now treats a same-array Add or Move
// as a barrier (a Remove emitted after it is in post-shift coordinates and must
// stay after it), while still crossing length-preserving Edits (seed 50448) and
// Adds/Moves in a DIFFERENT array context (seeds 84522/473477).  The naive
// `removedBefore--` unconditional (commit d17e606) regressed seeds 761/3093.
test('regression for fuzz seed 1137525 (remove leaps past interleaved adds on reorder)', () => {
  // `"b"` becomes `"c"` (a duplicate of the existing `"c"`), `["x"]` is
  // inserted, a second `"c"` is inserted, and `"f"` is dropped.  The diff
  // emits `Remove[1], Add[2], Add[3], Remove[6]`; the last Remove must stay
  // after the Adds, where index 6 is the surplus duplicate `"f"`.
  const src = dedent`
    nea32 = ["a", "b", "c", "d", "e", "f", "g"]
  `;

  const obj = parse(src) as any;
  obj.nea32 = ['a', 'c', ['x'], 'c', 'd', 'e', 'g'];

  const result = patch(src, obj);
  expect(result).toEqual(dedent`
    nea32 = ["a", "c", ["x"], "c", "d", "e", "g"]
    `);
  expect(parse(result)).toEqual(obj);

});

// FIXME: patching a COMPACT inline array (no spaces after commas) with the
// interleaved remove/add pattern drops the commas between neighbouring
// elements.  The spaced form round-trips correctly (see the 1137525 regression
// above); only the compact form is affected.  Currently produces
// `arr = ["a""c", ["x"], "c","d","e""g"]` — the commas after `"a"` and `"e"`
// are lost, so the re-parse reads `"a""c"` / `"e""g"` as single strings and the
// round-trip fails.
test('compact inline array loses commas on interleaved remove/add (fuzz seed 1137525 variant)', () => {
  const src = dedent`
    arr = ["a","b","c","d","e","f","g"]
  `;

  const obj = parse(src) as any;
  obj.arr = ['a', 'c', ['x'], 'c', 'd', 'e', 'g'];

  const result = patch(src, obj);
  expect(result).toEqual(dedent`
    arr = ["a","c",["x"],"c","d","e","g"]
    `);

  expect(parse(result)).toEqual(obj);
});

test('regression for fuzz seed 1285105 (AOT collapsed to static array with non-contiguous sub-table)', () => {
  // A top-level `[[""]]` and a later non-contiguous sub-table
  // `["".c47eko_.bog8_vy3w]` (separated by an unrelated `[other]`) share the
  // `""` key prefix.  Collapsing `""` to a static (non-object) array leaves
  // the prefix-extended sub-table behind, which re-parse rejects with
  // "Cannot add to static array".  The sub-table must be removed too.
  const src = dedent`
    [[""]]
    a = 1

    [other]
    b = 2

    ["".c47eko_.bog8_vy3w]
    c = 3
  `;

  const obj = parse(src, { integersAsBigInt: false }) as any;
  obj[''] = [[1, 2]];

  const result = patch(src, obj);
  expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
  expect(result).toEqual(dedent`
    "" = [ [ 1, 2 ] ]

    [other]
    b = 2
  `);
});

test('regression for fuzz seed 1428499 (delete implicit sub-table of an AOT entry)', () => {
  // Deleting the intermediate key of a nested array-of-tables inside a `""`
  // AOT entry.  The change path is `["", 0, "sub"]` — JS-object coordinates
  // carrying the numeric AOT entry index — but the nested AOT's CST key is
  // `["", "sub", "q"]` (no index, and `sub` is an implicit table with no
  // section of its own).  The remove handler must strip the AOT index and
  // sweep the prefix-extending sub-AOT, or findByPath throws "Node not found".
  const src = dedent`
    [[""]]
    a = 1

    [["".sub.q]]
    b = 2
  `;

  const obj = parse(src) as any;
  delete obj[''][0]['sub'];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1
  `);
});

test('regression for fuzz seed 1674968 (implicit dotted table collapsed to scalar leaves stale children)', () => {
  // `b.c` is an implicit table defined only by the dotted keys `b.c.k1` /
  // `b.c.k2`.  Collapsing `b.c` to a scalar must truncate the key to `b.c`
  // and remove the stale `b.c.k2` sibling — otherwise the surviving dotted
  // child re-defines `b.c` on re-parse ("Value already defined").  The fix:
  // the parent path resolves to a prefix-matched KV, so the sibling sweep has
  // to look in that KV's structural container (the AOT entry) instead.
  const src = dedent`
    [[a]]
    b.c.k1 = 1
    b.c.k2 = 2
  `;

  const obj = parse(src) as any;
  obj.a[0].b.c = 'X';

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]
    b.c = "X"
  `);
});

test('regression for fuzz seed 1657445 (AOT entry structural edit emitted as table is flattened back to dotted key)', () => {
  // Under an AOT entry, changing `rw109.kjzi` from an object-shaped subtree
  // (rendered as [["".rw109.kjzi]]) to a scalar must reinsert `rw109.kjzi =` in
  // that SAME entry. parseJS can render the replacement tail as `[rw109]` + row;
  // if we only accept root KeyValue nodes there, the replacement is dropped.
  const src = dedent`
    [[""]]
    a = 1

    [["".rw109.kjzi]]
    x = 2
  `;

  const obj = parse(src) as any;
  obj[''][0].rw109.kjzi = 3495.677246246487;

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1
    rw109.kjzi = 3495.677246246487
  `);
});

test('regression for fuzz seed 1947810 (AOT entry edited to scalar under existing parent table)', () => {
  const src = dedent`
    [""]
    x = 1

    [["".u60ke_j3]]
    a = 2
  `;

  const obj = parse(src) as any;
  obj[""].u60ke_j3 = [-3754];

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    x = 1
    u60ke_j3 = [ -3754 ]
  `);
});

