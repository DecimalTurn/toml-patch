
import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';

test('replacing an object in a nested multiline array preserves trailing siblings (seed 1112646)', () => {
  const src = dedent`
    values = [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      [
        { old = '''
    old content
    ''' },
        false,
        287173,
        "name",
        1984-04-16T12:37:13Z,
      ],
      "//gIXi=9%%vqm;y",
    ]
  `;

  const obj = parse(src) as any;
  obj.values[7][0] = {
    primary: -4807.689925655723,
    details: { values: [-2765, new Date(Date.UTC(2016, 6, 12))] }
  };

  // TODO: Decide if we should consider making the inline table multiline to preserve the
  // original formatting of the array. Currently, it is being converted to a single-line inline table.
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    values = [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      [
        { primary = -4807.689925655723, details = { values = [ -2765, 2016-07-12T00:00:00.000Z, ], }, },
        false,
        287173,
        "name",
        1984-04-16T12:37:13Z,
      ],
      "//gIXi=9%%vqm;y",
    ]
  `);
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

  test('restoring anchored rows with a nested inline table replacement (seed 19506 alt.1)', () => {
    const src = dedent`
      k = [false, { x = '''
      END''', a = 1 }, 9, false]
    `;
    const obj = parse(src) as any;
    obj.k.splice(0, 1);
    obj.k[0].a = { nested: true };
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      k = [{x = "END", a = {nested = true}}, 9, false]
    `);
  });

  test('restoring anchored rows after removing the trailing duplicate (seed 19506 alt.2)', () => {
    const src = dedent`
      k = [false, { x = '''
      END''', a = 1 }, 9, false]
    `;
    const obj = parse(src) as any;
    obj.k.splice(0, 1);
    obj.k.pop();
    obj.k[0].x = "changed";
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      k = [{x = "changed", a = 1}, 9]
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

  test('appending an AOT entry after a nested array sub-table (seed 21525 alt.1)', () => {
    const src = dedent`
      [[a]]
      child.value = 1

      [a.child.deep]
      x = true
    `;
    const obj = parse(src) as any;
    obj.a.push({ child: { value: 2 }, tail: [1, 2] });
    const result = patch(src, obj);
    expect(result).toEqual(dedent`
      [[a]]
      child.value = 1
      
      [a.child.deep]
      x = true

      [[a]]
      child.value = 2
      tail = [ 1, 2 ]
    `);
    expect(parse(result)).toEqual(obj);
  });

  test('appending an AOT entry does not drop an empty nested object during dotted-key flattening', () => {
    const src = dedent`
      [[a]]
      child.value = 1

      [a.child.deep]
      x = true
    `;
    const obj = parse(src) as any;
    obj.a.push({ child: { empty: {}, value: 2 }, tail: [1, 2] });

    const result = patch(src, obj);

    expect(result).toEqual(dedent`
      [[a]]
      child.value = 1

      [a.child.deep]
      x = true

      [[a]]
      child.empty = {}
      child.value = 2
      tail = [ 1, 2 ]
    `);
    expect(parse(result)).toEqual(obj);
  });

  test('appending an AOT entry while preserving an empty prefix sub-table (seed 21525 alt.2)', () => {
    const src = dedent`
      [[a]]
      vyujik.bwe = 1

      [a.vyujik.cvf]
    `;
    const obj = parse(src) as any;
    delete obj.a[0].vyujik.bwe;
    obj.a.push({ k93: { nested: false } });
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [[a]]

      [a.vyujik.cvf]

      [[a]]
      k93 = { nested = false }
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

test('collapsing a multiline-array dotted key into an inline table (seed 30330 alt.1)', () => {
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
  obj.h.z.b = { x: true, y: 'tail' };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a5 = [1]

    h.z = {
          b.x = true,
          b.y = "tail"
    }
  `);
});

test('collapsing a multiline-array dotted key into an empty array (seed 30330 alt.2)', () => {
  const src = dedent`
    h.z = {
        b.c = [
        true,
        8,
    ],
        sibling = 1,
    }
  `;
  const obj = parse(src) as any;
  obj.h.z.b = [];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    h.z = {
        b = [],
        sibling = 1,
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
  expect(result).toEqual(dedent``);
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
  expect(result).toEqual(dedent`
    o6z = { ut = { g7k5gct = { k12 = "OGB" }


          }, w.x = 5 }
  `);
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
  expect(result).toEqual(dedent`
    q7_8 = ["""
    AAA
    """, false]
  `);
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
  expect(result).toEqual(dedent`
    root = { nn = {  k1.k2 = {} }, sib1 = "x", sib2 = "y" }
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
  expect(result).toEqual(dedent`
    [[a]]

    [a.q]
    v = [0, 0, 0, {p.g = {}}]
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

test('collapsing a dotted key to an inline table beside a section sibling (seed 31662 alt.1)', () => {
  const src = dedent`
    b.x = -inf
    # c
    [b.y]
    z = 1
  `;
  const obj = parse(src) as any;
  obj.b = { value: 2244, nested: false };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    b.value = 2244
    b.nested = false
  `);
});

test('collapsing a dotted key to an array beside a section sibling (seed 31662 alt.2)', () => {
  const src = dedent`
    b.x = -inf
    # c
    [b.y]
    z = 1
  `;
  const obj = parse(src) as any;
  obj.b = [2244, 7];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    b = [ 2244, 7 ]
  `);
});

test('collapsing a Date key with a child into an inline table (seed 32801 alt.1)', () => {
  const src = dedent`
    [[a]]
    "" = 1998-03-05T13:50:08Z
    "".x = 1
  `;
  const obj = parse(src) as any;
  obj.a[0][""] = { nested: { value: 1 } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]
    "" = { nested = { value = 1 } }
  `);
});

test('collapsing a Date key with a child into an array (seed 32801 alt.2)', () => {
  const src = dedent`
    [[a]]
    "" = 1998-03-05T13:50:08Z
    "".x = 1
  `;
  const obj = parse(src) as any;
  obj.a[0][""] = ["str", 2];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]
    "" = [ "str", 2 ]
  `);
});

test('removing a duplicate after a nested multiline array (seed 35943 alt.1)', () => {
  const src = dedent`
    [[g--]]
    v = [true, true, 50190.5, ["""
    c
    d
    """, true], true]
  `;
  const obj = parse(src) as any;
  obj["g--"][0].v.splice(0, 1);
  const result = patch(src, obj, { trailingComma: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[g--]]
    v = [true, 50190.5, ["""
    c
    d
    """, true], true]
  `);
});

test('replacing a duplicate above a nested multiline array (seed 35943 alt.2)', () => {
  const src = dedent`
    [[g--]]
    v = [true, true, ["""
    c
    d
    """, 2068-08-05T05:20:32], false]
  `;
  const obj = parse(src) as any;
  obj["g--"][0].v[0] = false;
  obj["g--"][0].v.splice(1, 1);
  const result = patch(src, obj, { trailingComma: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[g--]]
    v = [
           false, ["""
    c
    d
    """, 2068-08-05T05:20:32], false]
  `);
});

test('collapsing an AOT child to an inline object while its parent table survives (seed 37465 alt.1)', () => {
  const src = dedent`
    [[n.a.x]]
    b = true

    [n]
    c = 1
  `;
  const obj = parse(src) as any;
  obj.n.a = { k: 42, nested: { ok: true } };
  const result = patch(src, obj, { inlineTableStart: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [n]
    c = 1
    a = { k = 42, nested = { ok = true } }
  `);
});

test('collapsing an AOT child to an array while its parent table survives (seed 37465 alt.2)', () => {
  const src = dedent`
    [[n.a.x]]
    b = true

    [n]
    c = 1
  `;
  const obj = parse(src) as any;
  obj.n.a = [42, false];
  const result = patch(src, obj, { inlineTableStart: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [n]
    c = 1
    a = [ 42, false ]
  `);
});

test('collapsing an empty key to an inline object with a surviving section (seed 39363 alt.1)', () => {
  const src = dedent`
    "" = 11:43:08
    ["".g]
    b = 1
  `;
  const obj = parse(src) as any;
  obj[""] = { h: { value: 1 } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    h = { value = 1 }
  `);
});

test('collapsing an empty key to a mixed array with a surviving section (seed 39363 alt.2)', () => {
  const src = dedent`
    "" = 11:43:08
    ["".g]
    b = 1
  `;
  const obj = parse(src) as any;
  obj[""] = ["h", { value: true }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    "" = [ "h", { value = true } ]
  `);
});

test('removing a scalar before a nested array (seed 40181 alt.1)', () => {
  const src = dedent`
    a = [1, false, [2, "x"], 3, true]
  `;
  const obj = parse(src) as any;
  obj.a.splice(3, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [1, false, [2, "x"], true]
  `);
});

test('replacing a nested array element while removing its preceding scalar (seed 40181 alt.2)', () => {
  const src = dedent`
    a = [1, false, [2, "x"], 3]
  `;
  const obj = parse(src) as any;
  obj.a[2] = { nested: [2, "x"] };
  obj.a.splice(1, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [1, {nested = [2, "x"]}, 3]
  `);
});

test('replacing a table with a two-entry array-of-tables (seed 41613 alt.1)', () => {
  const src = dedent`
    [a.b]
    x = 1
  `;
  const obj = parse(src) as any;
  obj.a.b = [{ p: false }, { p: true, nested: { x: 1 } }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a.b]]
    p = false

    [[a.b]]
    p = true
    nested = { x = 1 }
  `);
});

test('replacing a table with an empty array-of-tables (seed 41613 alt.2)', () => {
  const src = dedent`
    [a.b]
    x = 1
  `;
  const obj = parse(src) as any;
  obj.a.b = [];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a]
    b = []
  `);
});

test('moving a nested object behind a multiline string while preserving comments (seed 43159 alt.1)', () => {
  const src = dedent`
    a = """
    -x
    y"""
    "|t" = 99
    # c
    z = 1
  `;
  const obj = parse(src) as any;
  obj["|t"] = { k8: { leaf: "x", list: [1, 2] } };
  const result = patch(src, obj, { inlineTableStart: 2, updateOrder: true, trailingNewline: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = """
    -x
    y"""
    # c
    z = 1

    ["|t"]
    k8 = { leaf = "x", list = [ 1, 2 ] }
  `);
});

