/**
 * Integration tests for TomlDocument with various object creation patterns
 * 
 * Tests that TomlDocument.patch() works with different object creation patterns
 * and format object styles, demonstrating flexibility in format parameter handling.
 */

const { TomlDocument } = require("../../../dist/toml-patch.cjs.min.js");

describe('TomlDocument Object Creation Patterns Integration', () => {
  const originalToml = `# Test file
title = "Anonymous Constructor Test"

[config]
enabled = true
timeout = 1000
`;

  const expectedJsObject = {
    title: "Anonymous Constructor Test",
    config: {
      enabled: true,
      timeout: 1000
    }
  };

  describe('basic parsing', () => {
    it('should parse TOML correctly without TomlFormat import', () => {
      const doc = new TomlDocument(originalToml);
      expect(doc.toJsObject).toEqual(expectedJsObject);
      expect(doc.toTomlString).toBe(originalToml);
    });
  });

  describe('anonymous constructor patterns', () => {
    it('should work with new Object() constructor', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.servers = ["web", "api", "db"];

      const format = new Object({ bracketSpacing: true });

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('title = "Anonymous Constructor Test"');
      expect(result).toContain('[config]');
      expect(result).toContain('enabled = true');
      expect(result).toContain('timeout = 1000');
      
      expect(doc.toJsObject.config.servers).toEqual(["web", "api", "db"]);
    });

    it('should work with Object.create patterns', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.databases = ["mysql", "postgres"];

      const format = Object.create(null, {
        bracketSpacing: { value: false, enumerable: true, writable: true }
      });

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('databases = ["mysql", "postgres"]');
      expect(result).toContain('# Test file');
      expect(doc.toJsObject.config.databases).toEqual(["mysql", "postgres"]);
    });

    it('should work with function constructors', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.protocols = ["http", "https"];

      function FormatLike(bracketSpacing) {
        this.bracketSpacing = bracketSpacing;
      }
      const format = new FormatLike(true);

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('protocols = [ "http", "https" ]');
      expect(doc.toJsObject.config.protocols).toEqual(["http", "https"]);
    });

    it('should work with custom class instances', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.environments = ["dev", "prod"];

      class CustomFormat {
        constructor(bracketSpacing) {
          this.bracketSpacing = bracketSpacing;
        }
      }
      const format = new CustomFormat(false);

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('environments = ["dev", "prod"]');
      expect(doc.toJsObject.config.environments).toEqual(["dev", "prod"]);
    });

    it('should work with objects containing methods', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.features = ["auth", "logging"];

      const format = {
        bracketSpacing: true,
        getBracketSpacing() { return this.bracketSpacing; }
      };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('features = [ "auth", "logging" ]');
      expect(doc.toJsObject.config.features).toEqual(["auth", "logging"]);
    });
  });

  describe('complex format objects', () => {
    it('should work with multiple format properties', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.modules = ["core", "plugins"];

      const format = {
        bracketSpacing: true,
        trailingComma: true,
        newLine: "\\n",
        trailingNewline: 2
      };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('modules = [ "core", "plugins", ]');
      expect(doc.toJsObject.config.modules).toEqual(["core", "plugins"]);
    });

    it('should work with minimal format objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.tools = ["webpack", "babel"];

      const format = { bracketSpacing: false };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('tools = ["webpack", "babel"]');
      expect(doc.toJsObject.config.tools).toEqual(["webpack", "babel"]);
    });
  });

  describe('duck typing behavior', () => {
    it('should work with any object that has the right properties', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.items = ["a", "b", "c"];

      // Create an object with completely different prototype chain
      const weirdFormat = Object.setPrototypeOf({ bracketSpacing: true }, Array.prototype);

      doc.patch(jsObject, weirdFormat);
      const result = doc.toTomlString;

      expect(result).toContain('items = [ "a", "b", "c" ]');
      expect(doc.toJsObject.config.items).toEqual(["a", "b", "c"]);
    });

    it('should ignore extra properties and methods', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.values = [1, 2, 3];

      const formatWithExtras = {
        bracketSpacing: false,
        extraProperty: "ignored",
        someMethod() { return "also ignored"; },
        toString() { return "custom toString"; }
      };

      doc.patch(jsObject, formatWithExtras);
      const result = doc.toTomlString;

      expect(result).toContain('values = [1, 2, 3]');
      expect(doc.toJsObject.config.values).toEqual([1, 2, 3]);
    });
  });

  describe('various data types with anonymous constructors', () => {
    it('should handle mixed data types correctly', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      
      jsObject.config.strings = ["one", "two"];
      jsObject.config.numbers = [1, 2, 3];
      jsObject.config.booleans = [true, false];
      jsObject.config.mixed = ["text", 42, true];

      const format = new Object({ bracketSpacing: true });

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('strings = [ "one", "two" ]');
      expect(result).toContain('numbers = [ 1, 2, 3 ]');
      expect(result).toContain('booleans = [ true, false ]');
      expect(result).toContain('mixed = [ "text", 42, true ]');
      
      expect(doc.toJsObject.config.strings).toEqual(["one", "two"]);
      expect(doc.toJsObject.config.numbers).toEqual([1, 2, 3]);
      expect(doc.toJsObject.config.booleans).toEqual([true, false]);
      expect(doc.toJsObject.config.mixed).toEqual(["text", 42, true]);
    });

    it('should handle empty arrays', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.empty_array = [];

      function EmptyArrayFormat() {
        this.bracketSpacing = true;
      }
      const format = new EmptyArrayFormat();

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('empty_array = []');
      expect(doc.toJsObject.config.empty_array).toEqual([]);
    });

    it('should handle single element arrays', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.single = ["only"];

      class SingleElementFormat {
        constructor() {
          this.bracketSpacing = false;
        }
      }
      const format = new SingleElementFormat();

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('single = ["only"]');
      expect(doc.toJsObject.config.single).toEqual(["only"]);
    });
  });

  describe('structure preservation', () => {
    it('should preserve original TOML structure and comments', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.new_setting = ["value1", "value2"];

      const format = { bracketSpacing: true };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      // Should preserve original structure
      expect(result).toContain('# Test file');
      expect(result).toContain('title = "Anonymous Constructor Test"');
      expect(result).toContain('[config]');
      expect(result).toContain('enabled = true');
      expect(result).toContain('timeout = 1000');
      
      // Should add new setting
      expect(result).toContain('new_setting = [ "value1", "value2" ]');
      
      expect(doc.toJsObject.config.new_setting).toEqual(["value1", "value2"]);
    });
  });

  describe('error resilience', () => {
    it('should not throw on falsy but non-null format objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.config.test_array = ["test"];

      // These should use auto-detected format instead of throwing
      expect(() => doc.patch(jsObject, false)).not.toThrow();
      expect(() => doc.patch(jsObject, 0)).not.toThrow();
      expect(() => doc.patch(jsObject, "")).not.toThrow();
    });
  });
});