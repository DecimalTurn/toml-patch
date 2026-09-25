import dedent from 'dedent';
import { parse, patch } from '../index';

// Opt-out suite: `commentOwnership: false` disables comment ownership on the
// deletion and inline-move paths. A removed or moved entry leaves its owned
// comments behind to describe whatever ends up occupying that spot, which is
// the legacy behavior predating explicit comment ownership.
// See docs/PLAN-CommentOwnership-Option.md.

describe('commentOwnership: false on root key-value removal', () => {
  test('leaves a leading comment block behind when the key is removed', () => {
    const input = dedent`
      # server address
      server = "192.168.1.1"
      ports = [8001, 8002]
    ` + '\n';

    const value = parse(input);
    delete value.server;

    expect(patch(input, value, { commentOwnership: false })).toEqual(dedent`
      # server address
      ports = [8001, 8002]
    ` + '\n');
  });

  test('a same-line trailing comment is still absorbed by the legacy remove path', () => {
    const input = dedent`
      [database]
      server = "192.168.1.1"
      enabled = true # enable this feature
      ports = [8001, 8002]
    ` + '\n';

    const value = parse(input);
    delete value.database.enabled;

    // Ownership off means the member is removed via the plain primitive, whose
    // own same-line trailing comment absorption still drops the comment.
    expect(patch(input, value, { commentOwnership: false })).toEqual(dedent`
      [database]
      server = "192.168.1.1"
      ports = [8001, 8002]
    ` + '\n');
  });
});

describe('commentOwnership: false on [table] removal', () => {
  test('leaves a leading comment block behind when the section is removed', () => {
    const input = dedent`
      # about a
      [a]
      x = 1

      [b]
      z = 3
    ` + '\n';

    const value = parse(input);
    delete value.a;

    expect(patch(input, value, { commentOwnership: false })).toEqual(dedent`
      # about a

      [b]
      z = 3
    ` + '\n');
  });
});

describe('commentOwnership: false on [[array-of-tables]] removal', () => {
  test('leaves the entry comment behind when an entry is removed', () => {
    const input = dedent`
      [[products]]
      name = "Hammer"
      # used in the shop
      sku = 738594937

      [[products]]
      name = "Nail"
      sku = 284758393
    ` + '\n';

    const value = parse(input);
    value.products.splice(0, 1);

    expect(patch(input, value, { commentOwnership: false })).toEqual(dedent`
      [[products]]
      name = "Nail"
      sku = 284758393
    ` + '\n');
  });
});

describe('commentOwnership: false on inline array element removal', () => {
  test('leaves the removed element\'s own comment behind (middle element)', () => {
    const input = dedent`
      xs = [
        1, # one
        2, # two
        3,
      ]
      y = 9
    ` + '\n';

    const value = parse(input);
    value.xs.splice(1, 1);

    expect(patch(input, value, { commentOwnership: false })).toBe(dedent`
      xs = [
        1, # one
        3,
      ]
      y = 9
    ` + '\n');
  });

  test('a leading comment on a MOVED element is left behind (the on-path case carries it)', () => {
    const input = dedent`
      xs = [
        1,
        # doc for two
        2,
        3,
      ]
      y = 9
    ` + '\n';

    const value = parse(input);
    value.xs = [2, 1, 3];

    // Ownership on carries `# doc for two` with element 2 to the front; off
    // leaves it stranded at its old position between the surviving elements.
    expect(patch(input, value, { commentOwnership: false })).toBe(dedent`
      xs = [
        2,
        1,
        # doc for two
        3,
      ]
      y = 9
    ` + '\n');
  });
});

describe('commentOwnership: false on inline table element removal', () => {
  test('leaves the removed row\'s comment behind', () => {
    const input = dedent`
      t = {
        a = 1, # a comment
        b = 2,
      }
      y = 9
    ` + '\n';

    const value = parse(input);
    delete value.t.a;

    expect(patch(input, value, { commentOwnership: false })).toBe(dedent`
      t = {
        b = 2,
      }
      y = 9
    ` + '\n');
  });
});

describe('commentOwnership: false with updateOrder', () => {
  test('updateOrder has no effect: keys keep their original order and comments stay put', () => {
    // Reordering carries each entry's owned comments with it, so with ownership
    // off the reorder is a no-op rather than stranding comments away from their
    // keys. Neither the key order nor any comment changes.
    const input = dedent`
      # leads a
      a = 1 # trail a
      b = 2
    ` + '\n';

    const result = patch(input, { b: 2, a: 1 }, { updateOrder: true, commentOwnership: false });

    expect(result).toBe(input);
  });
});
