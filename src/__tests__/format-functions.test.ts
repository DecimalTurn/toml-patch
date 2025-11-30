import { formatTopLevel, formatEmptyLines, TomlFormat } from '../toml-format';
import { patch } from '../index';

describe('Format functions integration tests', () => {
  
  describe('patch behavior with complex structures', () => {
    test('should convert inline tables to standard tables when patching', () => {
      const original = `name = "test"`;
      const updated = {
        name: "test",
        config: { debug: true, level: "info", timeout: 30 },
        database: { host: "localhost", port: 5432, ssl: true }
      };
      
      const result = patch(original, updated);
      
      // When adding complex objects via patch, they should become standard tables
      expect(result).toContain('[config]');
      expect(result).toContain('debug = true');
      expect(result).toContain('level = "info"');
      expect(result).toContain('timeout = 30');
      expect(result).toContain('[database]');
      expect(result).toContain('host = "localhost"');
      expect(result).toContain('port = 5432');
      expect(result).toContain('ssl = true');
    });

    test('should create table arrays for array of objects', () => {
      const original = ``;
      const updated = {
        servers: [
          { name: "web-01", ip: "192.168.1.10", port: 80 },
          { name: "web-02", ip: "192.168.1.11", port: 80 },
          { name: "db-01", ip: "192.168.1.20", port: 5432 }
        ]
      };
      
      const result = patch(original, updated);
      
      // Should create [[servers]] table array
      expect(result).toContain('[[servers]]');
      expect(result).toContain('name = "web-01"');
      expect(result).toContain('ip = "192.168.1.10"');
      expect(result).toContain('port = 80');
      expect(result).toContain('name = "web-02"');
      expect(result).toContain('name = "db-01"');
      expect(result).toContain('port = 5432');
    });

    test('should handle deeply nested object structures', () => {
      const original = `title = "Example"`;
      const updated = {
        title: "Example",
        app: {
          name: "myapp",
          version: "1.0.0",
          database: { 
            host: "localhost", 
            port: 5432,
            credentials: { user: "admin", pass: "secret" }
          },
          services: [
            { 
              name: "web", 
              config: { port: 80, ssl: true, domains: ["example.com", "www.example.com"] }
            },
            { 
              name: "api", 
              config: { port: 3000, ssl: false, rate_limit: 1000 }
            }
          ]
        }
      };
      
      const result = patch(original, updated);
      
      // Should create proper nested table structure
      expect(result).toContain('[app]');
      expect(result).toContain('name = "myapp"');
      expect(result).toContain('[app.database]');
      expect(result).toContain('host = "localhost"');
      expect(result).toContain('[app.database.credentials]');
      expect(result).toContain('user = "admin"');
      expect(result).toContain('[[app.services]]');
      expect(result).toContain('name = "web"');
      expect(result).toContain('[app.services.config]');
      expect(result).toContain('port = 80');
      expect(result).toContain('domains = ["example.com", "www.example.com"]');
    });

    test('should handle empty objects and arrays correctly', () => {
      const original = `title = "test"`;
      const updated = {
        title: "test",
        empty_object: {},
        empty_array: [],
        mixed_array: ["string", 42, true],
        object_with_empty: { 
          name: "test", 
          empty_nested: {},
          values: []
        }
      };
      
      const result = patch(original, updated);
      
      expect(result).toContain('[empty_object]');
      expect(result).toContain('empty_array = []');
      expect(result).toContain('mixed_array = [ "string", 42, true ]');
      expect(result).toContain('[object_with_empty]');
      expect(result).toContain('name = "test"');
      expect(result).toContain('[object_with_empty.empty_nested]');
      expect(result).toContain('values = []');
    });
  });

  describe('format preservation in complex patches', () => {
    test('should preserve existing formatting style when modifying existing keys', () => {
      const original = `title = "test"
existing_array = ["a", "b", ]
config = { debug = true, env = "prod" }

[section]
key = "value"`;

      const updated = {
        title: "test", 
        existing_array: ["a", "b", "c"], // Modify existing array
        config: { debug: true, env: "prod", timeout: 30 }, // Add to existing object
        section: { 
          key: "value",
          new_key: "new_value" // Add new key to existing section
        },
        new_section: { // Add entirely new section
          feature: "enabled",
          settings: ["opt1", "opt2"]
        }
      };
      
      const result = patch(original, updated);
      
      // Should preserve trailing comma style from original
      expect(result).toContain('["a", "b", "c", ]');
      // Should add new section properly
      expect(result).toContain('[new_section]');
      expect(result).toContain('feature = "enabled"');
      expect(result).toContain('settings = ["opt1", "opt2",]');
      // Should modify existing section
      expect(result).toContain('new_key = "new_value"');
    });

    test('should preserve CRLF line endings throughout complex operations', () => {
      const original = "title = 'test'\r\n[section]\r\nkey = 'value'\r\n\r\n";
      const updated = {
        title: "test",
        new_key: "added_value",
        section: { 
          key: "value",
          added: "new_data" 
        },
        new_section: {
          config: "setting",
          items: ["a", "b", "c"]
        }
      };
      
      const result = patch(original, updated, TomlFormat.autoDetectFormat(original));
      
      expect(result).toContain('\r\n');
      expect(result).not.toContain('\n['); // Should not have LF before sections
      expect(result).toMatch(/\r\n\r\n$/); // Should preserve double trailing newlines
      expect(result).toContain('new_key = "added_value"');
      expect(result).toContain('[new_section]');
    });

    test('should handle mixed formatting preservation with special characters', () => {
      const original = `title = "🚀 My App"
description = """Multi-line
description with
unicode characters: ñáéíóú"""

[server]
host = "localhost"
ports = [ 80, 443, ]

[[workers]]
name = "worker-1"
priority = 10`;

      const updated = {
        title: "🚀 My App",
        description: `Multi-line
description with
unicode characters: ñáéíóú`,
        version: "2.0.0",
        server: {
          host: "localhost",
          ports: [80, 443, 8080],
          ssl: true,
          certificates: {
            cert_file: "/path/to/cert.pem",
            key_file: "/path/to/key.pem"
          }
        },
        workers: [
          { name: "worker-1", priority: 10 },
          { name: "worker-2", priority: 5, timeout: 30 },
          { name: "worker-3", priority: 1, retries: 3 }
        ]
      };

      const result = patch(original, updated);

      // Should preserve multiline strings
      expect(result).toContain('"""Multi-line');
      expect(result).toContain('unicode characters: ñáéíóú"""');
      // Should preserve trailing comma in arrays
      expect(result).toContain('[80, 443, 8080, ]');
      // Should add new nested structure
      expect(result).toContain('[server.certificates]');
      expect(result).toContain('cert_file = "/path/to/cert.pem"');
      // Should preserve and extend array of tables
      expect(result).toContain('[[workers]]');
      expect(result).toContain('name = "worker-2"');
      expect(result).toContain('timeout = 30');
    });

    test('should handle formatting with inline arrays and tables mixed', () => {
      const original = `# Configuration file
title = "Mixed Format Example"

# Simple values
debug = true
timeout = 30.5

# Inline arrays with different styles
simple_array = ["a", "b"]
trailing_comma_array = ["x", "y", ]

# Inline table
database = { host = "localhost", port = 5432 }`;

      const updated = {
        title: "Mixed Format Example",
        debug: true,
        timeout: 30.5,
        simple_array: ["a", "b", "c"],
        trailing_comma_array: ["x", "y", "z"],
        database: {
          host: "localhost",
          port: 5432,
          name: "mydb",
          pool: { min: 5, max: 20 }
        },
        logging: {
          level: "info",
          file: "/var/log/app.log",
          rotate: true
        }
      };

      const result = patch(original, updated);

      // Should preserve comment structure
      expect(result).toContain('# Configuration file');
      expect(result).toContain('# Simple values');
      
      // Should preserve no trailing comma for simple_array
      expect(result).toContain('["a", "b", "c"]');
      expect(result).not.toContain('["a", "b", "c", ]');
      
      // Should preserve trailing comma for trailing_comma_array
      expect(result).toContain('["x", "y", "z", ]');
      
      // When inline table becomes complex, should become standard table
      expect(result).toContain('[database]');
      expect(result).toContain('host = "localhost"');
      expect(result).toContain('[database.pool]');
      expect(result).toContain('min = 5');
      
      // Should add new section
      expect(result).toContain('[logging]');
      expect(result).toContain('level = "info"');
    });
  });

  describe('edge cases and error conditions', () => {
    test('should handle patching with null and undefined values', () => {
      const original = `title = "test"
optional = "value"`;

      const updated = {
        title: "test",
        optional: null, // Should remove or handle null
        new_field: undefined, // Should not be added
        valid_field: "added"
      };

      // This test documents expected behavior - may need to be adjusted based on actual implementation
      const result = patch(original, updated);
      
      expect(result).toContain('title = "test"');
      expect(result).toContain('valid_field = "added"');
      // Behavior for null/undefined needs to be defined - should it remove the key or convert to something?
    });

    test('should handle extremely nested structures', () => {
      const original = `root = "value"`;
      const updated = {
        root: "value",
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  deep_value: "found",
                  deep_array: [
                    { id: 1, nested: { value: "deep" } },
                    { id: 2, nested: { value: "deeper" } }
                  ]
                }
              }
            }
          }
        }
      };

      const result = patch(original, updated);

      expect(result).toContain('[level1.level2.level3.level4.level5]');
      expect(result).toContain('deep_value = "found"');
      expect(result).toContain('[[level1.level2.level3.level4.level5.deep_array]]');
      expect(result).toContain('[level1.level2.level3.level4.level5.deep_array.nested]');
      expect(result).toContain('value = "deep"');
    });

    test('should handle large arrays and maintain performance', () => {
      const original = `title = "Performance Test"`;
      
      // Create a large array
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        active: i % 2 === 0,
        metadata: {
          created: `2024-01-${String(i % 28 + 1).padStart(2, '0')}`,
          tags: [`tag-${i % 10}`, `category-${i % 5}`]
        }
      }));

      const updated = {
        title: "Performance Test",
        items: largeArray
      };

      const result = patch(original, updated);

      expect(result).toContain('[[items]]');
      expect(result).toContain('id = 0');
      expect(result).toContain('name = "item-0"');
      expect(result).toContain('[items.metadata]');
      expect(result).toContain('created = "2024-01-01"');
      expect(result).toContain('id = 999');
      expect(result).toContain('name = "item-999"');
      
      // Should handle the large structure without errors
      expect(result.length).toBeGreaterThan(10000); // Should be a substantial output
    });
  });
});