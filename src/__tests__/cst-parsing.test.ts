/**
 * Tests for comparing CST structures when parsing from JS objects vs TOML files.
 * This test explores the different ways the CST is built in both scenarios.
 */

import parseJS from '../parse-js';
import toTOML from '../to-toml';
import parseTOML from '../parse-toml';
import { TomlFormat } from '../toml-format';
import { readFileSync } from 'fs';
import path from 'path';

describe('CST parsing comparison', () => {
  const fmt = new TomlFormat();

  describe('JS object to CST', () => {
    it('should parse nested objects with inline table formatting by default', () => {
      const jsObject = {
        top: {
          name: "example",
          nested: {
            key: "value"
          }
        }
      };

      const cst = parseJS(jsObject);
      const str = toTOML(cst.items, fmt);

      // The default formatting for nested tables should be inline
      expect(str).toMatchSnapshot('js-object-to-toml');
      expect(cst).toMatchSnapshot('js-object-cst');
      
      // Verify that nested tables are formatted as inline by default
      expect(str).toContain('nested = { key = "value" }');
      expect(str).toContain('[top]');
      expect(str).toContain('name = "example"');
    });
  });

  describe('TOML file to CST', () => {
    it('should parse nested tables preserving separate section formatting', () => {
      const tomlInput = readFileSync(
        path.join(__dirname, '../__fixtures__/nested-tables.toml'),
        'utf-8'
      );
      
      const cstGenerator = parseTOML(tomlInput);
      const blocks = Array.from(cstGenerator);
      const cstFromToml = {
        type: 'Document',
        items: blocks,
        loc: blocks.length > 0 ? {
          start: blocks[0].loc.start,
          end: blocks[blocks.length - 1].loc.end
        } : { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
      };
      
      const strFromToml = toTOML(blocks, fmt);

      // Should preserve the separate section formatting when parsed from TOML
      expect(strFromToml).toMatchSnapshot('toml-file-to-toml');
      expect(cstFromToml).toMatchSnapshot('toml-file-cst');
      
      // Verify that nested tables maintain separate sections
      expect(strFromToml).toContain('[top]');
      expect(strFromToml).toContain('[top.nested]');
      expect(strFromToml).toContain('name = "example"');
      expect(strFromToml).toContain('key = "value"');
      
      // Should have proper spacing between sections
      const lines = strFromToml.split('\n');
      const topIndex = lines.findIndex(line => line === '[top]');
      const nestedIndex = lines.findIndex(line => line === '[top.nested]');
      expect(nestedIndex - topIndex).toBeGreaterThan(2); // Should have content and blank line between
    });
  });

  describe('formatting differences', () => {
    it('should demonstrate the key difference between JS and TOML parsing', () => {
      // JS object parsing creates inline tables by default
      const jsObject = {
        top: {
          name: "example",
          nested: { key: "value" }
        }
      };
      const jsCst = parseJS(jsObject);
      const jsToml = toTOML(jsCst.items, fmt);
      
      // TOML file parsing preserves separate sections
      const tomlInput = readFileSync(
        path.join(__dirname, '../__fixtures__/nested-tables.toml'),
        'utf-8'
      );
      const tomlBlocks = Array.from(parseTOML(tomlInput));
      const tomlOutput = toTOML(tomlBlocks, fmt);
      
      // They should produce different output formats
      expect(jsToml).not.toBe(tomlOutput);
      expect(jsToml).toContain('{ key = "value" }'); // inline
      expect(tomlOutput).toContain('[top.nested]');   // separate section
    });
  });
});