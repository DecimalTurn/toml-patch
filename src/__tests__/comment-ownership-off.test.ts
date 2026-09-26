import dedent from 'dedent';
import { parse, patch } from '../index';

// Opt-out suite: `commentOwnership: false` disables LEADING (R2) and
// cross-container (R5) comment ownership. A removed entry leaves its own-line
// leading comment block behind, but a same-line trailing comment (R1) still
// travels with its key — R1 predates the option and is never optional.
// See docs/Comment-Ownership.md.

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

  test('still drops a same-line trailing comment (R1 always applies)', () => {
    const input = dedent`
      [database]
      server = "192.168.1.1"
      enabled = true # enable this feature
      ports = [8001, 8002]
    ` + '\n';

    const value = parse(input);
    delete value.database.enabled;

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
  test('leaves the entry\'s leading comment behind when an entry is removed', () => {
    const input = dedent`
      # product list
      [[products]]
      name = "Hammer"

      [[products]]
      name = "Nail"
    ` + '\n';

    const value = parse(input);
    value.products.splice(0, 1);

    expect(patch(input, value, { commentOwnership: false })).toEqual(dedent`
      # product list

      [[products]]
      name = "Nail"
    ` + '\n');
  });
});

describe('commentOwnership: false on inline array element removal', () => {
  test('drops the removed element\'s same-line trailing comment (R1)', () => {
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

  test('a leading comment on a MOVED element still travels with it (moves always carry)', () => {
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

    // A Move never deletes an element, so its comments always travel with it —
    // the option governs deletion only.
    expect(patch(input, value, { commentOwnership: false })).toBe(dedent`
      xs = [
        # doc for two
        2,
        1,
        3,
      ]
      y = 9
    ` + '\n');
  });
});

describe('commentOwnership: false on inline table element removal', () => {
  test('drops the removed row\'s trailing comment (R1)', () => {
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
    // Reordering carries each entry's owned comments with it, so with leading
    // ownership off the reorder is a no-op rather than stranding comments away
    // from their keys.
    const input = dedent`
      # leads a
      a = 1 # trail a
      b = 2
    ` + '\n';

    const result = patch(input, { b: 2, a: 1 }, { updateOrder: true, commentOwnership: false });

    expect(result).toBe(input);
  });
});