test('moving an array-valued quoted key behind a multiline string (seed 43159 alt.2)', () => {
  const src = dedent`
    a = """
    -x
    y"""
    "|t" = 99
    # c
    z = 1
  `;
  const obj = parse(src) as any;
  obj["|t"] = ["x", { k: false }];
  const result = patch(src, obj, { inlineTableStart: 2, updateOrder: true, trailingNewline: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = """
    -x
    y"""
    "|t" = [ "x", { k = false } ]
    # c
    z = 1
  `);
});

test('collapsing an AOT child to an inline object with a dotted sibling (seed 43199 alt.1)', () => {
  const src = dedent`
    a.p37xq = 61459
    [[a.l1.zoyksoh]]
    x = 1
  `;
  const obj = parse(src) as any;
  obj.a.l1 = { value: -4489, nested: true };
  const result = patch(src, obj, { inlineTableStart: 0, updateOrder: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a.p37xq = 61459
    a.l1 = { value = -4489, nested = true }
  `);
});

test('collapsing an AOT child to a mixed array with a dotted sibling (seed 43199 alt.2)', () => {
  const src = dedent`
    a.p37xq = 61459
    [[a.l1.zoyksoh]]
    x = 1
  `;
  const obj = parse(src) as any;
  obj.a.l1 = [-4489, { value: true }];
  const result = patch(src, obj, { inlineTableStart: 0, updateOrder: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a.p37xq = 61459
    a.l1 = [ -4489, { value = true } ]
  `);
});

test('renaming an AOT child while changing its value to an inline object (seed 46522 alt.1)', () => {
  const src = dedent`
    [[y]]
    a.t = true
  `;
  const obj = parse(src) as any;
  obj.y[0].a = { k75: { nested: false } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[y]]
    a.k75 = { nested = false }
  `);
});

test('renaming an AOT child while changing its value to an array (seed 46522 alt.2)', () => {
  const src = dedent`
    [[y]]
    a.t = true
  `;
  const obj = parse(src) as any;
  obj.y[0].a.k75 = [true, false];
  delete obj.y[0].a.t;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[y]]
    a.k75 = [ true, false ]
  `);
});

test('replacing a multiline array entry and removing its following tail (seed 54607 alt.1)', () => {
  const src = dedent`
    vvyka = [{
        a = 1,
    }, """
    EY""", 'tail']
  `;
  const obj = parse(src) as any;
  obj.vvyka[0] = { a: 2, nested: false };
  obj.vvyka.splice(1, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    vvyka = [{
        a = 2,
        nested = false,
    }, 'tail']
  `);
});

test('replacing a multiline array entry with an inline array and retaining the tail (seed 54607 alt.2)', () => {
  const src = dedent`
    vvyka = [{
        a = 1,
    }, """
    EY""", 'tail']
  `;
  const obj = parse(src) as any;
  obj.vvyka[1] = ["new", { ok: true }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    vvyka = [{
        a = 1,
    }, ["new", {ok = true}], 'tail']
  `);
});

test('replacing a dotted-key inline table with an array beside an empty key (seed 61827 alt.1)', () => {
  const src = dedent`
    q = {
        "".x = 1,
        "".y = 2,
    }
  `;
  const obj = parse(src) as any;
  obj.q = [{ x: 1 }, { y: 2 }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[q]]
    x = 1

    [[q]]
    y = 2
  `);
});

test('replacing a dotted-key inline table with a nested object (seed 61827 alt.2)', () => {
  const src = dedent`
    q = {
        "".x = 1,
        "".y = 2,
    }
  `;
  const obj = parse(src) as any;
  obj.q = { nested: { value: 2555 }, other: false };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    q = {
        nested = { value = 2555, },
        other = false
    }
  `);
});

test('changing an AOT nested table from an array to an inline object (seed 62163 alt.1)', () => {
  const src = dedent`
    [[""]]
    w4 = "x"
    [["".Lpfz]]
    xwd = 5
  `;
  const obj = parse(src) as any;
  obj[""][0].Lpfz = { value: 1, nested: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    w4 = "x"
    Lpfz.value = 1
    Lpfz.nested = true
  `);
});

test('changing an AOT nested table from an array to a scalar (seed 62163 alt.2)', () => {
  const src = dedent`
    [[""]]
    w4 = "x"
    [["".Lpfz]]
    xwd = 5
  `;
  const obj = parse(src) as any;
  obj[""][0].Lpfz = 7;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    w4 = "x"
    Lpfz = 7
  `);
});

test('replacing a nested array item with a multiline literal string (seed 62263 alt.1)', () => {
  const src = dedent`
    a = [1, [false, true, '''
    x
    y'''], { a."b" = 1 }, true, 2, "z"]
  `;
  const obj = parse(src) as any;
  obj.a[1] = `replaced
value`;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(
    'a = [1, "replaced\\nvalue", { a."b" = 1 }, true, 2, "z"]'
  );
});

test('removing the multiline string from a nested array (seed 62263 alt.2)', () => {
  const src = dedent`
    a = [1, [false, true, '''
    x
    y'''], { a."b" = 1 }, true, 2, "z"]
  `;
  const obj = parse(src) as any;
  obj.a[1].splice(2, 1);
  obj.a[1].push({ tail: false });
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [1, [false, true, {tail = false}], { a."b" = 1 }, true, 2, "z"]
  `);
});

test('collapsing one table while deleting a later sibling table (seed 65785 alt.1)', () => {
  const src = dedent`
    [a.b.c]

    [d]
    x = 1

    [f]
  `;
  const obj = parse(src) as any;
  obj.a.b = [1, 2];
  delete obj.d;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a]
    b = [ 1, 2 ]

    [f]
  `);
});

test('collapsing one table to an inline object while deleting the last table (seed 65785 alt.2)', () => {
  const src = dedent`
    [a.b.c]

    [d]
    x = 1

    [f]
  `;
  const obj = parse(src) as any;
  obj.a.b = { k: 4, nested: true };
  delete obj.f;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a]
    b = { k = 4, nested = true }

    [d]
    x = 1
  `);
});

