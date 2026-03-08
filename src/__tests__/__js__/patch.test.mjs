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

import { jest } from '@jest/globals';
import { patch, TomlFormat } from "../../../dist/index.js";

describe('patch() Function JavaScript Integration', () => {
  const originalToml = `# Configuration file
title = "Patch Test"

[settings]
debug = true
timeout = 5000

[features]
cache = true
`;

  const baseUpdatedObject = {
    title: "Patch Test",
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

      const formatAsObject = {
        bracketSpacing: true,
        trailingComma: false,
        newLine: "\\n",
        trailingNewline: 1
      };

      const result = patch(originalToml, updatedObject, formatAsObject);

      expect(result).toContain('max_connections = [ "tcp", "udp", "websocket" ]');
      expect(result).toContain('title = "Patch Test"');
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
      expect(result).toContain('title = "Patch Test"');
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
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
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
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('anonymous constructor patterns', () => {
    it('should work with new Object() constructor', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.servers = ["web", "api", "db"];

      const format = new Object({ bracketSpacing: true });

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('title = "Patch Test"');
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

  describe('format auto-detection (JavaScript)', () => {
    it('should preserve tab indentation when existing TOML uses tabs', () => {
      const tabIndentedToml = `title = "Tabs"

[settings]
	debug = true
`;

      const updated = {
        title: 'Tabs',
        settings: {
          debug: true,
          servers: ['web', 'api']
        }
      };

      const result = patch(tabIndentedToml, updated);

      // Existing line keeps tab
      expect(result).toContain('\n\tdebug = true\n');
      // Newly inserted line should also use tabs (auto-detected)
      expect(result).toContain('\n\tservers = [ "web", "api" ]\n');
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
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
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
      } finally {
        warnSpy.mockRestore();
      }
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
      expect(result).toContain('title = "Patch Test"');
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

  describe('JavaScript/TypeScript interoperability edge cases', () => {
    it('should handle null format parameter gracefully', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.null_test = ["value"];

      // Should fall back to auto-detection when format is null
      const result = patch(originalToml, updatedObject, null);

      expect(result).toContain('null_test = [ "value" ]'); // Should use auto-detected format
      expect(result).toContain('# Configuration file');
      expect(result).toContain('[features]');
    });

    it('should handle undefined format parameter gracefully', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.undefined_test = ["value"];

      // Should fall back to auto-detection when format is undefined
      const result = patch(originalToml, updatedObject, undefined);

      expect(result).toContain('undefined_test = [ "value" ]'); // Should use auto-detected format
      expect(result).toContain('# Configuration file');
    });

    it('should ignore unsupported properties in format objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.unsupported_test = ["a", "b"];

      const formatWithUnsupportedProps = {
        bracketSpacing: false,
        unsupportedProperty: "this should be ignored",
        anotherUnsupported: true,
        randomFunction: function() { return "ignored"; },
        someSymbol: Symbol("ignored"),
        nestedObject: { deep: { property: "ignored" } }
      };

      // Capture console.warn calls
      const originalWarn = console.warn;
      let warnMessage = '';
      console.warn = (message) => { warnMessage = message; };

      try {
        const result = patch(originalToml, updatedObject, formatWithUnsupportedProps);
        
        // Should warn about unsupported properties
        expect(warnMessage).toContain('toml-patch: Ignoring unsupported format properties:');
        expect(warnMessage).toContain('unsupportedProperty');
        expect(warnMessage).toContain('anotherUnsupported');
        expect(warnMessage).toContain('randomFunction');
        expect(warnMessage).toContain('Supported properties are: newLine, trailingNewline, trailingComma, bracketSpacing');
        
        // Should still work and use supported properties
        expect(result).toContain('unsupported_test = ["a", "b"]');
      } finally {
        // Restore console.warn
        console.warn = originalWarn;
      }
    });

    it('should handle format objects with getter/setter properties', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.getter_test = ["getter", "setter"];

      const formatWithGetters = {
        get bracketSpacing() { return true; },
        set bracketSpacing(value) { this._bracketSpacing = value; },
        get trailingComma() { return false; }
      };

      const result = patch(originalToml, updatedObject, formatWithGetters);

      expect(result).toContain('getter_test = [ "getter", "setter" ]');
      expect(result).toContain('[features]');
    });

    it('should handle format objects with non-enumerable properties', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.non_enum_test = ["test"];

      const format = {};
      Object.defineProperty(format, 'bracketSpacing', {
        value: true,
        enumerable: false,
        writable: true,
        configurable: true
      });
      Object.defineProperty(format, 'trailingComma', {
        value: false,
        enumerable: true,
        writable: true,
        configurable: true
      });

      const result = patch(originalToml, updatedObject, format);

      // Should work with enumerable properties
      expect(result).toContain('non_enum_test = [ "test" ]'); // Should use auto-detected format since non-enumerable props aren't copied
      expect(result).toContain('[settings]');
    });

    it('should handle primitive values as format parameters', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.primitive_test = ["test"];

      // These should all fall back to auto-detection without throwing
      expect(() => patch(originalToml, updatedObject, "string")).not.toThrow();
      expect(() => patch(originalToml, updatedObject, 123)).not.toThrow();
      expect(() => patch(originalToml, updatedObject, true)).not.toThrow();
      expect(() => patch(originalToml, updatedObject, [])).not.toThrow();
    });

    it('should handle format objects with circular references', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const updatedObject = { ...baseUpdatedObject };
        updatedObject.settings.circular_test = ["circular"];

        const formatWithCircular = { bracketSpacing: false };
        formatWithCircular.self = formatWithCircular; // Create circular reference

        // Should not throw and should handle the circular reference gracefully
        expect(() => {
          const result = patch(originalToml, updatedObject, formatWithCircular);
          expect(result).toContain('circular_test = ["circular"]');
        }).not.toThrow();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should handle format objects from different contexts/realms', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.realm_test = ["realm"];

      // Simulate object from different context using Object.create
      const differentContextFormat = Object.create(null);
      differentContextFormat.bracketSpacing = true;
      differentContextFormat.trailingComma = false;

      const result = patch(originalToml, updatedObject, differentContextFormat);

      expect(result).toContain('realm_test = [ "realm" ]');
      expect(result).toContain('[features]');
    });

    it('should handle format objects with toString/valueOf overrides', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const updatedObject = { ...baseUpdatedObject };
        updatedObject.settings.override_test = ["override"];

        const formatWithOverrides = {
          bracketSpacing: false,
          toString() { return "CustomToString"; },
          valueOf() { return 42; },
          [Symbol.toPrimitive]() { return "primitive"; }
        };

        const result = patch(originalToml, updatedObject, formatWithOverrides);

        expect(result).toContain('override_test = ["override"]');
        expect(result).toContain('[settings]');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should handle Proxy objects as format parameters', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.proxy_test = ["proxy"];

      const targetFormat = { bracketSpacing: true };
      const proxyFormat = new Proxy(targetFormat, {
        get(target, prop) {
          // Log access for testing purposes
          return target[prop];
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        }
      });

      const result = patch(originalToml, updatedObject, proxyFormat);

      expect(result).toContain('proxy_test = [ "proxy" ]');
      expect(result).toContain('[features]');
    });

    it('should handle frozen and sealed format objects', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.settings.frozen_test = ["frozen"];

      const frozenFormat = Object.freeze({ bracketSpacing: false, trailingComma: true });
      const sealedFormat = Object.seal({ bracketSpacing: true, trailingComma: false });

      // Both should work without throwing
      expect(() => {
        const result1 = patch(originalToml, updatedObject, frozenFormat);
        expect(result1).toContain('frozen_test = ["frozen",]');
      }).not.toThrow();

      expect(() => {
        const result2 = patch(originalToml, updatedObject, sealedFormat);
        expect(result2).toContain('frozen_test = [ "frozen" ]');
      }).not.toThrow();
    });

    it('should handle format objects with inherited properties', () => {
      const updatedObject = { ...baseUpdatedObject };
      updatedObject.features.inherited_test = ["inherited"];

      // Create inheritance chain
      const BaseFormat = function() {};
      BaseFormat.prototype.bracketSpacing = true;
      BaseFormat.prototype.baseMethod = function() { return "base"; };

      const ChildFormat = function() {};
      ChildFormat.prototype = Object.create(BaseFormat.prototype);
      ChildFormat.prototype.trailingComma = false;
      ChildFormat.prototype.childMethod = function() { return "child"; };

      const format = new ChildFormat();

      const result = patch(originalToml, updatedObject, format);

      expect(result).toContain('inherited_test = [ "inherited" ]');
      expect(result).toContain('[features]');
    });

    it('should not trigger warnings for valid format objects with supported properties', () => {
      const originalWarn = console.warn;
      let warningCalled = false;
      console.warn = (...args) => {
        warningCalled = true;
        originalWarn(...args);
      };

      try {
        // Test with all supported properties
        const validFormat1 = {
          newLine: '\r\n',
          trailingNewline: true,
          trailingComma: true,
          bracketSpacing: false
        };
        
        patch(originalToml, baseUpdatedObject, validFormat1);
        expect(warningCalled).toBe(false);

        // Test with subset of supported properties
        const validFormat2 = {
          newLine: '\n',
          bracketSpacing: true
        };
        
        patch(originalToml, baseUpdatedObject, validFormat2);
        expect(warningCalled).toBe(false);

        // Test with empty object (should be valid)
        patch(originalToml, baseUpdatedObject, {});
        expect(warningCalled).toBe(false);

        // Test with null/undefined (should not trigger validation)
        patch(originalToml, baseUpdatedObject, null);
        expect(warningCalled).toBe(false);
        
        patch(originalToml, baseUpdatedObject, undefined);
        expect(warningCalled).toBe(false);

      } finally {
        console.warn = originalWarn;
      }
    });

    it('should serve as double-entry bookkeeping for supported format properties', () => {
      // This test documents the currently supported properties
      // If this test fails, it means the supported properties have changed
      // and we need to update JavaScript-consuming code accordingly
      const supportedProperties = new Set([
        'newLine',
        'trailingNewline', 
        'trailingComma',
        'bracketSpacing'
      ]);

      // Test that each documented property is actually supported
      const originalWarn = console.warn;
      let warningCalled = false;
      console.warn = () => { warningCalled = true; };

      try {
        for (const property of supportedProperties) {
          warningCalled = false;
          // Use appropriate values for each property type
          const format = { 
            [property]: property === 'newLine' ? '\n' : true 
          };
          patch(originalToml, baseUpdatedObject, format);
          expect(warningCalled).toBe(false, 
            `Property '${property}' should be supported but triggered a warning`);
        }
      } finally {
        console.warn = originalWarn;
      }

      // Document the expected count for easy maintenance
      expect(supportedProperties.size).toBe(4);
    });

    it('should validate types of format properties and throw errors for invalid types', () => {
      // Test invalid types for each property - these should throw TypeErrors
      const invalidFormats = [
        { newLine: 123 },
        { newLine: true },
        { newLine: null },
        { trailingNewline: 'invalid' },
        { trailingComma: 'invalid' },
        { trailingComma: [] },
        { bracketSpacing: 42 },
        { bracketSpacing: {} }
      ];

      invalidFormats.forEach((format, index) => {
        expect(() => {
          patch(originalToml, baseUpdatedObject, format);
        }).toThrow('Invalid types for format properties');
      });

      // Test multiple invalid types at once
      const multipleInvalids = {
        newLine: null,
        trailingComma: [],
        bracketSpacing: {}
      };
      
      expect(() => {
        patch(originalToml, baseUpdatedObject, multipleInvalids);
      }).toThrow(TypeError);

      // Test that valid types don't throw errors
      expect(() => {
        const validFormat = {
          newLine: '\r\n',
          trailingNewline: true,
          trailingComma: false,
          bracketSpacing: true
        };
        
        const result = patch(originalToml, baseUpdatedObject, validFormat);
        expect(result).toBeTruthy();
      }).not.toThrow();

      // Test that trailingNewline accepts both boolean and number
      expect(() => {
        patch(originalToml, baseUpdatedObject, { trailingNewline: 2 });
      }).not.toThrow();
      
      expect(() => {
        patch(originalToml, baseUpdatedObject, { trailingNewline: false });
      }).not.toThrow();

      // Test that unsupported properties still only warn (don't throw)
      const originalWarn = console.warn;
      let warningCalled = false;
      console.warn = () => { warningCalled = true; };

      try {
        expect(() => {
          patch(originalToml, baseUpdatedObject, { unsupportedProp: 'value' });
        }).not.toThrow();
        expect(warningCalled).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle TomlFormat constructor with all optional parameters', () => {
      // Test parameterless constructor - should work and use defaults
      expect(() => {
        const format = new TomlFormat();
        expect(format.newLine).toBe('\n');
        expect(format.trailingNewline).toBe(1);
        expect(format.trailingComma).toBe(false);
        expect(format.bracketSpacing).toBe(true);

        // Should work in patch function
        const result = patch(originalToml, baseUpdatedObject, format);
        expect(result).toBeTruthy();
      }).not.toThrow();

      // Test partial constructor arguments - should now work with defaults
      expect(() => {
        const format = new TomlFormat('\r\n'); // Only newLine provided
        expect(format.newLine).toBe('\r\n');
        expect(format.trailingNewline).toBe(1); // Default value
        expect(format.trailingComma).toBe(false); // Default value
        expect(format.bracketSpacing).toBe(true); // Default value

        const result = patch(originalToml, baseUpdatedObject, format);
        expect(result).toBeTruthy();
      }).not.toThrow();

      // Test with undefined values - should use defaults
      expect(() => {
        const format = new TomlFormat(undefined, 2); // newLine is undefined
        expect(format.newLine).toBe('\n'); // Default value
        expect(format.trailingNewline).toBe(2);
        expect(format.trailingComma).toBe(false); // Default value
        expect(format.bracketSpacing).toBe(true); // Default value

        const result = patch(originalToml, baseUpdatedObject, format);
        expect(result).toBeTruthy();
      }).not.toThrow();

      // Test with null values - should use defaults
      expect(() => {
        const format = new TomlFormat(null, null); // Both null
        expect(format.newLine).toBe('\n'); // Default value
        expect(format.trailingNewline).toBe(1); // Default value
        expect(format.trailingComma).toBe(false); // Default value
        expect(format.bracketSpacing).toBe(true); // Default value

        const result = patch(originalToml, baseUpdatedObject, format);
        expect(result).toBeTruthy();
      }).not.toThrow();

      // Test full constructor - should work normally
      expect(() => {
        const format = new TomlFormat('\r\n', 2, true, false);
        expect(format.newLine).toBe('\r\n');
        expect(format.trailingNewline).toBe(2);
        expect(format.trailingComma).toBe(true);
        expect(format.bracketSpacing).toBe(false);

        const result = patch(originalToml, baseUpdatedObject, format);
        expect(result).toBeTruthy();
      }).not.toThrow();

      // Test TomlFormat.default() vs new TomlFormat() equivalence
      const defaultFormat = TomlFormat.default();
      const constructorFormat = new TomlFormat();
      
      expect(constructorFormat.newLine).toBe(defaultFormat.newLine);
      expect(constructorFormat.trailingNewline).toBe(defaultFormat.trailingNewline);
      expect(constructorFormat.trailingComma).toBe(defaultFormat.trailingComma);
      expect(constructorFormat.bracketSpacing).toBe(defaultFormat.bracketSpacing);

      // Both should produce identical results
      const result1 = patch(originalToml, baseUpdatedObject, defaultFormat);
      const result2 = patch(originalToml, baseUpdatedObject, constructorFormat);
      expect(result1).toBe(result2);
    });
  });
});