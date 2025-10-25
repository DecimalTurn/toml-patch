import { TomlDocument } from '../toml-document';

describe('TomlDocument', () => {
  const simpleToml = '[section]\nkey = "value"\n';
  const simpleObj = { section: { key: 'value' } };

  it('parses TOML string to JS object', () => {
    const doc = new TomlDocument(simpleToml);
    expect(doc.JsObject).toEqual(simpleObj);
  });

  it('returns the original TOML string', () => {
    const doc = new TomlDocument(simpleToml);
    expect(doc.originalToml).toBe(simpleToml);
  });

  it('preserves newline and trailing newlines', () => {
    const toml = '[a]\nb = 1\n\n';
    const doc = new TomlDocument(toml);
    // Patch with a new object, should keep trailing newline count
    const patched = doc.patch({ a: { b: 2 } });
    expect(patched.endsWith('\n\n')).toBe(true);
  });

  it('patches TOML with new JS object', () => {
    const doc = new TomlDocument(simpleToml);
    const newObj = { section: { key: 'changed', newKey: 42 } };
    const patched = doc.patch(newObj);
    const newDoc = new TomlDocument(patched);
  expect(newDoc.JsObject).toEqual(newObj);
  });

  it('handles CRLF newlines', () => {
    const crlfToml = '[x]\r\ny = 1\r\n';
    const doc = new TomlDocument(crlfToml);
    const patched = doc.patch({ x: { y: 2 } });
    expect(patched.includes('\r\n')).toBe(true);
  });
});