test('emptying an AOT nested array and adding a sibling value (seed 67221 alt.1)', () => {
  const src = dedent`
    [""]
    a = 1

    [["".b.c]]
    d = 2
  `;
  const obj = parse(src) as any;
  obj[""].b.c = [{ value: true }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    a = 1

    [["".b.c]]
    value = true
  `);
});

test('emptying an AOT nested array while retaining the parent as an inline object (seed 67221 alt.2)', () => {
  const src = dedent`
    [""]
    a = 1

    [["".b.c]]
    d = 2
  `;
  const obj = parse(src) as any;
  obj[""].b = { c: [] };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    a = 1
    b.c = []
  `);
});

test('collapsing a section prefix to an inline object with another section before it (seed 68244 alt.1)', () => {
  const src = dedent`
    ["".a]
    x = 1

    ["".b.c]
    y = 2
  `;
  const obj = parse(src) as any;
  obj[""].b = { value: 5, nested: false };
  const result = patch(src, obj, { inlineTableStart: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    "".b = { value = 5, nested = false }

    ["".a]
    x = 1
  `);
});

test('collapsing a section prefix to an array with another section before it (seed 68244 alt.2)', () => {
  const src = dedent`
    ["".a]
    x = 1

    ["".b.c]
    y = 2
  `;
  const obj = parse(src) as any;
  obj[""].b = [5, 6];
  const result = patch(src, obj, { inlineTableStart: 0 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    "".b = [ 5, 6 ]

    ["".a]
    x = 1
  `);
});

test('inserting before a multiline array entry and changing its tail (seed 68861 alt.1)', () => {
  const src = dedent`
    [t]
    xepe5 = ['''
    n
    J
    ''', "v", -1, true, [-2, 'x']]
  `;
  const obj = parse(src) as any;
  obj.t.xepe5.splice(0, 0, { inserted: true });
  obj.t.xepe5[3] = 0;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [t]
    xepe5 = [{inserted = true}, '''
    n
    J
    ''', "v", 0, true, [-2, 'x']]
  `);
});

test('removing an item after a multiline array entry and appending a table (seed 68861 alt.2)', () => {
  const src = dedent`
    [t]
    xepe5 = ['''
    n
    J
    ''', "v", -1, true, [-2, 'x']]
  `;
  const obj = parse(src) as any;
  obj.t.xepe5.splice(2, 1);
  obj.t.xepe5.push({ tail: [1, 2] });
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [t]
    xepe5 = ['''
    n
    J
    ''', "v", true, [-2, 'x'], {tail = [1, 2]}]
  `);
});

test('replacing a section child with an array while retaining the parent table (seed 78079 alt.1)', () => {
  const src = dedent`
    ["".i3asc2k3y]
    a = false

    [""]
    b = 1
  `;
  const obj = parse(src) as any;
  obj[""].i3asc2k3y = ["X", false];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    b = 1
    i3asc2k3y = [ "X", false ]
  `);
});

test('deleting a section child while adding a nested parent value (seed 78079 alt.2)', () => {
  const src = dedent`
    ["".i3asc2k3y]
    a = false

    [""]
    b = 1
  `;
  const obj = parse(src) as any;
  delete obj[""].i3asc2k3y;
  obj[""].c = { nested: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    b = 1
    c = { nested = true }
  `);
});

test('collapsing a dated root key with a quoted dotted child to an object (seed 79938 alt.1)', () => {
  const src = dedent`
    q = 2019-06-13T09:28:26
    q."X,O{&v6D".kwkxclp2d = true

    [q."Zr%@lBr"]
    lidz78h = 1
  `;
  const obj = parse(src) as any;
  obj.q = { replacement: { value: false } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [q]
    replacement = { value = false }
  `);
});

test('collapsing a dated root key with a quoted dotted child to an array (seed 79938 alt.2)', () => {
  const src = dedent`
    q = 2019-06-13T09:28:26
    q."X,O{&v6D".kwkxclp2d = true

    [q."Zr%@lBr"]
    lidz78h = 1
  `;
  const obj = parse(src) as any;
  obj.q = ["replacement", false];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    q = [ "replacement", false ]
  `);
});

test('collapsing an empty-key Date with a child to an array (seed 80004 alt.1)', () => {
  const src = dedent`
    [a.b]
    "" = 11:17:13.346128
    "".x.y = "v"
  `;
  const obj = parse(src) as any;
  obj.a.b[""] = ["v", 1];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a.b]
    "" = [ "v", 1 ]
  `);
});

test('collapsing an empty-key Date with a child to a nested object (seed 80004 alt.2)', () => {
  const src = dedent`
    [a.b]
    "" = 11:17:13.346128
    "".x.y = "v"
  `;
  const obj = parse(src) as any;
  obj.a.b[""] = { x: { y: "changed" }, z: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [a.b]
    "" = { x = { y = "changed" }, z = true }
  `);
});

test('collapsing an inline-table empty key to an array (seed 82825 alt.1)', () => {
  const src = dedent`
    x = { "".1.w46j = -916648, "".e-0cxz9.";" = "v" }
  `;
  const obj = parse(src) as any;
  obj.x[""] = ["moq45", 2];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    x = { "" = [ "moq45", 2 ] }
  `);
});

test('collapsing an inline-table empty key to an object with a dotted child (seed 82825 alt.2)', () => {
  const src = dedent`
    x = { "".1.w46j = -916648, "".e-0cxz9.";" = "v" }
  `;
  const obj = parse(src) as any;
  obj.x[""] = { nested: { value: "moq45" } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    x = { "".nested = { value = "moq45" } }
  `);
});

test('editing an array Date and inserting an inline object (seed 86547 alt.1)', () => {
  const src = dedent`
    b.c.d = [01:48:53, { iuqh = 7544.95655 }, "s", false]
  `;
  const obj = parse(src) as any;
  obj.b.c.d[0] = { time: "01:48" };
  obj.b.c.d.splice(2, 0, [1, 2]);
  const result = patch(src, obj, { trailingComma: true, bracketSpacing: true, inlineTableStart: 2 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    b.c.d = [{ time = "01:48", }, { iuqh = 7544.95655 }, [ 1, 2, ], "s", false]
  `);
});

test('editing an array object and removing its Date neighbour (seed 86547 alt.2)', () => {
  const src = dedent`
    b.c.d = [01:48:53, { iuqh = 7544.95655 }, "s", false]
  `;
  const obj = parse(src) as any;
  obj.b.c.d[1].iuqh = { year: 2010 };
  obj.b.c.d.splice(0, 1);
  const result = patch(src, obj, { trailingComma: true, bracketSpacing: true, inlineTableStart: 2 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    b.c.d = [{ iuqh = { year = 2010, }, }, "s", false]
  `);
});

test('replacing an AOT with two inline objects (seed 86724 alt.1)', () => {
  const src = dedent`
    [[x_i42]]
    m = 1
    wxq = 2
  `;
  const obj = parse(src) as any;
  obj.x_i42 = [{ m: 3, nested: true }, { wxq: 4 }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[x_i42]]
    m = 3
    nested = true

    [[x_i42]]
    wxq = 4
  `);
});

test('replacing an AOT with a mixed array containing a multiline string (seed 86724 alt.2)', () => {
  const src = dedent`
    [[x_i42]]
    m = 1
    wxq = 2
  `;
  const obj = parse(src) as any;
  obj.x_i42 = ["first", `line\nvalue`];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(
    'x_i42 = [ "first", "line\\nvalue" ]'
  );
});

test('moving a multiline literal past duplicate scalars while removing the head (seed 179377 alt.1)', () => {
  const src = dedent`
    o4s = [false, '''
    aaa''', 30325, false, '''
    bbb
    ccc''', false, "x", 'y']
  `;
  const obj = parse(src) as any;
  obj.o4s[1] = false;
  obj.o4s[4] = "changed";
  obj.o4s.splice(0, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    o4s = [false, 30325, false, "changed", false, "x", 'y']
  `);
});

