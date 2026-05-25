import dedent from 'dedent';
import { parse } from '../';
import patchLite, { patchCstLite } from '../patch-toml-lite';
import parseTOML from '../parse-toml';

test('patchLite should apply changes with default formatting', () => {
  const existing = dedent`
    title = "TOML example"
    owner.name = "Bob"
    [database]
    enabled = true
  `;

  const existingJs = parse(existing);
  const updated = parse(existing);
  updated.owner.name = 'Tim';
  updated.database.enabled = false;

  const patched = patchLite(existing, existingJs, updated);
  expect(parse(patched)).toEqual(updated);
  expect(patched.endsWith('\n')).toBe(true);
});

test('patchCstLite should patch using caller-provided existing JS', () => {
  const existing = dedent`
    [server]
    host = "localhost"
    port = 8080
  `;

  const existingCst = Array.from(parseTOML(existing));
  const existingJs = parse(existing);
  const updated = parse(existing);
  updated.server.port = 9090;

  const result = patchCstLite(existingCst, existingJs, updated);
  expect(result.tomlString).toContain('port = 9090');
});
