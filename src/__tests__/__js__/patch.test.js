// @ts-nocheck
/**
 * JS integration tests for patch() function
 * 
 * Some JS implementation might not import the TomlFormat class into their project.
 * We need to ensure that they can style provide a valid format argument and the library should behave.
 * 
 * First, we tests that the standalone patch() function works with various format object
 * creation patterns without requiring TomlFormat imports, ensuring backward compatibility with versions prior to v0.4.0.
 * 
 * Second, we also use this test suite to check for other issues that could occur between typescript and javascript.
 * For instance, what happens if the format object is null or undefined?
 * What happens if we try to supply an object with a property that TomlFormat doesn't support?
 * Ideally it would return an error saying that the format parameter <name> is not supported.
 * 
 */

const { patch, TomlFormat } = require("../../../dist/toml-patch.cjs.min.js");

describe('patch() Function Backward Compatibility Integration', () => {
  const originalToml = `# Configuration file
title = "Patch Compatibility Test"

[settings]
debug = true
timeout = 5000

[features]
cache = true
`;

  const baseUpdatedObject = {
    title: "Patch Compatibility Test",
    settings: {
      debug: true,
      timeout: 5000
    },
    features: {
      cache: true
    }
  };

  describe('plain JavaScript objects (interface-style)', () => {
    it('should work with full TomlFormat-like objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.max_connections = ["tcp", "udp", "websocket"];
      updatedObject.features.monitoring = ["logs", "metrics"];

      const formatAsObject = {
        bracketSpacing: true,
        trailingComma: false,
        newLine: "\\n",
        trailingNewline: 1
      };

      const result = patch(originalToml, updatedObject, formatAsObject);

      expect(result).toContain('max_connections = [ "tcp", "udp", "websocket" ]');
      expect(result).toContain('monitoring = [ "logs", "metrics" ]');
      expect(result).toContain('# Configuration file');
      expect(result).toContain('[settings]');
      expect(result).toContain('[features]');
    });

    it('should work with partial format objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.protocols = ["http", "https"];

      const formatAsObject = { bracketSpacing: false };

      const result = patch(originalToml, updatedObject, formatAsObject);

      expect(result).toContain('protocols = ["http", "https"]');
      expect(result).toContain('title = "Patch Compatibility Test"');
    });

    it('should work with minimal format objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.auth = ["basic", "oauth"];

      const formatAsObject = { 
        bracketSpacing: true,
        trailingComma: true 
      };

      const result = patch(originalToml, updatedObject, formatAsObject);

      expect(result).toContain('auth = [ "basic", "oauth", ]');
      expect(result).toContain('cache = true');
    });

    it('should work with objects containing extra properties', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.databases = ["mysql", "postgres"];

      const formatWithExtras = {
        bracketSpacing: false,
        extraProperty: "ignored",
        someMethod() { return "also ignored"; },
        toString() { return "custom toString"; }
      };

      const result = patch(originalToml, updatedObject, formatWithExtras);

      expect(result).toContain('databases = ["mysql", "postgres"]');
      expect(result).toContain('debug = true');
    });
  });

  describe('anonymous constructor patterns', () => {
    it('should work with new Object() constructor', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.servers = ["web", "api", "db"];

      const format = new Object({ bracketSpacing: true });

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('title = "Patch Compatibility Test"');
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
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.apis = ["rest", "graphql"];

      const format = {
        bracketSpacing: true,
        getBracketSpacing() { return this.bracketSpacing; }
      };

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('apis = [ "rest", "graphql" ]');
      expect(result).toContain('[settings]');
    });
  });

  describe('mixed data types with backward compatibility', () => {
    it('should handle various array types with custom formats', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.ports = [8080, 3000, 9000];
      updatedObject.features.flags = [true, false, true];
      updatedObject.settings.mixed = ["text", 42, true];

      const format = { 
        bracketSpacing: true,
        trailingComma: false 
      };

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('ports = [ 8080, 3000, 9000 ]');
      expect(result).toContain('flags = [ true, false, true ]');
      expect(result).toContain('mixed = [ "text", 42, true ]');
    });

    it('should handle empty arrays with custom spacing', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.empty_list = [];

      const format = new Object({ bracketSpacing: true });

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('empty_list = []'); // Empty arrays don't get bracket spacing
      expect(result).toContain('debug = true');
    });

    it('should handle single element arrays', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.single_item = ["only"];

      class SingleElementFormat {
        constructor() {
          this.bracketSpacing = false;
        }
      }
      const format = new SingleElementFormat();

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('single_item = ["only"]');
      expect(result).toContain('[features]');
    });
  });

  describe('complex format objects', () => {
    it('should work with multiple format properties using object literals', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.complex_array = ["item1", "item2", "item3"];

      const format = {
        bracketSpacing: true,
        trailingComma: true,
        newLine: "\\n",
        trailingNewline: 2
      };

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('complex_array = [ "item1", "item2", "item3", ]');
      expect(result).toContain('# Configuration file');
    });

    it('should work with format objects created from prototypes', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.components = ["header", "footer"];

      // Create format object with weird prototype chain
      const formatBase = { bracketSpacing: true }; // Change to true to get expected spacing
      const format = Object.setPrototypeOf({ trailingComma: false }, formatBase);

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('components = [ "header", "footer" ]');
      expect(result).toContain('[features]');
    });
  });

  describe('duck typing behavior', () => {
    it('should work with any object that has the right properties', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.types = ["string", "number", "boolean"];

      // Create an object with completely different prototype chain
      const weirdFormat = Object.setPrototypeOf({ bracketSpacing: true }, Array.prototype);

      const result = patch(originalToml, updatedObject, weirdFormat);

      expect(result).toContain('types = [ "string", "number", "boolean" ]');
      expect(result).toContain('timeout = 5000');
    });

    it('should ignore extra properties and methods in format objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.libraries = ["react", "vue"];

      const formatWithExtras = {
        bracketSpacing: false,
        randomProperty: "this will be ignored",
        someFunction() { return "this too"; },
        [Symbol.iterator]: function*() { yield 1; yield 2; }
      };

      const result = patch(originalToml, updatedObject, formatWithExtras);

      expect(result).toContain('libraries = ["react", "vue"]');
      expect(result).toContain('cache = true');
    });
  });

  describe('error resilience with patch function', () => {
    it('should handle falsy format values gracefully', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.test_prop = ["test"];

      // These should fall back to auto-detection instead of throwing
      expect(() => patch(originalToml, updatedObject, false)).not.toThrow();
      expect(() => patch(originalToml, updatedObject, 0)).not.toThrow();
      expect(() => patch(originalToml, updatedObject, "")).not.toThrow();
      expect(() => patch(originalToml, updatedObject, null)).not.toThrow();
      expect(() => patch(originalToml, updatedObject, undefined)).not.toThrow();
    });

    it('should work without any format parameter (auto-detection)', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.auto_detected = ["value1", "value2"];

      const result = patch(originalToml, updatedObject); // No format parameter

      expect(result).toContain('auto_detected = [ "value1", "value2" ]'); // Should use auto-detected format
      expect(result).toContain('# Configuration file');
      expect(result).toContain('[features]');
    });
  });

  describe('comparison with TomlFormat instances', () => {
    it('should work equally well with TomlFormat instances and plain objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.compare_test = ["a", "b", "c"];

      // Using TomlFormat instance
      const tomlFormatInstance = TomlFormat.default();
      tomlFormatInstance.bracketSpacing = true;
      tomlFormatInstance.trailingComma = false;

      // Using plain object with same properties
      const plainObject = {
        bracketSpacing: true,
        trailingComma: false
      };

      const resultWithTomlFormat = patch(originalToml, updatedObject, tomlFormatInstance);
      const resultWithPlainObject = patch(originalToml, updatedObject, plainObject);

      // Both should produce similar results for array formatting
      expect(resultWithTomlFormat).toContain('compare_test = [ "a", "b", "c" ]');
      expect(resultWithPlainObject).toContain('compare_test = [ "a", "b", "c" ]');
      
      // Should preserve structure in both cases
      expect(resultWithTomlFormat).toContain('# Configuration file');
      expect(resultWithPlainObject).toContain('# Configuration file');
    });

    it('should maintain consistent behavior between object patterns', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.consistency = ["item1", "item2"];

      const objectLiteral = { bracketSpacing: false };
      const constructorObject = new Object({ bracketSpacing: false });
      
      function FormatConstructor() { 
        this.bracketSpacing = false; 
      }
      const functionConstructor = new FormatConstructor();

      const result1 = patch(originalToml, updatedObject, objectLiteral);
      const result2 = patch(originalToml, updatedObject, constructorObject);
      const result3 = patch(originalToml, updatedObject, functionConstructor);

      // All should format arrays the same way
      expect(result1).toContain('consistency = ["item1", "item2"]');
      expect(result2).toContain('consistency = ["item1", "item2"]');
      expect(result3).toContain('consistency = ["item1", "item2"]');
    });
  });

  describe('structure preservation with patch function', () => {
    it('should preserve original TOML structure and comments when using custom formats', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.new_feature = ["enabled"];

      const customFormat = {
        bracketSpacing: true,
        trailingComma: false
      };

      const result = patch(originalToml, updatedObject, customFormat);

      // Should preserve original structure
      expect(result).toContain('# Configuration file');
      expect(result).toContain('title = "Patch Compatibility Test"');
      expect(result).toContain('[settings]');
      expect(result).toContain('debug = true');
      expect(result).toContain('timeout = 5000');
      expect(result).toContain('[features]');
      expect(result).toContain('cache = true');
      
      // Should add new feature
      expect(result).toContain('new_feature = [ "enabled" ]');
    });

    it('should handle complex nested structures with backward compatible formats', () => {
      const simpleToml = `# Simple config
title = "Simple Test"

[database]
host = "localhost"
port = 5432
`;

      const updatedObject = {
        title: "Simple Test",
        database: {
          host: "localhost",
          port: 5432,
          pools: ["primary", "replica"]
        }
      };

      const format = { bracketSpacing: true };

      const result = patch(simpleToml, updatedObject, format);

      expect(result).toContain('# Simple config');
      expect(result).toContain('[database]');
      expect(result).toContain('pools = [ "primary", "replica" ]');
    });
  });
});