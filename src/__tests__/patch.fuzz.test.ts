
import patch from '../patch';
import { parse } from '../';
import diff from '../diff';
import dedent from 'dedent';
import { fuzzOne } from './fuzz-patch';

const historicalFuzzSeeds = [
  19506, 21525, 30330, 31662, 32801, 35943, 37465, 39363, 40181, 41613,
  43159, 43199, 46522, 54607, 61827, 62163, 62263, 65785, 67221, 68244,
  68861, 78079, 79938, 80004, 82825, 86547, 86724, 121096, 129645, 136292,
  136865, 175924, 179377, 186384, 208822, 224081, 272851, 299772, 358055,
  377453, 421965, 460447, 599513, 742554, 771152, 863085, 863664, 1020868,
  1024477, 1112646, 1137525, 1285105, 1286183, 1383962, 1428499, 1657445,
  1674968, 1693919, 1845422, 1896226, 1947810, 2185943, 2497422, 2531104,
  2591153, 2667551, 2824408, 2858114
];

test.each(historicalFuzzSeeds)('historical fuzz seed %d still passes the full harness', (seed) => {
  const result = fuzzOne(seed, 3);
  expect(result.status, result.error).toBe('ok');
});

test('replacing an object in a nested multiline array preserves trailing siblings (seed 1112646)', () => {
  const src = dedent`
    values = [
      0,
      1,
      2,
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

  const original = parse(src) as any;
  const obj = parse(src) as any;
  // Replace the inline table in the nested array with a new inline table that has a different structure and values.
  obj.values[3][0] = {
    primary: -4807.689925655723,
    details: { values: [-2765, new Date(Date.UTC(2016, 6, 12))] }
  };

  const changes = diff(original, obj);
  expect(changes).toHaveLength(3);
  expect(changes).toMatchInlineSnapshot(`
    Array [
      Object {
        "path": Array [
          "values",
          3,
          0,
          "old",
        ],
        "type": "Remove",
      },
      Object {
        "path": Array [
          "values",
          3,
          0,
          "primary",
        ],
        "type": "Add",
      },
      Object {
        "path": Array [
          "values",
          3,
          0,
          "details",
        ],
        "type": "Add",
      },
    ]
  `);

  // TODO: Decide if we should consider making the inline table multiline to preserve the
  // original formatting of the inline table that is being replaced (or using the fact
  // that we are already inside a multiline array). Alternatively, we could just have the
  // decision of using a multi-line inline table be based on the desired print-width (only
  // using MLIT if they allow to shrink the inline table to fit the print-width). 
  // Currently, it is being converted to a single-line inline table.
  const result = patch(src, obj);
  expect(parse(result)).toEqual(obj);
  expect(result).toEqual(dedent`
    values = [
      0,
      1,
      2,
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
    o6z = { ut = { g7k5gct = { k12 = "OGB" } }, w.x = 5 }
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
    o6z = { ut = { g7k5gct = { k12 = [ "O", "G" ] } }, w.x = 5 }
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
    o6z = { ut = { g7k5gct = { k12 = "O${String.fromCharCode(92)}nG" } }, w.x = 5 }
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


// The cases below are reductions of fuzz seeds, distilled down to the structure
// that actually triggers each bug: the random keys, values and padding the seed
// happened to generate are renamed or removed, since the reproduction depends on
// the shape (multiline strings inside multiline inline containers, how many
// writes land in one container) and not on the characters. The seeds themselves
// stay covered byte-for-byte by the historical harness test above.
//
// Each asserts the exact TOML produced, not just that the result round-trips.
// Most of them only round-trip because patch() validates its first attempt and
// retries transactionally, and that retry rewrites whole multiline inline
// containers: multiline strings collapse to basic strings, non-decimal integer
// bases are normalised, dotted keys expand into nested inline tables. The
// snapshots record that, so recovering any original formatting shows up as a
// reviewable diff. Regenerate with `vitest -u` once a change is confirmed good.

// Deleting a root key shifts every offset below it, and the nested array is
// replaced by a shorter one plus a spliced duplicate. The removals are emitted
// in original-array coordinates, so reorder() has to place them before the
// same-array additions or a later removal addresses an index that is gone.
test('removing a root key while shrinking a nested array in a multiline inline table (seed 2591153)', () => {
  const src = dedent`
    removed = 2049-04-03T21:46:36.579301
    ["host config"]
    enabled = true
    options = {
        label = "a value",
        nested.items.list = [967985, -25027300000000694064, true, true, 50_953.25829, ["inner", 0b100101, -650416], """
    ml text"""],
        tail = 'another value',
    }
  `;

  const obj = parse(src) as any;
  delete obj.removed;
  obj['host config'].options.nested.items.list = [true, false, true, 3173];
  obj['host config'].options.nested.items.list.splice(3, 0, 3173);

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    ["host config"]
    enabled = true
    options = {
        label = "a value",
        nested.items.list = [true, false, true, 3173, 3173],
        tail = 'another value',
    }
  `);
  expect(parse(result)).toEqual(obj);
});

// The dotted key loses its last segment and becomes an array, while the
// multiline inline array below it must keep its own layout untouched.
test('replacing a dotted-key subtable with an array beside a multiline inline array (seed 1112646)', () => {
  const src = dedent`
    [["release notes"]]
    "doc path".summary.detail = '''
    ok'''
    items = [
        '''
    ,''',
        [{ "inner key" = '''
    text!''' }, false, 287_173, "a plain string value", 1984-04-16T12:37:13Z],
    ]
  `;

  const obj = parse(src) as any;
  obj['release notes'][0]['doc path'].summary = [new Date(Date.UTC(2018, 5, 14)), -2069, 784];

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    [["release notes"]]
    "doc path".summary = [ 2018-06-14T00:00:00.000Z, -2069, 784, ]
    items = [
        '''
    ,''',
        [{ "inner key" = '''
    text!''' }, false, 287_173, "a plain string value", 1984-04-16T12:37:13Z],
    ]
  `);
  expect(parse(result)).toEqual(obj);
});

// The deleted key is the first member of a multiline inline table whose
// remaining members span two more lines, so every following offset moves.
test('deleting a deep dotted key inside a multiline inline table (seed 1286183)', () => {
  const src = dedent`
    header = """
    ab"""
    [section]
    outer."quoted key" = {
        first.second.third = { alpha.beta.gamma = '''
    ''' },
        filler = { one.two.three = -65079.12231, flag = false, "q one".mid.leaf = false, group = { count.total = 770012, note.body = """
    first inline note""", a-b.c.d = 'short lit', e.f = 36740, "q two".g = false, empty = "", "q three".h = 527558, "q four".date.stamp = 2080-12-04, "q five" = 31256.58522, i.j = 819597, k = 0x08, l = -284092, MM = 0o64, n.o = true }, "q six".p.q = 2081-06-28T00:40:23Z, "q seven".r = """
    second inline note""", s.t = {}, u.v = 90692.79376, w."q eight" = true },
    }
  `;

  const obj = parse(src) as any;
  delete obj.section.outer['quoted key'].first.second.third.alpha.beta.gamma;

  const result = patch(src, obj, {
    inlineTableStart: 0,
    trailingComma: false,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: "\r\n",
    leadingBom: false,
    truncateZeroTimeInDates: true,
    useTabsForIndentation: false
  });
  expect(result).toEqual(dedent`
    header = """
    ab"""
    [section]
    outer."quoted key" = {
        first.second.third = {  alpha.beta = {} },
        filler = { one.two.three = -65079.12231, flag = false, "q one".mid.leaf = false, group = { count.total = 770012, note.body = """
    first inline note""", a-b.c.d = 'short lit', e.f = 36740, "q two".g = false, empty = "", "q three".h = 527558, "q four".date.stamp = 2080-12-04, "q five" = 31256.58522, i.j = 819597, k = 0x08, l = -284092, MM = 0o64, n.o = true }, "q six".p.q = 2081-06-28T00:40:23Z, "q seven".r = """
    second inline note""", s.t = {}, u.v = 90692.79376, w."q eight" = true },
    }
  `.replace(/\n/g, '\r\n') + '\r\n');
  expect(parse(result)).toEqual(obj);
});

// The array of tables entry collapses to a single date value while the
// multiline inline array above it, holding a bigint and -inf, stays put.
test('replacing an AOT subtable with a date beside a multiline inline array (seed 1383962)', () => {
  const src = dedent`
    "quoted key".items = [{ inner.values = [true, 47577.29573, true, 2077-04-05, 282_582, """
    ml""", 76968.6746, 'literal text', 2069-08-08T04:34:33, "basic text"] }, 574310, 28569, -63757100000000418476, """
    second ml""", -50759.88688, -inf, true]
    [[entries]]
    label.name = 'another literal'
  `;

  const obj = parse(src) as any;
  obj.entries[0].label = new Date(Date.UTC(2006, 1, 14));

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    "quoted key".items = [{ inner.values = [true, 47577.29573, true, 2077-04-05, 282_582, """
    ml""", 76968.6746, 'literal text', 2069-08-08T04:34:33, "basic text"] }, 574310, 28569, -63757100000000418476, """
    second ml""", -50759.88688, -inf, true]
    [[entries]]
    label = 2006-02-14T00:00:00.000Z
  `);
  expect(parse(result)).toEqual(obj);
});

// The replacement is deeper than what it replaces, so the container grows
// while a sibling multiline array below it has to keep its own positions.
test('replacing an inline-table member with a nested object in a multiline inline table (seed 1693919)', () => {
  const src = dedent`
    [outer.inner]
    "".middle.target = {
        first = { nested = """
     indented text""" },
        "quoted a"."quoted b" = ["""
    ml""", nan, "plain text"],
    }
  `;

  const obj = parse(src) as any;
  obj.outer.inner[''].middle.target.first = { alpha: { beta: false, gamma: false, delta: [new Date(Date.UTC(2036, 8, 23)), true, -1287.6224634237587] } };

  const result = patch(src, obj, {
    inlineTableStart: 1,
    trailingComma: true,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: "\r\n",
    leadingBom: false,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: true
  });
  expect(result).toEqual(dedent`
    [outer.inner]
    "".middle.target = {
        first = { alpha = { beta = false, gamma = false, delta = [ 2036-09-23T00:00:00.000Z, true, -1287.6224634237587, ], } },
        "quoted a"."quoted b" = ["""
    ml""", nan, "plain text"],
    }
  `.replace(/\n/g, '\r\n') + '\r\n');
  expect(parse(result)).toEqual(obj);
});

// Emptying the inline table removes a multiline string, which shortens the
// enclosing array and leaves its closing bracket and comma offsets stale.
test('deleting the only member of an inline table inside a multiline array (seed 175924)', () => {
  const src = dedent`
    [[outer."=".inner]]
    empty = {
    }
    items = ["plain text", 1988-12-04T04:19:06, [
        0b000000110001011,
        { target = """
    ml""" },
        -907693,
    ], 65260.050825]
  `;

  const obj = parse(src) as any;
  delete obj.outer['='].inner[0].items[2][1].target;

  const result = patch(src, obj, {
    trailingComma: false,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: "\r\n",
    leadingBom: true,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: false
  });
  expect(result).toEqual('\uFEFF' + dedent`
    [[outer."=".inner]]
    empty = {
    }
    items = ["plain text", 1988-12-04T04:19:06, [
        0b000000110001011,
        {},
        -907693,
    ], 65260.050825]
  `.replace(/\n/g, '\r\n') + '\r\n');
  expect(parse(result)).toEqual(obj);
});

// The removed inline table contains a multiline string, so the elements after
// it in the same array shift by more than one line.
test('deleting a nested inline table inside a multiline inline array (seed 1896226)', () => {
  const src = dedent`
    top = '''
    lit text'''
    [section.a.b]
    first.leaf = { one.two.three = true, four.five = "basic one", six.seven.eight = -792779, nine.ten.eleven = 0xd45, twelve = false }
    second.middle."quoted" = ["basic two", -836_768, { outer.inner = { "quoted a" = "basic three", nested.leaf = """
    """, deep.path."quoted b" = '', "quoted c" = 0o22, other = 0b010011 } }, {
    }, 2004-04-25T17:21:11, -51408.63582, 2006-12-08T20:27:41.624602Z, true, nan, 743736]
  `;

  const obj = parse(src) as any;
  delete obj.section.a.b.second.middle['quoted'][2].outer.inner;

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    top = '''
    lit text'''
    [section.a.b]
    first.leaf = { one.two.three = true, four.five = "basic one", six.seven.eight = -792779, nine.ten.eleven = 0xd45, twelve = false }
    second.middle."quoted" = ["basic two", -836_768, {  outer = {} }, {
    }, 2004-04-25T17:21:11, -51408.63582, 2006-12-08T20:27:41.624602Z, true, nan, 743736]
  `);
  expect(parse(result)).toEqual(obj);
});

// The deletion empties one branch of a dotted key while its sibling member,
// another multiline literal string, has to keep its own layout.
test('deleting a dotted key inside an inline table in a multiline array (seed 2185943)', () => {
  const src = dedent`
    top.name = """
    ml"""
    [[entries]]
    empty = [
    ]
    values = [46674.18719, 48559.13327, 2091-08-20T06:58:11, 2024-05-10, 275_068, {
        outer = { inner."quoted"."" = '''
    lit''' },
        other = '''
    lit two''',
    }, 22787.072880, 79051.79185, true]
    "quoted key".middle.leaf = """
    ml two"""
  `;

  const obj = parse(src) as any;
  delete obj.entries[0].values[5].outer.inner['quoted'];

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    top.name = """
    ml"""
    [[entries]]
    empty = [
    ]
    values = [46674.18719, 48559.13327, 2091-08-20T06:58:11, 2024-05-10, 275_068, {
        outer = {  inner = {} },
        other = '''
    lit two''',
    }, 22787.072880, 79051.79185, true]

    "quoted key".middle.leaf = """
    ml two"""
  `);
  expect(parse(result)).toEqual(obj);
});

// The inline table becomes empty mid-array, and the array continues with a
// nested array that itself spans lines.
test('deleting the only member of an inline table holding a multiline string (seed 2497422)', () => {
  const src = dedent`
    "quoted key" = [' ', -78860.81892, { target = """
    ml text""" }, "basic one", 36709.83314, [true, "basic two", 945e+85, -30134.83738, {
    }, """
    ml two""", "basic three", 17:57:10, false, false], -31687.66292]
  `;

  const obj = parse(src) as any;
  delete obj['quoted key'][2].target;

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    "quoted key" = [' ', -78860.81892, {}, "basic one", 36709.83314, [true, "basic two", 945e+85, -30134.83738, {
    }, """
    ml two""", "basic three", 17:57:10, false, false], -31687.66292]
  `);
  expect(parse(result)).toEqual(obj);
});