test('removing a duplicate scalar while replacing the later multiline literal (seed 179377 alt.2)', () => {
  const src = dedent`
    o4s = [false, '''
    aaa''', 30325, false, '''
    bbb
    ccc''', false, "x", 'y']
  `;
  const obj = parse(src) as any;
  obj.o4s[1] = false;
  obj.o4s[4] = { value: "changed" };
  obj.o4s.splice(3, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    o4s = [false, false, 30325, {value = "changed"}, false, "x", 'y']
  `);
});

test('shrinking a dotted inline-table key while adding a sibling key (seed 186384 alt.1)', () => {
  const src = dedent`
    K = { iw.h6dhsnnqm.ho = false }
  `;
  const obj = parse(src) as any;
  obj.K.iw.h6dhsnnqm = { k75: false };
  obj.K.iw.h6dhsnnqm.extra = "x";
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    K = { iw.h6dhsnnqm.k75 = false, iw.h6dhsnnqm.extra = "x" }
  `);
});

test('replacing a dotted inline-table leaf with an array and nested object (seed 186384 alt.2)', () => {
  const src = dedent`
    K = { iw.h6dhsnnqm.ho = false }
  `;
  const obj = parse(src) as any;
  obj.K.iw.h6dhsnnqm = { k75: [false, true], k85: { value: 66.66 } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    K = { iw.h6dhsnnqm.k75 = [ false, true ], iw.h6dhsnnqm.k85 = { value = 66.66 } }
  `);
});

test('editing and trimming a nested multiline array in a different position (seed 208822 alt.1)', () => {
  const src = dedent`
    zrrm9 = ["a", ["fn", 1, false, true, "K", 2, "PLAIN", """
    q9
    FB""", 3], 4]
  `;
  const obj = parse(src) as any;
  obj.zrrm9[1][1] = { value: 1 };
  obj.zrrm9[1].splice(7, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    zrrm9 = ["a", ["fn", {value = 1}, false, true, "K", 2, "PLAIN", 3], 4]
  `);
});

test('editing a duplicate in a nested multiline array and removing its head (seed 208822 alt.2)', () => {
  const src = dedent`
    zrrm9 = ["a", ["fn", 1, false, true, "K", 2, "PLAIN", """
    q9
    FB""", 3], 4]
  `;
  const obj = parse(src) as any;
  obj.zrrm9[1][2] = true;
  obj.zrrm9[1].splice(0, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    zrrm9 = ["a", [1, true, true, "K", 2, "PLAIN", """
    q9
    FB""", 3], 4]
  `);
});

test('deleting a different dotted leaf inside an AOT inline table (seed 224081 alt.1)', () => {
  const src = dedent`
    [[""]]
    a = 1

    ["".o96]
    GD64qOzFQn = { x.fj = "abc", x.keep = true }
  `;
  const obj = parse(src) as any;
  delete obj[""][0].o96.GD64qOzFQn.x.fj;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1

    ["".o96]
    GD64qOzFQn = { x.keep = true }
  `);
});

test('deleting the last dotted leaf from an AOT inline table branch (seed 224081 alt.2)', () => {
  const src = dedent`
    [[""]]
    a = 1

    ["".o96]
    GD64qOzFQn = { x.fj = "abc" }
  `;
  const obj = parse(src) as any;
  delete obj[""][0].o96.GD64qOzFQn.x.fj;
  delete obj[""][0].o96.GD64qOzFQn.x;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1

    ["".o96]
    GD64qOzFQn = {}
  `);
});

test('repopulating an emptied multiline inline table with an array (seed 272851 alt.1)', () => {
  const src = dedent`
    o6z = { ut = { g7k5gct = { kr9 = """
    Bz5~
    5
    """ } }, w.x = 5 }
  `;
  const obj = parse(src) as any;
  obj.o6z.ut.g7k5gct = { k12: ["O", "G"] };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    o6z = { ut = { g7k5gct = { k12 = [ "O", "G" ] }


          }, w.x = 5 }
  `);
});

test('repopulating an emptied multiline inline table with a multiline value (seed 272851 alt.2)', () => {
  const src = dedent`
    o6z = { ut = { g7k5gct = { kr9 = """
    Bz5~
    5
    """ } }, w.x = 5 }
  `;
  const obj = parse(src) as any;
  obj.o6z.ut.g7k5gct = { k12: `O\nG` };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent.withOptions({ escapeSpecialCharacters: false })`
    o6z = { ut = { g7k5gct = { k12 = "O${String.fromCharCode(92)}nG" }


          }, w.x = 5 }
  `);
});

test('replacing the second AOT entry with a scalar (seed 299772 AOT alt.1)', () => {
  const src = dedent`
    [[hc8v]]
    a = 1
    [[hc8v]]
    b = 2
  `;
  const obj = parse(src) as any;
  obj.hc8v[1] = -1937;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    hc8v = [ { a = 1 }, -1937 ]
  `);
});

test('replacing both AOT entries with scalar values (seed 299772 AOT alt.2)', () => {
  const src = dedent`
    [[hc8v]]
    a = 1
    [[hc8v]]
    b = 2
  `;
  const obj = parse(src) as any;
  obj.hc8v = [-1937, 4];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    hc8v = [ -1937, 4 ]
  `);
});

test('preserving a LocalTime while changing an earlier dotted value (seed 299772 LocalTime alt.1)', () => {
  const src = dedent`
    nm5drkk.p9izjo3 = 00:00:00
    other = 1
  `;
  const obj = parse(src) as any;
  obj.nm5drkk.p9izjo3 = new Date('1970-01-01T12:34:56.000Z');
  obj.other = 2;
  const result = patch(src, obj, { truncateZeroTimeInDates: true, minimumDecimals: 1 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    nm5drkk.p9izjo3 = 1970-01-01T12:34:56.000Z
    other = 2.0
  `);
});

test('preserving a LocalTime while adding a sibling object (seed 299772 LocalTime alt.2)', () => {
  const src = dedent`
    nm5drkk.p9izjo3 = 00:00:00
    other = 1
  `;
  const obj = parse(src) as any;
  obj.other = { nested: 2 };
  obj.extra = false;
  const result = patch(src, obj, { truncateZeroTimeInDates: true });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    nm5drkk.p9izjo3 = 00:00:00
    extra = false
    [other]
    nested = 2
  `);
});

test('deleting the first table while collapsing a later table to an inline object (seed 358055 alt.1)', () => {
  const src = dedent`
    [v8]
    x = 1

    [other]
    x = 1

    [s]
    y = 1
  `;
  const obj = parse(src) as any;
  obj.s = { value: 282, nested: true };
  delete obj.v8;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [other]
    x = 1

    [s]
    value = 282
    nested = true
  `);
});

test('deleting the first table while collapsing a later table to an array (seed 358055 alt.2)', () => {
  const src = dedent`
    [v8]
    x = 1

    [other]
    x = 1

    [s]
    y = 1
  `;
  const obj = parse(src) as any;
  obj.s = [282, 283];
  delete obj.v8;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    s = [ 282, 283 ]

    [other]
    x = 1
  `);
});

test('moving a multiline string to the front while replacing the tail with an object (seed 421965 alt.1)', () => {
  const src = dedent`
    q7_8 = [false, """
    AAA
    """, "z"]
  `;
  const obj = parse(src) as any;
  obj.q7_8[2] = { value: false };
  obj.q7_8.splice(0, 1);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    q7_8 = [  """
    AAA
    """, {value = false}]
  `);
});

test('moving a multiline string to the front while keeping duplicate booleans (seed 421965 alt.2)', () => {
  const src = dedent`
    q7_8 = [false, """
    AAA
    """, "z"]
  `;
  const obj = parse(src) as any;
  obj.q7_8[2] = false;
  obj.q7_8.splice(0, 1);
  obj.q7_8.push(`tail\nvalue`);
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent.withOptions({ escapeSpecialCharacters: false })`
    q7_8 = ["""
    AAA
    """, false, "tail${String.fromCharCode(92)}nvalue"]
  `);
});

test('replacing a table with a three-entry array-of-tables (seed 460447 alt.1)', () => {
  const src = dedent`
    [jv_c.g5y2632gh]
    k78 = "a"
    k59 = "b"
    k53 = 1
  `;
  const obj = parse(src) as any;
  obj.jv_c.g5y2632gh = [{ k78: "a" }, { k59: "b" }, { k53: 1 }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[jv_c.g5y2632gh]]
    k78 = "a"

    [[jv_c.g5y2632gh]]
    k59 = "b"

    [[jv_c.g5y2632gh]]
    k53 = 1
  `);
});

