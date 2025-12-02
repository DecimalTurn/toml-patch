// @ts-nocheck
/**
 * JS integration tests for stringify() function
 * 
 * Similar to patch() function, stringify() accepts an optional TomlFormat parameter
 * that JavaScript users might provide in various forms without proper type safety.
 * We need to ensure that the function handles various format object patterns gracefully.
 * 
 * This test suite verifies that stringify() works with:
 * - Various format object creation patterns without requiring TomlFormat imports
 * - Partial format objects with missing properties
 * - Invalid format objects with unsupported properties
 * - Null, undefined, and falsy format parameters
 * - JavaScript-specific object behaviors (duck typing, prototypes, etc.)
 */

const { stringify, TomlFormat } = require("../../../dist/toml-patch.cjs.min.js");

describe('stringify() Function JavaScript Integration', () => {
  const testObject = {
    title: "Test App",
    settings: {
      debug: true,
      timeout: 5000,
      servers: ["web", "api", "db"],
      ports: [8080, 3000, 9000]
    },
    features: {
      cache: true,
      auth: ["basic", "oauth"],
      flags: [true, false, true]
    }
  };

  describe('basic stringify functionality', () => {
    it('should work without format parameter (defaults)', () => {
      const result = stringify(testObject);
      
      expect(result).toContain('title = "Test App"');
      expect(result).toContain('[settings]');
      expect(result).toContain('debug = true');
      expect(result).toContain('servers = [ "web", "api", "db" ]'); // Default bracket spacing
      expect(result).toContain('[features]');
      expect(result).toContain('cache = true');
    });

    it('should work with TomlFormat instances', () => {
      const format = new TomlFormat('\\r\\n', 2, true, false);
      const result = stringify(testObject, format);
      
      expect(result).toContain('title = "Test App"');
      expect(result).toContain('servers = ["web", "api", "db",]'); // No bracket spacing, with trailing comma
      expect(result).toContain('auth = ["basic", "oauth",]');
    });
  });

  describe('plain JavaScript objects (interface-style)', () => {
    it('should work with full TomlFormat-like objects', () => {
      const format = {
        newLine: '\\n',
        trailingNewline: 1,
        trailingComma: false,
        bracketSpacing: true
      };

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('ports = [ 8080, 3000, 9000 ]');
      expect(result).toContain('auth = [ "basic", "oauth" ]');
    });

    it('should work with partial format objects', () => {
      const format = { bracketSpacing: false };

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = ["web", "api", "db"]');
      expect(result).toContain('auth = ["basic", "oauth"]');
    });

    it('should work with minimal format objects', () => {
      const format = { 
        bracketSpacing: true,
        trailingComma: true 
      };

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = [ "web", "api", "db", ]');
      expect(result).toContain('auth = [ "basic", "oauth", ]');
    });

    it('should work with objects containing extra properties', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const format = {
          bracketSpacing: false,
          extraProperty: "ignored",
          someMethod() { return "also ignored"; },
          toString() { return "custom toString"; }
        };

        const result = stringify(testObject, format);
        
        expect(result).toContain('servers = ["web", "api", "db"]');
        expect(result).toContain('debug = true');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('anonymous constructor patterns', () => {
    it('should work with new Object() constructor', () => {
      const format = new Object({ bracketSpacing: true });

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('title = "Test App"');
    });

    it('should work with Object.create patterns', () => {
      const format = Object.create(null, {
        bracketSpacing: { value: false, enumerable: true, writable: true }
      });

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = ["web", "api", "db"]');
      expect(result).toContain('cache = true');
    });

    it('should work with function constructors', () => {
      function FormatLike(bracketSpacing) {
        this.bracketSpacing = bracketSpacing;
      }
      const format = new FormatLike(true);

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('timeout = 5000');
    });

    it('should work with custom class instances', () => {
      class CustomFormat {
        constructor(bracketSpacing) {
          this.bracketSpacing = bracketSpacing;
        }
      }
      const format = new CustomFormat(false);

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = ["web", "api", "db"]');
      expect(result).toContain('[features]');
    });

    it('should work with objects containing methods', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const format = {
          bracketSpacing: true,
          getBracketSpacing() { return this.bracketSpacing; }
        };

        const result = stringify(testObject, format);
        
        expect(result).toContain('auth = [ "basic", "oauth" ]');
        expect(result).toContain('[settings]');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('mixed data types with stringify', () => {
    it('should handle various array types with custom formats', () => {
      const mixedObject = {
        strings: ["one", "two", "three"],
        numbers: [1, 2, 3],
        booleans: [true, false, true],
        mixed: ["text", 42, true],
        empty: []
      };

      const format = { 
        bracketSpacing: true,
        trailingComma: false 
      };

      const result = stringify(mixedObject, format);
      
      expect(result).toContain('strings = [ "one", "two", "three" ]');
      expect(result).toContain('numbers = [ 1, 2, 3 ]');
      expect(result).toContain('booleans = [ true, false, true ]');
      expect(result).toContain('mixed = [ "text", 42, true ]');
      expect(result).toContain('empty = []');
    });

    it('should handle single element arrays', () => {
      const singleObject = {
        single_string: ["only"],
        single_number: [42],
        single_bool: [true]
      };

      class SingleElementFormat {
        constructor() {
          this.bracketSpacing = false;
        }
      }
      const format = new SingleElementFormat();

      const result = stringify(singleObject, format);
      
      expect(result).toContain('single_string = ["only"]');
      expect(result).toContain('single_number = [42]');
      expect(result).toContain('single_bool = [true]');
    });
  });

  describe('complex format objects', () => {
    it('should work with multiple format properties using object literals', () => {
      const format = {
        bracketSpacing: true,
        trailingComma: true,
        newLine: "\\n",
        trailingNewline: 2
      };

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = [ "web", "api", "db", ]');
      expect(result).toContain('auth = [ "basic", "oauth", ]');
      expect(result.endsWith('\\n\\n')).toBe(true);
    });

    it('should work with format objects created from prototypes', () => {
      const formatBase = { bracketSpacing: true };
      const format = Object.setPrototypeOf({ trailingComma: false }, formatBase);

      const result = stringify(testObject, format);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('[features]');
    });
  });

  describe('duck typing behavior', () => {
    it('should work with any object that has the right properties', () => {
      // Create an object with completely different prototype chain
      const weirdFormat = Object.setPrototypeOf({ bracketSpacing: true }, Array.prototype);

      const result = stringify(testObject, weirdFormat);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('timeout = 5000');
    });

    it('should ignore extra properties and methods in format objects', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const formatWithExtras = {
          bracketSpacing: false,
          randomProperty: "this will be ignored",
          someFunction() { return "this too"; },
          [Symbol.iterator]: function*() { yield 1; yield 2; }
        };

        const result = stringify(testObject, formatWithExtras);
        
        expect(result).toContain('servers = ["web", "api", "db"]');
        expect(result).toContain('cache = true');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('error resilience with stringify function', () => {
    it('should handle falsy format values gracefully', () => {
      // These should fall back to defaults instead of throwing
      expect(() => stringify(testObject, false)).not.toThrow();
      expect(() => stringify(testObject, 0)).not.toThrow();
      expect(() => stringify(testObject, "")).not.toThrow();
      expect(() => stringify(testObject, null)).not.toThrow();
      expect(() => stringify(testObject, undefined)).not.toThrow();
    });

    it('should work without any format parameter (auto-defaults)', () => {
      const result = stringify(testObject); // No format parameter

      expect(result).toContain('servers = [ "web", "api", "db" ]'); // Should use defaults
      expect(result).toContain('title = "Test App"');
      expect(result).toContain('[features]');
    });
  });

  describe('comparison with TomlFormat instances', () => {
    it('should work equally well with TomlFormat instances and plain objects', () => {
      // Using TomlFormat instance
      const tomlFormatInstance = TomlFormat.default();
      tomlFormatInstance.bracketSpacing = true;
      tomlFormatInstance.trailingComma = false;

      // Using plain object with same properties
      const plainObject = {
        bracketSpacing: true,
        trailingComma: false
      };

      const resultWithTomlFormat = stringify(testObject, tomlFormatInstance);
      const resultWithPlainObject = stringify(testObject, plainObject);

      // Both should produce similar results for array formatting
      expect(resultWithTomlFormat).toContain('servers = [ "web", "api", "db" ]');
      expect(resultWithPlainObject).toContain('servers = [ "web", "api", "db" ]');
    });

    it('should maintain consistent behavior between object patterns', () => {
      const objectLiteral = { bracketSpacing: false };
      const constructorObject = new Object({ bracketSpacing: false });
      
      function FormatConstructor() { 
        this.bracketSpacing = false; 
      }
      const functionConstructor = new FormatConstructor();

      const result1 = stringify(testObject, objectLiteral);
      const result2 = stringify(testObject, constructorObject);
      const result3 = stringify(testObject, functionConstructor);

      // All should format arrays the same way
      expect(result1).toContain('servers = ["web", "api", "db"]');
      expect(result2).toContain('servers = ["web", "api", "db"]');
      expect(result3).toContain('servers = ["web", "api", "db"]');
    });
  });

  describe('JavaScript/TypeScript interoperability edge cases', () => {
    it('should handle null format parameter gracefully', () => {
      // Should fall back to defaults when format is null
      const result = stringify(testObject, null);

      expect(result).toContain('servers = [ "web", "api", "db" ]'); // Should use defaults
      expect(result).toContain('title = "Test App"');
      expect(result).toContain('[features]');
    });

    it('should handle undefined format parameter gracefully', () => {
      // Should fall back to defaults when format is undefined
      const result = stringify(testObject, undefined);

      expect(result).toContain('servers = [ "web", "api", "db" ]'); // Should use defaults
      expect(result).toContain('title = "Test App"');
    });

    it('should ignore unsupported properties in format objects', () => {
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
        const result = stringify(testObject, formatWithUnsupportedProps);
        
        // Should warn about unsupported properties
        expect(warnMessage).toContain('toml-patch: Ignoring unsupported format properties:');
        expect(warnMessage).toContain('unsupportedProperty');
        expect(warnMessage).toContain('anotherUnsupported');
        expect(warnMessage).toContain('randomFunction');
        expect(warnMessage).toContain('Supported properties are: newLine, trailingNewline, trailingComma, bracketSpacing');
        
        // Should still work and use supported properties
        expect(result).toContain('servers = ["web", "api", "db"]');
      } finally {
        // Restore console.warn
        console.warn = originalWarn;
      }
    });

    it('should handle format objects with getter/setter properties', () => {
      const formatWithGetters = {
        get bracketSpacing() { return true; },
        set bracketSpacing(value) { this._bracketSpacing = value; },
        get trailingComma() { return false; }
      };

      const result = stringify(testObject, formatWithGetters);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('[settings]');
    });

    it('should handle primitive values as format parameters', () => {
      // These should all fall back to defaults without throwing
      expect(() => stringify(testObject, "string")).not.toThrow();
      expect(() => stringify(testObject, 123)).not.toThrow();
      expect(() => stringify(testObject, true)).not.toThrow();
      expect(() => stringify(testObject, [])).not.toThrow();
    });

    it('should handle format objects with circular references', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const formatWithCircular = { bracketSpacing: false };
        formatWithCircular.self = formatWithCircular; // Create circular reference

        // Should not throw and should handle the circular reference gracefully
        expect(() => {
          const result = stringify(testObject, formatWithCircular);
          expect(result).toContain('servers = ["web", "api", "db"]');
        }).not.toThrow();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should handle format objects with toString/valueOf overrides', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        const formatWithOverrides = {
          bracketSpacing: false,
          toString() { return "CustomToString"; },
          valueOf() { return 42; },
          [Symbol.toPrimitive]() { return "primitive"; }
        };

        const result = stringify(testObject, formatWithOverrides);
        
        expect(result).toContain('servers = ["web", "api", "db"]');
        expect(result).toContain('[settings]');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should handle Proxy objects as format parameters', () => {
      const targetFormat = { bracketSpacing: true };
      const proxyFormat = new Proxy(targetFormat, {
        get(target, prop) {
          return target[prop];
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        }
      });

      const result = stringify(testObject, proxyFormat);
      
      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(result).toContain('[features]');
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
          stringify(testObject, format);
        }).toThrow('Invalid types for format properties');
      });

      // Test that valid types don't throw errors
      expect(() => {
        const validFormat = {
          newLine: '\\r\\n',
          trailingNewline: true,
          trailingComma: false,
          bracketSpacing: true
        };
        
        const result = stringify(testObject, validFormat);
        expect(result).toBeTruthy();
      }).not.toThrow();
    });
  });

  describe('nested objects and complex structures', () => {
    it('should handle deeply nested objects with format', () => {
      const complexObject = {
        app: {
          name: "Complex App",
          database: {
            host: "localhost",
            pools: ["read", "write"]
          }
        }
      };

      const format = { bracketSpacing: false };
      const result = stringify(complexObject, format);
      
      expect(result).toContain('pools = ["read", "write"]');
      expect(result).toContain('name = "Complex App"');
      expect(result).toContain('[app]');
    });

    it('should handle arrays of objects with format', () => {
      const arrayObject = {
        servers: [
          { name: "web1", ports: [80, 443] },
          { name: "web2", ports: [8080, 8443] }
        ]
      };

      const format = { bracketSpacing: true };
      const result = stringify(arrayObject, format);
      
      expect(result).toContain('ports = [ 80, 443 ]');
      expect(result).toContain('ports = [ 8080, 8443 ]');
      expect(result).toContain('[[servers]]');
    });
  });
});