// The replacement drops the multiline string the original member held, so the
// array shrinks by a line while later elements keep their positions.
test('replacing an inline table inside a multiline array (seed 2531104)', () => {
  const src = dedent`
    top.name = '''
     lit text'''
    outer = {
        inner."quoted" = [true, { "a b".c.d = 115668, e.f."g h" = -92131.88369, flag = false, other.leaf = """
      ml""" }, 745102, 96226.27680, 0o21016, false, 802344, "basic text"],
        tail."other q" = 00:16:17,
    }
  `;

  const obj = parse(src) as any;
  obj.outer.inner['quoted'][1] = { alpha: 1640, beta: true };

  const result = patch(src, obj, {
    inlineTableStart: 1,
    trailingComma: true,
    bracketSpacing: false,
    updateOrder: true,
    trailingNewline: 1,
    newLine: "\n",
    leadingBom: true,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: false,
    minimumDecimals: 1
  });
  expect(result).toEqual('\uFEFF' + dedent`
    top.name = '''
     lit text'''
    outer = {
        inner."quoted" = [true, {alpha = 1640.0, beta = true}, 745102, 96226.27680, 0o21016, false, 802344, "basic text"],
        tail."other q" = 00:16:17,
    }
  ` + '\n');
  expect(parse(result)).toEqual(obj);
});