test('replacing a table with an array-of-tables whose second entry is nested (seed 460447 alt.2)', () => {
  const src = dedent`
    [jv_c.g5y2632gh]
    k78 = "a"
    k59 = "b"
    k53 = 1
  `;
  const obj = parse(src) as any;
  obj.jv_c.g5y2632gh = [{ k78: "a", k59: "b" }, { nested: { k53: 1 } }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[jv_c.g5y2632gh]]
    k78 = "a"
    k59 = "b"

    [[jv_c.g5y2632gh]]
    nested = { k53 = 1 }
  `);
});

test('moving a multiline inline table left while editing its first row (seed 599513 alt.1)', () => {
  const src = dedent`
    a = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true, {
        nx = -1.5,
        bv = 94479.23159,
    }, true]
  `;
  const obj = parse(src) as any;
  obj.a[0] = true;
  obj.a[2].nx = { value: -1.5 };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [true, true, {nx = {value = -1.5}, bv = 94479.23159}, true]
  `);
});

test('moving a multiline inline table left while inserting a nested sibling (seed 599513 alt.2)', () => {
  const src = dedent`
    a = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true, {
        nx = -1.5,
        bv = 94479.23159,
    }, true]
  `;
  const obj = parse(src) as any;
  obj.a[0] = true;
  obj.a[2].extra = { nested: [1, 2] };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    a = [true, true, {nx = -1.5, bv = 94479.23159, extra = {nested = [1, 2]}}, true]
  `);
});

test('appending an AOT entry after a non-contiguous sub-table with a nested value (seed 742554 alt.1)', () => {
  const src = dedent`
    [[y]]
    a = 1

    [[c]]
    b = 2

    [[y."!"]]
    ll = 3
  `;
  const obj = parse(src, { integersAsBigInt: false }) as any;
  obj.y.push({ k33: { nested: true } });
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
    k33 = { nested = true }
  `);
});

test('appending two AOT entries after a non-contiguous sub-table (seed 742554 alt.2)', () => {
  const src = dedent`
    [[y]]
    a = 1

    [[c]]
    b = 2

    [[y."!"]]
    ll = 3
  `;
  const obj = parse(src, { integersAsBigInt: false }) as any;
  obj.y.push({ k33: 4597 }, { k34: false });
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

    [[y]]
    k34 = false
  `);
});

test('deleting a dotted key while adding a sibling to the enclosing inline table (seed 863085 alt.1)', () => {
  const src = dedent`
    root = { nn = { "k1".k2.k3 = '''
    AAA
    BBB''' }, sib1 = "x", sib2 = "y" }
  `;
  const obj = parse(src) as any;
  delete obj.root.nn.k1.k2.k3;
  obj.root.sib3 = { value: "z" };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    root = { nn = {  k1.k2 = {} }, sib1 = "x", sib2 = "y", sib3 = { value = "z" } }
  `);
});

test('deleting a dotted key while replacing a trailing sibling with an array (seed 863085 alt.2)', () => {
  const src = dedent`
    root = { nn = { "k1".k2.k3 = '''
    AAA
    BBB''' }, sib1 = "x", sib2 = "y" }
  `;
  const obj = parse(src) as any;
  delete obj.root.nn.k1.k2.k3;
  obj.root.sib2 = ["y", false];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    root = { nn = {  k1.k2 = {} }, sib1 = "x", sib2 = [ "y", false ] }
  `);
});

test('emptying an AOT sub-table while adding a sibling key in the same entry (seed 1020868 alt.1)', () => {
  const src = dedent`
    [[""]]
    x = 1

    ["".fv.dtmo2qe]
    y = 2
  `;
  const obj = parse(src, { integersAsBigInt: false }) as any;
  delete obj[""][0].fv.dtmo2qe;
  obj[""][0].newKey = { value: true };
  const result = patch(src, obj);
  expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    x = 1
    newKey = { value = true }

    ["".fv]
  `);
});

test('emptying an AOT sub-table while retaining another nested branch (seed 1020868 alt.2)', () => {
  const src = dedent`
    [[""]]
    x = 1

    ["".fv.dtmo2qe]
    y = 2

    ["".fv.keep]
    z = 3
  `;
  const obj = parse(src, { integersAsBigInt: false }) as any;
  delete obj[""][0].fv.dtmo2qe;
  const result = patch(src, obj);
  expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    x = 1

    ["".fv.keep]
    z = 3
  `);
});

test('converting a table to an AOT with a nested array in the first entry (seed 1024477 alt.1)', () => {
  const src = dedent`
    tp6.":" = 451070
  `;
  const obj = parse(src) as any;
  obj.tp6 = [
    { k61: 439, k41: { k96: [1, 2] } },
    { k76: -2790 },
  ];
  const result = patch(src, obj, { inlineTableStart: 2, minimumDecimals: 2 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[tp6]]
    k61 = 439.00

    [tp6.k41]
    k96 = [ 1.00, 2.00 ]

    [[tp6]]
    k76 = -2790.00
  `);
});

test('converting a table to a three-entry AOT with a nested second entry (seed 1024477 alt.2)', () => {
  const src = dedent`
    tp6.":" = 451070
  `;
  const obj = parse(src) as any;
  obj.tp6 = [
    { k61: 439 },
    { k41: { k96: new Date('2012-04-07T00:00:00.000Z') } },
    { k76: -2790 },
  ];
  const result = patch(src, obj, { inlineTableStart: 2, minimumDecimals: 2 });
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[tp6]]
    k61 = 439.00

    [[tp6]]

    [tp6.k41]
    k96 = 2012-04-07T00:00:00.000Z

    [[tp6]]
    k76 = -2790.00
  `);
});

test('reordering multiline-array duplicates while adding a nested value (seed 1137525 alt.1)', () => {
  const src = dedent`
    nea32 = ["a", "b", "c", "d", "e", "f", "g"]
  `;
  const obj = parse(src) as any;
  obj.nea32 = ['a', 'c', { nested: ['x'] }, 'c', 'd', 'e', 'g'];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    nea32 = ["a", "c", {nested = ["x"]}, "c", "d", "e", "g"]
  `);
});

test('reordering multiline-array duplicates while removing an earlier item (seed 1137525 alt.2)', () => {
  const src = dedent`
    nea32 = ["a", "b", "c", "d", "e", "f", "g"]
  `;
  const obj = parse(src) as any;
  obj.nea32 = ['c', ['x'], 'c', 'd', 'e', 'f'];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    nea32 = ["c", ["x"], "c", "d", "e", "f"]
  `);
});

test('compact inline array preserves commas when an object is inserted (seed 1137525 variant alt.1)', () => {
  const src = dedent`
    arr = ["a","b","c","d","e","f","g"]
  `;
  const obj = parse(src) as any;
  obj.arr = ['a', { nested: true }, 'c', 'd', 'e', 'g'];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    arr = ["a",{nested = true},"c","d","e","g"]
  `);
});

