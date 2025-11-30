import { TomlFormat } from '../toml-format';
import { patch } from '../index';
import { TomlDocument } from '../toml-document';

describe('Format detection real-world scenarios', () => {
  
  describe('configuration file formatting preservation', () => {
    test('should preserve formatting when updating package.json-like config', () => {
      const originalConfig = `name = "my-project"
version = "1.0.0"
dependencies = ["dep1", "dep2",]

[build]
target = "es2020"
sourcemap = true

[dev]
hot = true
port = 3000`;

      const updates = {
        name: "my-project",
        version: "1.0.1", // Version bump
        dependencies: ["dep1", "dep2", "dep3"], // Add dependency
        build: {
          target: "es2020",
          sourcemap: true,
          minify: true // Add new build option
        },
        dev: {
          hot: true,
          port: 3000
        }
      };

      const result = patch(originalConfig, updates);
      
      // Should maintain no trailing commas preference for regular arrays
      expect(result).toContain('dependencies = ["dep1", "dep2", "dep3"]');
      // Should not add trailing comma since original didn't have it for the main array
      expect(result).not.toContain('"dep3",]');
    });

    test('should preserve CRLF formatting in Windows-style configs', () => {
      const windowsConfig = "title = \"Windows Config\"\r\n[section]\r\nkey = \"value\"\r\n";
      
      const updates = {
        title: "Windows Config",
        section: {
          key: "value",
          newKey: "newValue"
        }
      };

      const result = patch(windowsConfig, updates);
      
      expect(result).toContain('\r\n');
      expect(result).not.toContain('\n[section]'); // Should use CRLF, not just LF
    });

    test('should handle mixed formatting styles gracefully', () => {
      const mixedConfig = `# Main config
title = "Mixed Style"
array = ["a", "b", "c",]  # trailing comma here
simple_array = ["x", "y", "z"]  # no trailing comma here
table = {compact = true, spacing = false}  # compact style

[section]
key = "value"`;

      const updates = {
        title: "Mixed Style",
        array: ["a", "b", "c", "d"],
        simple_array: ["x", "y", "z", "w"],
        table: {
          compact: true,
          spacing: false,
          newOption: "added"
        },
        section: {
          key: "value"
        },
        newSection: {
          feature: "enabled"
        }
      };

      const result = patch(mixedConfig, updates);
      
      // Should detect and apply trailing comma preference
      expect(result).toContain('"d",]');
      expect(result).toContain('"w"]'); // No trailing comma for simple_array
    });
  });

  describe('TomlDocument format integration', () => {
    test('should use autoDetected format in TomlDocument', () => {
      const original = `config = {debug = false, level = "info",}
data = ["item1", "item2",]

[server]
port = 8080`;

      const doc = new TomlDocument(original);
      
      // Modify the document
      const currentData = doc.toJsObject;
      currentData.config.timeout = 30;
      currentData.data = ['item1', 'item2', 'item3'];
      doc.patch(currentData);
      
      const result = doc.toString();
      
      // Should preserve trailing comma style
      expect(result).toContain('timeout = 30,}');
      expect(result).toContain('"item3",]');
    });

    test('should maintain format consistency in complex operations', () => {
      const original = `[database]\r\nhost = "localhost"\r\nport = 5432\r\n\r\n[redis]\r\nhost = "localhost"\r\nport = 6379\r\n`;
      
      const doc = new TomlDocument(original);
      
      // Add new sections and modify existing
      const currentData = doc.toJsObject;
      currentData.database.timeout = 30;
      currentData.mongodb = { host: 'localhost', port: 27017 };
      doc.patch(currentData);
      
      const result = doc.toString();
      
      // Should maintain CRLF and double trailing newlines
      expect(result).toContain('\r\n');
      expect(result).toMatch(/\r\n\r\n$/);
    });
  });

  describe('format detection with edge cases', () => {
    test('should handle config files with only inline structures', () => {
      const inlineOnly = `config = {env = "prod", debug = false,}
servers = [{name = "web", port = 80,}, {name = "api", port = 3000,}]`;

      const format = TomlFormat.autoDetectFormat(inlineOnly);
      
      expect(format.trailingComma).toBe(true);
      expect(format.newLine).toBe('\n');
      expect(format.trailingNewline).toBe(0); // No trailing newline
    });

    test('should handle very minimal TOML files', () => {
      const minimal = `key="value"`;
      
      const format = TomlFormat.autoDetectFormat(minimal);
      const updates = { key: "value", newKey: "newValue" };
      const result = patch(minimal, updates, format);
      
      expect(result).not.toContain('\n\n'); // Should not add extra newlines
    });

    test('should handle TOML with complex unicode and escaping', () => {
      const unicode = `title = "🚀 Unicode Test"
message = "Line 1\\nLine 2\\nLine 3"
unicode_array = ["café", "naïve", "🎉",]

[metadata]
author = "Test Author"
description = """
Multi-line
description with
unicode: 🌟"""`;

      const format = TomlFormat.autoDetectFormat(unicode);
      const updates = {
        title: "🚀 Unicode Test",
        message: "Line 1\nLine 2\nLine 3",
        unicode_array: ["café", "naïve", "🎉", "新しい"],
        metadata: {
          author: "Test Author",
          description: "Multi-line\ndescription with\nunicode: 🌟"
        }
      };

      const result = patch(unicode, updates, format);
      
      expect(result).toContain('"新しい",]'); // Should preserve trailing comma style
      expect(result).toContain('unicode_array = ["café", "naïve", "🎉", "新しい",]');
    });
  });

  describe('performance and stress testing', () => {
    test('should handle large configuration files efficiently', () => {
      // Generate a large config-like structure
      const sections = [];
      for (let i = 0; i < 50; i++) {
        sections.push(`[section_${i}]
key_${i}_1 = "value_${i}_1"
key_${i}_2 = ${i * 10}
key_${i}_3 = ["item1", "item2", "item3",]`);
      }
      const largeConfig = sections.join('\n\n');
      
      const startTime = Date.now();
      const format = TomlFormat.autoDetectFormat(largeConfig);
      const detectionTime = Date.now() - startTime;
      
      expect(detectionTime).toBeLessThan(1000); // Should detect format quickly
      expect(format.trailingComma).toBe(true);
      
      // Test patching performance
      const updates = { new_section: { new_key: "new_value" } };
      const patchStartTime = Date.now();
      const result = patch(largeConfig, updates, format);
      const patchTime = Date.now() - patchStartTime;
      
      expect(patchTime).toBeLessThan(2000); // Should patch efficiently
      expect(result).toContain('new_key = "new_value"');
    });

    test('should handle deeply nested structures in format detection', () => {
      const deeplyNested = `[level1.level2.level3.level4.level5]
deep_key = "deep_value"
array = ["a", "b", "c",]
table = {x = 1, y = 2,}

[[level1.level2.arrays]]
name = "first"
values = [1, 2, 3,]

[[level1.level2.arrays]]
name = "second"
values = [4, 5, 6,]`;

      const format = TomlFormat.autoDetectFormat(deeplyNested);
      
      expect(format.trailingComma).toBe(true);
      
      const updates = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  deep_key: "deep_value",
                  new_deep_key: "new_deep_value"
                }
              }
            },
            arrays: [
              { name: "first", values: [1, 2, 3] },
              { name: "second", values: [4, 5, 6] },
              { name: "third", values: [7, 8, 9] }
            ]
          }
        }
      };

      const result = patch(deeplyNested, updates, format);
      
      expect(result).toContain('values = [7, 8, 9,]'); // Should maintain trailing comma
    });
  });
});