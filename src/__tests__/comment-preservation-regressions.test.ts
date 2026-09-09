import { parse, patch, TomlDocument } from '../index';

const prefix = '# user setting\nmodel = "keep" # model note\ncount = 9223372036854775807\nwhen = 2026-09-09T08:09:10.123456789+02:00\n';
const nested = `[hooks]
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
`;
const scattered = `[[hooks.session_start]] # shared group
matcher = "startup"
[[hooks.session_start.hooks]] # owned
command = "first"
[unrelated]
keep = "yes" # unrelated note
[hooks.session_start.hooks.options]
timeout = 1
[[hooks.session_start.hooks]] # surviving command
command = "other" # other note
`;

describe.each(['\n', '\r\n'])('Comment preservation regressions, EOL %j', (eol) => {
  const sourceText = (body: string) => (prefix + body).replaceAll('\n', eol);
  const edits = [
    { name: 'remove first', apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.splice(0, 1) },
    { name: 'remove middle', apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.splice(1, 1) },
    { name: 'remove last', apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.splice(2, 1) },
    { name: 'append', apply: (data: ReturnType<typeof parse>) => data.hooks.session_start[0].hooks.push({ command: 'new' }) },
    { name: 'repair', apply: (data: ReturnType<typeof parse>) => { data.hooks.session_start[0].hooks[0].command = 'new'; } },
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
        expect(output).toBe(patch(source, data));
        expect(output).toMatch(/# shared group\s*\{ hooks/);
        expect(output).toContain('before = "keep" # before note');
        expect(output).toContain('after = "keep" # after note');
        expect(output.startsWith(prefix.replaceAll('\n', eol))).toBe(true);
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
    expect(output).toMatch(/# shared group\s*\{ hooks/);
    expect(output).toContain('after = "keep" # after note');
  });

  test('removal keeps surviving command comments associated', () => {
    const source = sourceText(nested.replace('    { command = "middle" },', '    # surviving command\n    { command = "middle" }, # middle note'));
    const data = parse(source);
    data.hooks.session_start[0].hooks.splice(0, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toMatch(/# shared group\s*\{ hooks/);
    expect(output).toMatch(/# surviving command\s*\{ command = "middle" \}, # middle note/);
  });

  test.each([false, true])('removing a closing-line command preserves the group tail, other command %s', (withOther) => {
    const previous = withOther ? '    { command = "other" },\n' : '';
    const source = sourceText(`[hooks]\nsession_start = [\n  { hooks = [\n${previous}    { command = "only" }] }, # group tail\n]\n`);
    const data = parse(source);
    data.hooks.session_start[0].hooks.pop();
    const document = new TomlDocument(source);
    document.patch(data);
    const output = patch(source, data);
    expect(document.toTomlString).toBe(output);
    expect(parse(output)).toEqual(data);
    expect(output).toMatch(/\]\s*\}, # group tail/);
  });

  test('nested edits preserve comments on sibling groups and surrounding keys', () => {
    const body = nested.replace('session_start = [\n', 'session_start = [\n  # sibling group\n  { hooks = [{ command = "sibling" }] },\n');
    const source = sourceText(body);
    const data = parse(source);
    data.hooks.session_start[1].hooks.splice(1, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toMatch(/# sibling group\s*\{ hooks = \[\{ command = "sibling" \}\] \}/);
    expect(output).toMatch(/# shared group\s*\{ hooks/);
    expect(output).toContain('before = "keep" # before note');
    expect(output).toContain('after = "keep" # after note');
  });

  test('remove a noncontiguous command subtree without removing an unrelated table', () => {
    const source = sourceText(scattered);
    const data = parse(source);
    data.hooks.session_start[0].hooks.splice(0, 1);
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output).toContain('[[hooks.session_start]] # shared group');
    expect(output).toContain('[[hooks.session_start.hooks]] # surviving command');
    expect(output).toContain('command = "other" # other note');
    expect(output).toContain('keep = "yes" # unrelated note');
  });

  test('create missing hook containers while retaining the original prefix', () => {
    const source = sourceText('');
    const data = parse(source);
    data.hooks = { session_start: [{ hooks: [{ command: 'new' }] }] };
    const output = patch(source, data);
    expect(parse(output)).toEqual(data);
    expect(output.startsWith(source)).toBe(true);
  });

  test('quoted dotted keys support insertion and removal without moving their group comment', () => {
    const source = sourceText(nested.replace('[hooks]\nbefore = "keep" # before note\nsession_start', '"hooks"."session_start"'));
    const data = parse(source);
    data.hooks.session_start[0].hooks.push({ command: 'new' });
    const inserted = patch(source, data);
    expect(inserted).toMatch(/# shared group\s*\{ hooks/);
    data.hooks.session_start[0].hooks.splice(0, 1);
    const removed = patch(inserted, data);
    expect(parse(removed)).toEqual(data);
    expect(removed).toMatch(/# shared group\s*\{ hooks/);
    expect(removed).toContain('after = "keep" # after note');
  });
});