test('compact inline array preserves commas after duplicate removal and insertion (seed 1137525 variant alt.2)', () => {
  const src = dedent`
    arr = ["a","b","c","d","e","f","g"]
  `;
  const obj = parse(src) as any;
  obj.arr = ['a', 'c', ['x'], 'c', 'e', 'g'];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    arr = ["a","c",["x"],"c","e","g"]
  `);
});

test('collapsing an AOT with a non-contiguous sub-table to a nested static array (seed 1285105 alt.1)', () => {
  const src = dedent`
    [[""]]
    a = 1

    [other]
    b = 2

    ["".c47eko_.bog8_vy3w]
    c = 3
  `;
  const obj = parse(src, { integersAsBigInt: false }) as any;
  obj[""] = [[1, { value: 2 }]];
  const result = patch(src, obj);
  expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
  expect(result).toEqual(dedent`
    "" = [ [ 1, { value = 2 } ] ]

    [other]
    b = 2
  `);
});

test('collapsing an AOT with a non-contiguous sub-table to a scalar array (seed 1285105 alt.2)', () => {
  const src = dedent`
    [[""]]
    a = 1

    [other]
    b = 2

    ["".c47eko_.bog8_vy3w]
    c = 3
  `;
  const obj = parse(src, { integersAsBigInt: false }) as any;
  obj[""] = [1, 2, 3];
  const result = patch(src, obj);
  expect(parse(result, { integersAsBigInt: false })).toEqual(obj);
  expect(result).toEqual(dedent`
    "" = [ 1, 2, 3 ]

    [other]
    b = 2
  `);
});

test('deleting an implicit AOT sub-table while adding a root sibling (seed 1428499 alt.1)', () => {
  const src = dedent`
    [[""]]
    a = 1

    [["".sub.q]]
    b = 2
  `;
  const obj = parse(src) as any;
  delete obj[""][0].sub;
  obj.extra = { value: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1

    [extra]
    value = true
  `);
});

test('replacing an implicit AOT sub-table with a scalar (seed 1428499 alt.2)', () => {
  const src = dedent`
    [[""]]
    a = 1

    [["".sub.q]]
    b = 2
  `;
  const obj = parse(src) as any;
  obj[""][0].sub = 7;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1
    sub = 7
  `);
});

test('flattening an AOT structural edit to a nested inline object (seed 1657445 alt.1)', () => {
  const src = dedent`
    [[""]]
    a = 1

    [["".rw109.kjzi]]
    x = 2
  `;
  const obj = parse(src) as any;
  obj[""][0].rw109.kjzi = { nested: { value: 3495.677246246487 } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1
    rw109.kjzi = { nested = { value = 3495.677246246487 } }
  `);
});

test('flattening an AOT structural edit to an array-valued dotted key (seed 1657445 alt.2)', () => {
  const src = dedent`
    [[""]]
    a = 1

    [["".rw109.kjzi]]
    x = 2
  `;
  const obj = parse(src) as any;
  obj[""][0].rw109.kjzi = [3495.677246246487, false];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    a = 1
    rw109.kjzi = [ 3495.677246246487, false ]
  `);
});

test('collapsing an implicit dotted table to an inline object (seed 1674968 alt.1)', () => {
  const src = dedent`
    [[a]]
    b.c.k1 = 1
    b.c.k2 = 2
  `;
  const obj = parse(src) as any;
  obj.a[0].b.c = { value: "X", nested: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]
    b.c.value = "X"
    b.c.nested = true
  `);
});

test('collapsing an implicit dotted table to an array (seed 1674968 alt.2)', () => {
  const src = dedent`
    [[a]]
    b.c.k1 = 1
    b.c.k2 = 2
  `;
  const obj = parse(src) as any;
  obj.a[0].b.c = ["X", 2];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]
    b.c = [ "X", 2 ]
  `);
});

test('deleting an indexed dotted leaf while adding a sibling leaf (seed 1845422 alt.1)', () => {
  const src = dedent`
    [[a]]

    [a.q]
    v = [0, 0, 0, { p.g.h = 3 }]
  `;
  const obj = parse(src) as any;
  delete obj.a[0].q.v[3].p.g.h;
  obj.a[0].q.v[3].p.g.extra = false;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]

    [a.q]
    v = [0, 0, 0, {p.g.extra = false}]
  `);
});

test('deleting an indexed dotted leaf while replacing its inline parent (seed 1845422 alt.2)', () => {
  const src = dedent`
    [[a]]

    [a.q]
    v = [0, 0, 0, { p.g.h = 3 }]
  `;
  const obj = parse(src) as any;
  delete obj.a[0].q.v[3].p.g.h;
  obj.a[0].q.v[3].p.g = { replacement: 4 };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[a]]

    [a.q]
    v = [0, 0, 0, {p.g.replacement = 4}]
  `);
});

test('editing an AOT entry to a nested inline object under its parent table (seed 1947810 alt.1)', () => {
  const src = dedent`
    [""]
    x = 1

    [["".u60ke_j3]]
    a = 2
  `;
  const obj = parse(src) as any;
  obj[""].u60ke_j3 = { nested: { value: -3754 } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    x = 1
    u60ke_j3 = { nested = { value = -3754 } }
  `);
});

test('editing an AOT entry to a mixed array under its parent table (seed 1947810 alt.2)', () => {
  const src = dedent`
    [""]
    x = 1

    [["".u60ke_j3]]
    a = 2
  `;
  const obj = parse(src) as any;
  obj[""].u60ke_j3 = [{ value: -3754 }, false];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [""]
    x = 1
    u60ke_j3 = [ { value = -3754 }, false ]
  `);
});

test('replacing an inline array element with a nested multiline object (seed 121096 alt.1)', () => {
  const src = dedent`
    wn9c0 = [192915]
  `;
  const obj = parse(src) as any;
  obj.wn9c0[0] = { k21: { text: `line\nvalue` } };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent.withOptions({ escapeSpecialCharacters: false })`
    wn9c0 = [{k21 = {text = "line${String.fromCharCode(92)}nvalue"}}]
  `);
});

test('replacing an inline array element with a nested array (seed 121096 alt.2)', () => {
  const src = dedent`
    wn9c0 = [192915]
  `;
  const obj = parse(src) as any;
  obj.wn9c0[0] = ["zxZ", { nested: true }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    wn9c0 = [["zxZ", {nested = true}]]
  `);
});

test('changing a nested AOT scalar into an inline object (seed 129645 alt.1)', () => {
  const src = dedent`
    [[""]]
    x = 1
    a = 2

    [[""."=M._!wD>]".l8401w1]]
    k = 1
  `;
  const obj = parse(src) as any;
  obj[""][0]["=M._!wD>]"]["l8401w1"][0] = { value: 4567 };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    x = 1
    a = 2

    [[""."=M._!wD>]".l8401w1]]
    value = 4567
  `);
});

test('changing a nested AOT scalar into a two-element array (seed 129645 alt.2)', () => {
  const src = dedent`
    [[""]]
    x = 1
    a = 2

    [[""."=M._!wD>]".l8401w1]]
    k = 1
  `;
  const obj = parse(src) as any;
  obj[""][0]["=M._!wD>]"]["l8401w1"][0] = [4567, false];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [[""]]
    x = 1
    a = 2

    [""."=M._!wD>]"]
    l8401w1 = [ [ 4567, false ] ]
  `);
});

test('deleting a table while retaining its nested AOT child as an empty array (seed 136292 alt.1)', () => {
  const src = dedent`
    [x]
    a = 1

    [[x.y]]
    b = 2
  `;
  const obj = parse(src) as any;
  obj.x.y = [];
  delete obj.x.a;
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [x]
    y = []
  `);
});

test('collapsing a table while removing its nested AOT entirely (seed 136292 alt.2)', () => {
  const src = dedent`
    [x]
    a = 1

    [[x.y]]
    b = 2
  `;
  const obj = parse(src) as any;
  delete obj.x.y;
  obj.x = { replacement: true };
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [x]
    replacement = true
  `);
});

test('converting an AOT into a three-element mixed array (seed 136865 alt.1)', () => {
  const src = dedent`
    [[ng.tll]]
    a = 1
    b = 2
  `;
  const obj = parse(src) as any;
  obj.ng.tll = [{ k8: 187 }, -4619, { k78: [3357.17] }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [ng]
    tll = [ { k8 = 187 }, -4619, { k78 = [ 3357.17 ] } ]
  `);
});

test('converting an AOT into a scalar-first mixed array (seed 136865 alt.2)', () => {
  const src = dedent`
    [[ng.tll]]
    a = 1
    b = 2
  `;
  const obj = parse(src) as any;
  obj.ng.tll = [-4619, { k8: 187, k78: [3357.17] }];
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    [ng]
    tll = [ -4619, { k8 = 187, k78 = [ 3357.17 ] } ]
  `);
});


