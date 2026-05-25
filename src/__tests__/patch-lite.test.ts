import dedent from 'dedent';
import { parse } from '../';
import patch from '../patch-toml';
import patchLite, { patchCstLite } from '../patch-toml-lite';
import parseTOML from '../parse-toml';
import { TomlFormat } from '../toml-format';

test('patchLite should match patch output when existing JS matches existing TOML', () => {
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

  expect(patchLite(existing, existingJs, updated)).toEqual(patch(existing, updated));
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

  const result = patchCstLite(existingCst, existingJs, updated, TomlFormat.default());
  expect(result.tomlString).toContain('port = 9090');
});