// The removed element sits between two multiline basic strings, so the writer
// has to close the gap without disturbing either delimiter.
test('removing a date element from a multiline array of multiline strings (seed 2667551)', () => {
  const src = dedent`
    [[entries]]
    empty = {
    }
    outer.items = ['', """
    ml one""", 2088-10-24T00:54:56, """
    ml two"""]
  `;

  const obj = parse(src) as any;
  obj.entries[0].outer.items.splice(2, 1);

  const result = patch(src, obj, {
    inlineTableStart: 1,
    trailingComma: false,
    bracketSpacing: false,
    updateOrder: true,
    trailingNewline: 1,
    newLine: "\n",
    leadingBom: false,
    truncateZeroTimeInDates: true,
    useTabsForIndentation: false
  });
  expect(result).toEqual(dedent`
    [[entries]]
    empty = {
    }
    outer.items = ['', """
    ml one""", """
    ml two"""]
  ` + '\n');
  expect(parse(result)).toEqual(obj);
});

// The replaced member holds both a multiline literal and a multiline basic
// string, so the container collapses from three lines to one.
test('replacing an inline-table member with a single-key object (seed 2824408)', () => {
  const src = dedent`
    [build.rollout]
    job.settings = {
        artifacts = { logpath = "staging", db.host = true, deploy.stages.rollback = '''
    rollback plan a''', credential.id = """
    a generated token for the deploy job""" },
        "a b".r = "checked against the last recorded release set",
    }
    report.summaries.artifacts = [
    ]
    note.tag = {
    }
  `;

  const obj = parse(src) as any;
  obj.build.rollout.job.settings.artifacts = { alpha: -188 };

  const result = patch(src, obj, {
    trailingComma: true,
    bracketSpacing: false,
    updateOrder: true,
    trailingNewline: 2,
    newLine: "\n",
    leadingBom: false,
    truncateZeroTimeInDates: false,
    useTabsForIndentation: false,
    minimumDecimals: 1
  });
  expect(result).toEqual(dedent`
    [build.rollout]
    job.settings = {
        artifacts = {alpha = -188.0},
        "a b".r = "checked against the last recorded release set",
    }

    report.summaries.artifacts = [
    ]
    note.tag = {
    }
  ` + '\n\n');
  expect(parse(result)).toEqual(obj);
});