test('regression for fuzz seed 2591153', () => {
  const src = dedent`
      gas = true
      sz = 178262
      "v^.aq/(w" = 2058-10-24T21:21:43
      mt5434cc."Cx[+"."q(?TYenJR" = """
      &m}Y"""
      ix4t8ryk8."hBTJ&l&3bl".yt3z6_ = true
      w2 = 2049-04-03T21:46:36.579301
      "R " = 0o150531
      clkd176.gs6 = -579731
      "FkeQ?W".u5oxixqh = "w4*5](T\`Wgjlbi+@wYY2o~"
      # yg=|nPERhmd_2Qj;Qu$O^|T2*u
      ryhwr.m5tn.gsg1h = 207_795
      p6jzbb677n.uud.fyoqco70y = 90023.48570
      k0cxt83.iwobqz4vi.NQSltlW = 513513
      # nx%JXe@oDPCx$/Iz-dV%:EI)/
      [["".lcmm1m0.vfkm5_p]]
      "Wg[" = 0b0011011
      "m4}cz".jnyu = 2080-08-12T23:09:05Z
      # |J^H\`E{/un~cEYJoJb
      # 7ZBeQqq/ot<wmX
      # 2+FkPyDGb?+8(aqS]r8
      # |%pz=:$ux\`d&CDCr}G
      # y3H{~*flYL}+A;taf
      cmhm.g."" = "4eUtm4q+dyK9.o|+4!%?p|,ljoBLsl*0pt<EYDKG 9"
      "!s&" = true
      # sVW
      # yk1kS3=CBFo6$L/GUT\`])!]uwPY8-Hqv*/)ywo93
      s9s.abk = -212_411
      w1zxuk = 516918
      
      [_]
      
      [hg64t37]
      
      [de3.psdzad0qf]
      zncww-.l485oixh = 94624
      imnm92591y = 23461.15283
      i.mj4n.">:" = 258084
      vhashp_7d-."zD_>~7Lf3" = -464765
      "q=y".ojj = """
      iB"""
      x7co_.u.AtJ = 754_620
      
      [q2c."o!AxxvqZj"]
      g9p75i5s_ = '''
      !esM3g7w
      }I2t-:Y-|#MD
      E]
      ,^vU
      oEA
      w
      0
      !
      7nGBp
      
      '''
      cmzsfzz.f3utn728zu = true
      "^]jfx9Hz_" = 2053-10-21T07:50:22Z
      f6ziybf.egyieof = false
      "B3:c%G9".sf_90m7q.ncide1 = 1981-12-01T06:47:08Z
      t = 986e-61
      ez."yTxL(kP[j0"."SPCIi(YbYe" = 53780.13362
      cpqdsgprv."%-+WE".x9vi = 2091-11-01T14:04:57
      s-yvw-4f.jes8rouk = 82_668.64849
      
      [gspp.e.vg_08p5dgs]
      eegf54qq.b3ff_g = true
      bttb8h.vk5c."" = []
      dx2feuc.3 = """
      -z
      =t9EF)
      6+"""
      # ~xsBrSdMAd;mr\`JPYi
      yh3l3-g2x.gmw3_.ppq_ep3k3 = """
      = VD95
       v?{gW
      j
      1,]OS5"""
      f6qrvqct.ny0fj-3 = 367707
      fx = nan
      # oO!S;$e^N>g{%,+eJzcq(}kE,@J=je+M
      [[qqqk."C<4M\`%W2L"]]
      
      [[y9wecl5]]
      rw3l2q8mk.d-ps = ']zgL)[hSjD.R+'
      # i(M^R&yAn3x3pj]ayUh -^ *xi\`1,cQ(~
      qe = 995783
      vag."[Q&%][ 6ap" = 559418
      aam48 = true
      
      ["AKy:}nV@"]
      kl7u = true
      # Vu_I\`CdTJh>9oacHXu\`o>|Nt\`=pHltLN
      "hG b+T".oyyuk3 = 937467
      r46f8rhrh.rprqr8g = -566314
      p8 = {
          uyvk4h."m}5?" = "Jl*~zOV7.6JlX?C~VdO$dA3A~},$#/*w<JO",
          "(J<nemN,8".s2."+)3k/" = [967985, -25027300000000694064, true, true, 50_953.25829, ["yXG33^DO3b4iLEKw?", 0b100101, -650416], """
      uP,\`RY
      ,n\`
      nZ7mx[
      
      P9
      5=2O"""],
          z8o4hp = 'sr3[0&q}/SDjQc)Ado5zrkdi4bAp0]nkTFHbTWgme<?a)',
          "U8hQQ9/D".n2.sggpgaty7k = 976952,
          "|".b1b = -613100,
          "M3Z-VW\`" = false,
      }
      necvf.a.",PRvH " = 1980-07-09T00:13:38
    `;

  const obj = parse(src) as any;
  delete obj.w2;
  obj["AKy:}nV@"].p8["(J<nemN,8"].s2["+)3k/"] = [true, false, true, 3173];
  obj["AKy:}nV@"].p8["(J<nemN,8"].s2["+)3k/"].splice(3, 0, 3173);

  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  // TODO: Add an exact-output assertion once the intended formatting for this
  // complex multi-change regression is specified.
  // expect(result).toEqual(dedent`
  //     [...]
  //     `);
});

