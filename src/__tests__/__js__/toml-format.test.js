// @ts-nocheck
/**
 * JavaScript integration tests for TomlFormat class
 * 
 * Tests the TomlFormat constructor and related functionality when used from JavaScript,
 * ensuring proper backward compatibility and constructor behavior.
 */

const { TomlFormat, patch } = require("../../../dist/toml-patch.cjs.min.js");

describe('TomlFormat JavaScript Integration', () => {
  const originalToml = `# Configuration file
title = "Format Test"

[settings]
debug = true
timeout = 5000

[features]
cache = true
`;

  const baseUpdatedObject = {
    title: "Format Test",
    settings: {
      debug: true,
      timeout: 5000
    },
    features: {
      cache: true
    }
  };

  describe('TomlFormat constructor compatibility', () => {
    it('should work with all optional parameters', () => {
      // All these should work without throwing
      expect(() => new TomlFormat()).not.toThrow();
      expect(() => new TomlFormat('\r\n')).not.toThrow();
      expect(() => new TomlFormat(null, 2, true)).not.toThrow();
      expect(() => new TomlFormat('\r\n', 2, false, true)).not.toThrow();

      const format = new TomlFormat();
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(1);
      expect(format.trailingComma).toBe(false);
      expect(format.bracketSpacing).toBe(true);
    });

    it('should use defaults for null/undefined constructor arguments', () => {
      const format1 = new TomlFormat(null, undefined, null, undefined);
      expect(format1.newLine).toBe('\n');
      expect(format1.trailingNewline).toBe(1);
      expect(format1.trailingComma).toBe(false);
      expect(format1.bracketSpacing).toBe(true);
    });

    it('should work with TomlFormat.default()', () => {
      const defaultFormat = TomlFormat.default();
      expect(defaultFormat.newLine).toBe('\n');
      expect(defaultFormat.trailingNewline).toBe(1);
      expect(defaultFormat.trailingComma).toBe(false);
      expect(defaultFormat.bracketSpacing).toBe(true);
    });

    it('should work with custom values', () => {
      const customFormat = new TomlFormat('\r\n', 2, true, false);
      expect(customFormat.newLine).toBe('\r\n');
      expect(customFormat.trailingNewline).toBe(2);
      expect(customFormat.trailingComma).toBe(true);
      expect(customFormat.bracketSpacing).toBe(false);
    });
  });

  describe('TomlFormat with patch function', () => {
    it('should work as format parameter in patch function', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.servers = ["web", "api"];

      const format = new TomlFormat('\n', 1, false, true);
      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('servers = [ "web", "api" ]');
      expect(result).toContain('debug = true');
    });

    it('should produce same results as equivalent plain objects', () => {
      const updatedObject1 = { ...baseUpdatedObject };
      const updatedObject2 = { ...baseUpdatedObject };
      
      updatedObject1.features.tools = ["webpack", "babel"];
      updatedObject2.features.tools = ["webpack", "babel"];

      const tomlFormatInstance = new TomlFormat('\n', 1, false, true);
      const plainObject = {
        newLine: '\n',
        trailingNewline: 1,
        trailingComma: false,
        bracketSpacing: true
      };

      const result1 = patch(originalToml, updatedObject1, tomlFormatInstance);
      const result2 = patch(originalToml, updatedObject2, plainObject);

      expect(result1).toEqual(result2);
    });
  });

  describe('object creation patterns', () => {
    it('should work with new Object() constructor', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.servers = ["web", "api"];

      const format = new Object({ bracketSpacing: true });

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('servers = [ "web", "api" ]');
    });

    it('should work with Object.create patterns', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.modules = ["core", "plugins"];

      const format = Object.create(null, {
        bracketSpacing: { value: false, enumerable: true, writable: true }
      });

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('modules = ["core", "plugins"]');
      expect(result).toContain('cache = true');
    });

    it('should work with function constructors', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.environments = ["dev", "staging", "prod"];

      function FormatLike(bracketSpacing) {
        this.bracketSpacing = bracketSpacing;
      }
      const format = new FormatLike(true);

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('environments = [ "dev", "staging", "prod" ]');
      expect(result).toContain('timeout = 5000');
    });

    it('should work with custom class instances', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.tools = ["webpack", "babel"];

      class CustomFormat {
        constructor(bracketSpacing) {
          this.bracketSpacing = bracketSpacing;
        }
      }
      const format = new CustomFormat(false);

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('tools = ["webpack", "babel"]');
      expect(result).toContain('[features]');
    });

    it('should work with objects containing methods', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const updatedObject = { ...baseUpdatedObject };
        updatedObject.settings.apis = ["rest", "graphql"];

        const format = {
          bracketSpacing: true,
          getBracketSpacing() { return this.bracketSpacing; }
        };

        const result = patch(originalToml, updatedObject, format);

        expect(result).toContain('apis = [ "rest", "graphql" ]');
        expect(result).toContain('[settings]');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});