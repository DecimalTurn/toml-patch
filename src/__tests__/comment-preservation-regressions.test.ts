import { parse, patch, TomlDocument } from '../index';
import dedent from 'dedent';

const prefix = '# user setting\nmodel = "keep" # model note\ncount = 9223372036854775807\nwhen = 2026-09-09T08:09:10.123456789+02:00\n';
const nested = dedent`
  [hooks]
  before = "keep" # before note
  session_start = [
    # shared group
    { hooks = [
      { command = "first" },
      { command = "middle" },
      { command = "last" },
    ] },
  ]
  after = "keep" # after note
  ` + '\n';
const scattered = dedent`
  [[hooks.session_start]] # shared group
  matcher = "startup"
  [[hooks.session_start.hooks]] # owned
  command = "first"
  [unrelated]
  keep = "yes" # unrelated note
  [hooks.session_start.hooks.options]
  timeout = 1
  [[hooks.session_start.hooks]] # surviving command
  command = "other" # other note
  ` + '\n';

describe.each(['\n', '\r\n'])('Comment preservation regressions, EOL %j', (eol) => {
  const sourceText = (body: string) => (prefix + body).replaceAll('\n', eol);
  const edits = [
    {
      name: 'remove first',
      apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.splice(0, 1),
      expected: dedent`
        [hooks]
        before = "keep" # before note
        session_start = [
          # shared group
          { hooks = [
            { command = "middle" },
            { command = "last" },
          ] },
        ]
        after = "keep" # after note
        ` + '\n',
    },
    {
      name: 'remove middle',
      apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.splice(1, 1),
      expected: dedent`
        [hooks]
        before = "keep" # before note
        session_start = [
          # shared group
          { hooks = [
            { command = "first" },
            { command = "last" },
          ] },
        ]
        after = "keep" # after note
        ` + '\n',
    },
    {
      name: 'remove last',
      apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.splice(2, 1),
      expected: dedent`
        [hooks]
        before = "keep" # before note
        session_start = [
          # shared group
          { hooks = [
            { command = "first" },
            { command = "middle" },
          ] },
        ]
        after = "keep" # after note
        ` + '\n',
    },
    {
      name: 'append',
      apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.push({ command: 'new' }),
      expected: dedent`
        [hooks]
        before = "keep" # before note
        session_start = [
          # shared group
          { hooks = [
            { command = "first" },
            { command = "middle" },
            { command = "last" },
            { command = "new" },
          ] },
        ]
        after = "keep" # after note
        ` + '\n',
    },
    {
      name: 'repair',
      apply: (data: ReturnType<typeof parse>) => { data.hooks.session_start[0].hooks[0].command = 'new'; },
      expected: dedent`
        [hooks]
        before = "keep" # before note
        session_start = [
          # shared group
          { hooks = [
            { command = "new" },
            { command = "middle" },
            { command = "last" },
          ] },
        ]
        after = "keep" # after note
        ` + '\n',
    },
  ];
  for (const api of ['patch', 'document'] as const) {
    for (const edit of edits) {
      test(`${api}: ${edit.name} keeps the shared group and neighboring comments`, () => {
        const source = sourceText(nested);
        const data = parse(source);
        edit.apply(data);
        const document = new TomlDocument(source);
        if (api === 'document') document.patch(data);
        const output = api === 'patch' ? patch(source, data) : document.toTomlString;
        expect(parse(output)).toEqual(data);
        expect(output).toBe(sourceText(edit.expected));
        expect(patch(output, parse(output))).toBe(output);
      });
    }
  }

  test('removing the only inner command keeps the shared group', () => {
    const source = sourceText(nested.replace('    { command = "middle" },\n    { command = "last" },\n', ''));
    const data = parse(source);
    data.hooks.session_start[0].hooks.splice(0, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toBe(sourceText(dedent`
      [hooks]
      before = "keep" # before note
      session_start = [
        # shared group
        { hooks = [] },
      ]

      after = "keep" # after note
      ` + '\n'));
  });

  test('removal keeps surviving command comments associated', () => {
    const source = sourceText(nested.replace('    { command = "middle" },', '    # surviving command\n    { command = "middle" }, # middle note'));
    const data = parse(source);
    data.hooks.session_start[0].hooks.splice(0, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toBe(sourceText(dedent`
      [hooks]
      before = "keep" # before note
      session_start = [
        # shared group
        { hooks = [
          # surviving command
          { command = "middle" }, # middle note
          { command = "last" },
        ] },
      ]
      after = "keep" # after note
      ` + '\n'));
  });

  // Unskip when we are able to preserve the multiline nature of an array even when all 
  // elements are removed.
  test.skip.each([false, true])('removing a closing-line command preserves the group tail, other command %s', (withOther) => {
    const source = sourceText(withOther ? dedent`
      [hooks]
      session_start = [
        { hooks = [
          { command = "other" },
          { command = "only" }
        ] }, # group tail
      ]
      ` + '\n' : dedent`
      [hooks]
      session_start = [
        { hooks = [
          { command = "only" }
        ] }, # group tail
      ]
      ` + '\n');
    const data = parse(source);
    data.hooks.session_start[0].hooks.pop();
    const document = new TomlDocument(source);
    document.patch(data);
    const output = patch(source, data);
    const expected = sourceText(withOther ? dedent`
      [hooks]
      session_start = [
        { hooks = [
          { command = "other" }
        ] }, # group tail
      ]
      ` + '\n' : dedent`
      [hooks]
      session_start = [
        { hooks = [
        ] }, # group tail
      ]
      ` + '\n');
    expect(document.toTomlString).toBe(expected);
    expect(parse(output)).toEqual(data);
    expect(output).toBe(expected);
  });

  test('nested edits preserve comments on sibling groups and surrounding keys', () => {
    const body = nested.replace(
      dedent`
        session_start = [
        ` + '\n',
      dedent`
        session_start = [
          # sibling group
          { hooks = [{ command = "sibling" }] },
        ` + '\n',
    );
    const source = sourceText(body);
    const data = parse(source);
    data.hooks.session_start[1].hooks.splice(1, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toBe(sourceText(dedent`
      [hooks]
      before = "keep" # before note
      session_start = [
        # sibling group
        { hooks = [{ command = "sibling" }] },
        # shared group
        { hooks = [
          { command = "first" },
          { command = "last" },
        ] },
      ]
      after = "keep" # after note
      ` + '\n'));
  });

  test('remove a noncontiguous command subtree without removing an unrelated table', () => {
    const source = sourceText(scattered);
    const data = parse(source);
    data.hooks.session_start[0].hooks.splice(0, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toBe(sourceText(dedent`
      [[hooks.session_start]] # shared group
      matcher = "startup"
      [unrelated]
      keep = "yes" # unrelated note
      [[hooks.session_start.hooks]] # surviving command
      command = "other" # other note
      ` + '\n'));
  });

  test('create missing hook containers while retaining the original prefix', () => {
    const source = sourceText('');
    const data = parse(source);
    data.hooks = { session_start: [{ hooks: [{ command: 'new' }] }] };
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toBe(sourceText('\n' + dedent`
      [hooks]
      session_start = [ { hooks = [ { command = "new" } ] } ]
      ` + '\n'));
  });

  test('quoted dotted keys support insertion and removal without moving their group comment', () => {
    const source = sourceText(nested.replace(
      dedent`
        [hooks]
        before = "keep" # before note
        session_start
      `,
      dedent`"hooks"."session_start"`,
    ));
    const data = parse(source);
    data.hooks.session_start[0].hooks.push({ command: 'new' });
    const inserted = patch(source, data);
    expect(parse(inserted)).toEqual(data);
    expect(inserted).toBe(sourceText(dedent`
      "hooks"."session_start" = [
        # shared group
        { hooks = [
          { command = "first" },
          { command = "middle" },
          { command = "last" },
          { command = "new" },
        ] },
      ]
      after = "keep" # after note
      ` + '\n'));
    data.hooks.session_start[0].hooks.splice(0, 1);
    const removed = patch(inserted, data);
    expect(parse(removed)).toEqual(data);
    expect(removed).toBe(sourceText(dedent`
      "hooks"."session_start" = [
        # shared group
        { hooks = [
          { command = "middle" },
          { command = "last" },
          { command = "new" },
        ] },
      ]
      after = "keep" # after note
      ` + '\n'));
  });
});