test('distilled regression for fuzz seed 1112646', () => {
  const src = dedent`
    [["2S38X#"]]
    "dj/{gXY".sp_ya888x.mx7h8hlr = '''
    D<'''
    ln_n = [
        '''
    ,''',
        [{ "t&R/jR" = '''
    TPV!''' }, false, 287_173, "NAzv Be{}8z]C2QzJpyz}_]idd", 1984-04-16T12:37:13Z],
    ]
  `;

  const obj = parse(src) as any;
  obj["2S38X#"][0]["dj/{gXY"].sp_ya888x = [new Date(Date.UTC(2018, 5, 14)), -2069, 784];

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 1286183', () => {
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

  const result = patch(src, obj, {
    inlineTableStart: 0,
    trailingComma: false,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: '\r\n',
    leadingBom: false,
    truncateZeroTimeInDates: true,
    useTabsForIndentation: false
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 1383962', () => {
  const src = dedent`
    "1vn[1flkZ".qmam4fx = [{ dxnzi0.d0hc = [true, 47577.29573, true, 2077-04-05, 282_582, """
    s~""", 76968.6746, 'Qr+qJ|jGKM n=c1oEx^\`p2;L0H_Nyg*3K$:A{?jJg:I', 2069-08-08T04:34:33, "A3!)hHn6}I"] }, 574310, 28569, -63757100000000418476, """
    8=Qed7]-^jftM""", -50759.88688, -inf, true]
    [[kmza]]
    ptvl.s2fdfonrz9 = 'vQb/mr3cU )zJScrEv2bQ-$}kK1U&o,5hpf9@N|Ke['
  `;

  const obj = parse(src) as any;
  obj.kmza[0].ptvl = new Date(Date.UTC(2006, 1, 14));

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 1693919', () => {
  const src = dedent`
    [g3s_y5jv_d.mfdfdc]
    "".c4esqy.t79d__y = {
        bnJF1EQ = { jg08iizbia = """
     fP=SCd-/e]!;bs(AR*w3L""" },
        "#?VRmg"."<mhN6Oe|cu" = ["""
    v[""", nan, "1T4f9 KxuH<=a3UzaPuktBT"],
    }
  `;

  const obj = parse(src) as any;
  obj.g3s_y5jv_d.mfdfdc[""].c4esqy.t79d__y.bnJF1EQ = { "k27": { "k57": false, "k17": false, "k67": [new Date(Date.UTC(2036, 8, 23)), true, -1287.6224634237587] } };

  const result = patch(src, obj, {
    inlineTableStart: 1,
    trailingComma: true,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: '\r\n',
    leadingBom: false,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: true
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 175924', () => {
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

  const result = patch(src, obj, {
    trailingComma: false,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: '\r\n',
    leadingBom: true,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: false
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 1896226', () => {
  const src = dedent`
    y0pgo = '''
    zw$#+{rD] Q:|WI_5xV'''
    [syn2x.b.o6y2i]
    xx1dnmb-lu.i-b5qipqve = { kh5rr3tnn.tfv.acbd8jed_ = true, am7fwt.jri8xuo = "drC+m!9n vxA(?w8N+)9]jF1 /", eu0e.ygeqkl.rv5zela02z = -792779, c.teb.pe = 0xd45, fk-no = false, wvddr.gmv.d8iwt = "]49F#3@Gi^y{@4y(eYalh%@", piif.qwkfgiyp = false, "kNg6#mA".mmu1i.u1aubp = true, hk3wa8v.">uk|E\`!8a" = 2055-10-17T23:43:59.550334Z, "|EnD &e~>\`".npriy.OU = inf, m3y3lj.viyt2w.c = "U/qmv0wx=W/ib/M^t<t7vC[#J_?KpncFg?a", quumciha = {
    }, q."5;" = 704498, k9zaeuluse."8%2Z?" = """
    wU:Z""" }
    yutxpp.uzz."/S|" = ["WM^ZLQ}e", -836_768, { c19.hv = { "Z\`xk2<4{" = "08RXrX/B]Wjo}v77}^Rx", be9z3h.gaxei2pmox = """
    """, V.wgxp4xo62x."T~]x(@Au#" = '', "opB,{-|#" = 0o22, durkp54qyf.uOlU = "wnnD8=|KA1sc(Qy[ qz oX{quU11|g!22/*5W1", n3bwpes.eh.lc8ih = 0o15166757, w = "_j({", "dDSj9b{" = true, "X^(/t)".b_sxy."TU!{BR5hcx" = -6324.85055, qvvau = false, "CnF)-}9Y" = 30824.10286, z.iyyg2 = 0b010011 } }, {
    }, 2004-04-25T17:21:11, -51408.63582, 2006-12-08T20:27:41.624602Z, true, nan, 743736]
  `;

  const obj = parse(src) as any;
  delete obj.syn2x.b.o6y2i.yutxpp.uzz["/S|"][2].c19.hv;

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 2185943', () => {
  const src = dedent`
    ei.Nj = """
    >!~Wg-y)~"""
    [[megac68k-]]
    z = [
    ]
    kw = [46674.18719, 48559.13327, 2091-08-20T06:58:11, 2024-05-10, 275_068, {
        cnoff = { l7."UMN$eUS9="."" = '''
    C/,9''' },
        aujqbb = '''
    P/*''',
    }, 22787.072880, 79051.79185, true]
    "1x(4u.WK2x".v4r4evh1.c3pw90 = """
    m@7"""
  `;

  const obj = parse(src) as any;
  delete obj["megac68k-"][0].kw[5].cnoff.l7["UMN$eUS9="];

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 2497422', () => {
  const src = dedent`
    "x^@zw" = [' ', -78860.81892, { ik4o2d6z4j = """
    DM}T+uCZVx*t+qMtQtbPrFiI""" }, "\`kO^E(R8324tzB;#iBmn9aX!9KUL*N0eWvf/J:R", 36709.83314, [true, "ZrS|K#MaiwaYr4UOIP<$=8clcC*+Px{^#v@>G|(@>;a>w&X&Jb", 945e+85, -30134.83738, {
    }, """
    HLzq$8|?""", "<Rfs2A h+<TD:_8+oKb64ffE,uqNI-WjbafZn!", 17:57:10, false, false], -31687.66292]
  `;

  const obj = parse(src) as any;
  delete obj["x^@zw"][2].ik4o2d6z4j;

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 2531104', () => {
  const src = dedent`
    mmx9rwvk7k.lqmp_-1cgl = '''
     5>ZvY=\`r~ha'''
    wcyw = {
        tf."O\`aB" = [true, { "%#FUrN".cvmmswb.">&K?" = 115668, p2ohe0.sqh9uj."$Qk^~(" = -92131.88369, kvy9 = false, kvy9h1bo.fe7b1px4bb = """
      :-i1""" }, 745102, 96226.27680, 0o21016, false, 802344, "#vH#E:o>J[jB||M"],
        l."~u)HFjuZ" = 00:16:17,
    }
  `;

  const obj = parse(src) as any;
  obj.wcyw.tf["O`aB"][1] = { "k96": 1640, "k18": true };

  const result = patch(src, obj, {
    inlineTableStart: 1,
    trailingComma: true,
    bracketSpacing: false,
    updateOrder: true,
    trailingNewline: 1,
    newLine: '\n',
    leadingBom: true,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: false,
    minimumDecimals: 1
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 2667551', () => {
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

  const result = patch(src, obj, {
    inlineTableStart: 1,
    trailingComma: false,
    bracketSpacing: false,
    updateOrder: true,
    trailingNewline: 1,
    newLine: '\n',
    leadingBom: false,
    truncateZeroTimeInDates: true,
    useTabsForIndentation: false
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 2824408', () => {
  const src = dedent`
    [ivk.nuan749c7]
    pJ.kd7jct7_o = {
        xwjbnijuw = { k-l259ef = "E2 U!/a", vi.dg5 = true, f4wkz1o_j.cgog.gw8umgy = '''
    t5B02omW_Qc5gU}''', qcc3pxkelq._G = """
    \`]cA6:81:-L__K?yaccQdE{zs{v$8?CN?be""" },
        "\`pD".r = "U9SE]2S+<Ak^k|5lymMuq=\`2w_mfA%m-Q,NMYi1;:5e^v",
    }
    heo47x9_j.qoa2f-.qoyfi7jwn = [
    ]
    nbtq.sx6 = {
    }
  `;

  const obj = parse(src) as any;
  obj.ivk.nuan749c7.pJ.kd7jct7_o.xwjbnijuw = { "k19": -188 };

  const result = patch(src, obj, {
    trailingComma: true,
    bracketSpacing: false,
    updateOrder: true,
    trailingNewline: 2,
    newLine: '\n',
    leadingBom: false,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: false,
    minimumDecimals: 1
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 2858114', () => {
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

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 377453', () => {
  const src = dedent`
    eqki- = {
        v1xubvr5b2 = [false, true, '''
    <6@Qd}q = \`q]B>FSx''', -49_687.079945, { czt."@C~NuX" = "o5!A|8C-ri)@-U{I", t7.V.v = 0x5c5fa0, ")iE=18F=" = "h#\`^&yX^7wqnyK}(2j?~uEXfHhW1VmI;7)zeF54:Z&+whORWa", zC."&E".p2-fnhimsk = true, zo.HK.o_etoxccp6 = 0o26771, y95lhy8.x.ibl4bqh4di = 0xcfe, hmmu35k7g.iit__292.zjjfy = 15:08:47, c4u9he.";[c76C".bkkhwx2_5w = """
    o0q*""" }, "I3q/hH", 753862, 'z', -64864.2541],
        gmpmfyn4.y1np1 = 0o4755211,
    }
  `;

  const obj = parse(src) as any;
  obj["eqki-"].v1xubvr5b2[4] = { "k94": -4472 };

  const result = patch(src, obj, {
    trailingComma: true,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: '\n',
    leadingBom: false,
    truncateZeroTimeInDates: true,
    useTabsForIndentation: false,
    minimumDecimals: 1
  });
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 771152', () => {
  const src = dedent`
    b_3cmsbhh.al1erl4-9 = [236463, '''
    -xl6''', 0o34, 90356.53508, true, [{ us.xl."/" = """
    fr;,Iq*!9""" }, 1986-03-02]]
  `;

  const obj = parse(src) as any;
  obj.b_3cmsbhh["al1erl4-9"][5][0].us.xl = { "k51": -3337.0673237368464, "k49": "QhvX_vl aKj9dsQ0r7" };

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

test('distilled regression for fuzz seed 863664', () => {
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

  const result = patch(src, obj, undefined);
  expect(parse(result)).toEqual(obj);
});