// The array holds a multiline string and ends with an inline table on its own
// lines, both of which have to survive the element removal.
test('removing an element from a multiline array before an inline table (seed 2858114)', () => {
  const src = dedent`
    outer.values = [true, 22866.4194, 890412, 399573, "one", 0x703714, "two", "three", """
    ml""", {
        inner = 59108.35246,
    }]
    other.name = '''
    lit'''
  `;

  const obj = parse(src) as any;
  obj.outer.values.splice(5, 1);

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    outer.values = [true, 22866.4194, 890412, 399573, "one", "two", "three", """
    ml""", {
        inner = 59108.35246,
    }]
    other.name = '''
    lit'''
  `);
  expect(parse(result)).toEqual(obj);
});

// The replaced element is a dense inline table spanning two lines; the array
// around it keeps its trailing scalars.
test('replacing an inline-table element inside a multiline array (seed 377453)', () => {
  const src = dedent`
    outer = {
        values = [false, true, '''
    lit with = sign''', -49_687.079945, { a."q one" = "basic one", b.c.d = 0x5c5fa0, "q two" = "basic two", e."q three".f = true, g.h.i = 0o26771, j.k.l = 0xcfe, m.n.o = 15:08:47, p."q four".r = """
    ml""" }, "basic three", 753862, 'z', -64864.2541],
        tail.leaf = 0o4755211,
    }
  `;

  const obj = parse(src) as any;
  obj.outer.values[4] = { alpha: -4472 };

  const result = patch(src, obj, {
    trailingComma: true,
    bracketSpacing: true,
    updateOrder: false,
    trailingNewline: 1,
    newLine: "\n",
    leadingBom: false,
    truncateZeroTimeInDates: true,
    useTabsForIndentation: false,
    minimumDecimals: 1
  });
  expect(result).toEqual(dedent`
    outer = {
        values = [false, true, '''
    lit with = sign''', -49_687.079945, { alpha = -4472.0 }, "basic three", 753862, 'z', -64864.2541],
        tail.leaf = 0o4755211,
    }
  ` + '\n');
  expect(parse(result)).toEqual(obj);
});

// Two writes land in the same multiline inline array through the nested inline
// table, and they overlap via the array's stale end position.
test('replacing a dotted-key subtable inside a nested inline table (seed 771152)', () => {
  const src = dedent`
    build.artifacts = [1, '''
    alpha''', 0o34, 2.5, true, [{ meta.notes.summary = """
    detail""" }, 1986-03-02]]
  `;

  const obj = parse(src) as any;
  obj.build.artifacts[5][0].meta.notes = { width: 3, label: 'measured value' };

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    build.artifacts = [1, '''
    alpha''', 0o34, 2.5, true, [{meta.notes.width = 3, meta.notes.label = "measured value"}, 1986-03-02]]
  `);
  expect(parse(result)).toEqual(obj);
});

