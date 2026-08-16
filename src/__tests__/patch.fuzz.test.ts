
import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';

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
