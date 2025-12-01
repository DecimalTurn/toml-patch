/**
 * Integration tests for TomlDocument bracket spacing functionality
 * 
 * Tests the bracketSpacing format option with actual compiled JavaScript modules
 * to ensure the distribution build works correctly with array formatting.
 */

const { TomlDocument, TomlFormat } = require("../../../dist/toml-patch.cjs.min.js");

describe('TomlDocument Bracket Spacing Integration', () => {
  const originalToml = `# Configuration file
title = "My App Config"

[database]
host = "localhost"
port = 5432
enabled = true

[server]
name = "web-server"
timeout = 30

[logging]
level = "info"
`;

  const expectedJsObject = {
    title: "My App Config",
    database: {
      host: "localhost",
      port: 5432,
      enabled: true
    },
    server: {
      name: "web-server",
      timeout: 30
    },
    logging: {
      level: "info"
    }
  };

  describe('parsing and object conversion', () => {
    it('should parse TOML to JavaScript object correctly', () => {
      const doc = new TomlDocument(originalToml);
      expect(doc.toJsObject).toEqual(expectedJsObject);
    });

    it('should return original TOML string', () => {
      const doc = new TomlDocument(originalToml);
      expect(doc.toTomlString).toBe(originalToml);
    });
  });

  describe('bracket spacing with TomlFormat.default()', () => {
    it('should format arrays with bracket spacing when bracketSpacing = true', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      
      // Add array values to different tables
      jsObject.database.allowed_ips = ["192.168.1.1", "192.168.1.2", "10.0.0.1"];
      jsObject.database.connection_types = ["tcp", "ssl"];
      jsObject.server.supported_protocols = ["http", "https", "ws", "wss"];
      jsObject.server.middleware = ["auth", "cors", "compression"];
      jsObject.logging.outputs = ["console", "file"];
      jsObject.logging.formats = ["json", "plain"];
      jsObject.features = {
        authentication: ["oauth", "jwt", "basic"],
        caching: ["redis", "memory"],
        monitoring: ["metrics", "health"]
      };

      const format = TomlFormat.default();
      format.bracketSpacing = true;

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      // Check for bracket spacing (spaces inside brackets)
      expect(result).toContain('[ "192.168.1.1", "192.168.1.2", "10.0.0.1" ]');
      expect(result).toContain('[ "tcp", "ssl" ]');
      expect(result).toContain('[ "http", "https", "ws", "wss" ]');
      expect(result).toContain('[ "auth", "cors", "compression" ]');
      expect(result).toContain('[ "console", "file" ]');
      expect(result).toContain('[ "json", "plain" ]');
      expect(result).toContain('[ "oauth", "jwt", "basic" ]');
      expect(result).toContain('[ "redis", "memory" ]');
      expect(result).toContain('[ "metrics", "health" ]');

      // Ensure we don't have compact formatting
      expect(result).not.toContain('["192.168.1.1","192.168.1.2","10.0.0.1"]');
      expect(result).not.toContain('["tcp","ssl"]');
    });

    it('should format arrays without bracket spacing when bracketSpacing = false', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      
      // Add the same array values
      jsObject.database.allowed_ips = ["192.168.1.1", "192.168.1.2", "10.0.0.1"];
      jsObject.database.connection_types = ["tcp", "ssl"];
      jsObject.server.supported_protocols = ["http", "https", "ws", "wss"];
      jsObject.server.middleware = ["auth", "cors", "compression"];
      jsObject.logging.outputs = ["console", "file"];
      jsObject.logging.formats = ["json", "plain"];
      jsObject.features = {
        authentication: ["oauth", "jwt", "basic"],
        caching: ["redis", "memory"],
        monitoring: ["metrics", "health"]
      };

      const format = TomlFormat.default();
      format.bracketSpacing = false;

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      // Check for no bracket spacing (no spaces inside brackets)
      expect(result).toContain('["192.168.1.1", "192.168.1.2", "10.0.0.1"]');
      expect(result).toContain('["tcp", "ssl"]');
      expect(result).toContain('["http", "https", "ws", "wss"]');
      expect(result).toContain('["auth", "cors", "compression"]');
      expect(result).toContain('["console", "file"]');
      expect(result).toContain('["json", "plain"]');
      expect(result).toContain('["oauth", "jwt", "basic"]');
      expect(result).toContain('["redis", "memory"]');
      expect(result).toContain('["metrics", "health"]');

      // Ensure we don't have spaced formatting
      expect(result).not.toContain('[ "192.168.1.1", "192.168.1.2", "10.0.0.1" ]');
      expect(result).not.toContain('[ "tcp", "ssl" ]');
    });
  });

  describe('auto-detection without explicit format', () => {
    it('should use auto-detected format when no format is provided', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.server.ports = [8080, 8081, 8082];

      // No format parameter - should use auto-detected
      doc.patch(jsObject);
      const result = doc.toTomlString;

      expect(result).toContain('ports = [ 8080, 8081, 8082 ]'); // Default is bracketSpacing = true
      expect(doc.toJsObject.server.ports).toEqual([8080, 8081, 8082]);
    });

    it('should preserve original structure when patching', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.database.max_connections = 100;
      jsObject.server.workers = 4;

      doc.patch(jsObject);
      const result = doc.toTomlString;

      // Should preserve the original structure and comments
      expect(result).toContain('# Configuration file');
      expect(result).toContain('[database]');
      expect(result).toContain('[server]');
      expect(result).toContain('[logging]');
      expect(result).toContain('title = "My App Config"');
      
      // New values should be added
      expect(result).toContain('max_connections = 100');
      expect(result).toContain('workers = 4');
      
      // Original values should be preserved
      expect(result).toContain('host = "localhost"');
      expect(result).toContain('port = 5432');
      expect(result).toContain('enabled = true');
    });
  });

  describe('complex patching scenarios', () => {
    it('should handle mixed value types with bracket spacing', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      
      jsObject.mixed = {
        strings: ["one", "two", "three"],
        numbers: [1, 2, 3],
        booleans: [true, false, true],
        mixed_array: ["string", 42, true]
      };

      const format = TomlFormat.default();
      format.bracketSpacing = true;

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('strings = [ "one", "two", "three" ]');
      expect(result).toContain('numbers = [ 1, 2, 3 ]');
      expect(result).toContain('booleans = [ true, false, true ]');
      expect(result).toContain('mixed_array = [ "string", 42, true ]');
    });

    it('should handle nested objects with arrays', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      
      jsObject.nested = {
        level1: {
          items: ["a", "b", "c"]
        },
        level2: {
          values: [10, 20, 30]
        }
      };

      const format = TomlFormat.default();
      format.bracketSpacing = false;

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('level1 = {items = ["a", "b", "c"]}');
      expect(result).toContain('level2 = {values = [10, 20, 30]}');
    });
  });

  describe('error handling', () => {
    it('should handle empty arrays correctly', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.empty = [];

      const format = TomlFormat.default();
      format.bracketSpacing = true;

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('empty = []');
      expect(doc.toJsObject.logging.empty).toEqual([]);
    });

    it('should handle single element arrays', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.single = ["only"];

      const format = TomlFormat.default();
      format.bracketSpacing = true;

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('single = [ "only" ]');
    });
  });
});