// The replaced table is declared after a multiline array of tables value, so
// the whole preceding block has to keep its positions.
test('replacing a table with a scalar after a multiline AOT array (seed 863664)', () => {
  const src = dedent`
    [report."by target".details]
    summary."run label".entries = [
        { size.bytes = 0xd5c289d, built = 2075-01-15T23:10:01.402080, stats.counts = { lines.total = 597050, words.total = 939925, chars."with space" = 785203, files = 465053, dirs = 822110, "ratio a".value = 412e-33, cached = false, delta."ratio b".amount = -282456, mean.load.value = 70302.033641, min.load = -75001.099256, max.load = 54219.46102 }, "group a".index."sub key" = 482015, "group b"."sub b".enabled = true, "group c" = "basic one", tag = 'lit', "".marker."" = { note.body.text = """
    ml""" }, flags."opt in" = false, mask = 0b111111110111000 },
        '''
    ''',
    ]
    [replaced.sub.leaf]
  `;

  const obj = parse(src) as any;
  obj.replaced = 'replacement';

  const result = patch(src, obj, undefined);
  expect(result).toEqual(dedent`
    replaced = "replacement"

    [report."by target".details]
    summary."run label".entries = [
        { size.bytes = 0xd5c289d, built = 2075-01-15T23:10:01.402080, stats.counts = { lines.total = 597050, words.total = 939925, chars."with space" = 785203, files = 465053, dirs = 822110, "ratio a".value = 412e-33, cached = false, delta."ratio b".amount = -282456, mean.load.value = 70302.033641, min.load = -75001.099256, max.load = 54219.46102 }, "group a".index."sub key" = 482015, "group b"."sub b".enabled = true, "group c" = "basic one", tag = 'lit', "".marker."" = { note.body.text = """
    ml""" }, flags."opt in" = false, mask = 0b111111110111000 },
        '''
    ''',
    ]
  `);
  expect(parse(result)).toEqual(obj);
});
