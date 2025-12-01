/**
 * Integration tests for TomlDocument format object flexibility
 * 
 * Tests that TomlDocument.patch() works with various object creation patterns
 * and format object styles, demonstrating the flexible format parameter handling.
 */

const { TomlDocument, TomlFormat } = require("../../../dist/toml-patch.cjs.min.js");

describe('TomlDocument Format Object Flexibility Integration', () => {
  const originalToml = `# Configuration file
title = "Format Object Test"

[settings]
debug = true
timeout = 5000

[features]
cache = true
`;

  const expectedJsObject = {
    title: "Format Object Test",
    settings: {
      debug: true,
      timeout: 5000
    },
    features: {
      cache: true
    }
  };

  beforeEach(() => {
    // Ensure we start with consistent state for each test
  });

  describe('plain JavaScript objects (format flexibility)', () => {
    it('should work with complete format-like objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.max_connections = ["tcp", "udp", "websocket"];
      jsObject.features.monitoring = ["logs", "metrics"];

      const formatAsObject = {
        bracketSpacing: true,
        trailingComma: false,
        newLine: "\\n",
        trailingNewline: 1
      };

      doc.patch(jsObject, formatAsObject);
      const result = doc.toTomlString;

      expect(result).toContain('max_connections = [ "tcp", "udp", "websocket" ]');
      expect(result).toContain('monitoring = [ "logs", "metrics" ]');
      expect(doc.toJsObject.settings.max_connections).toEqual(["tcp", "udp", "websocket"]);
      expect(doc.toJsObject.features.monitoring).toEqual(["logs", "metrics"]);
    });

    it('should work with partial format objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.allowed_hosts = ["localhost", "127.0.0.1"];
      jsObject.features.security = ["auth", "encryption"];

      const partialFormat = { bracketSpacing: false };

      doc.patch(jsObject, partialFormat);
      const result = doc.toTomlString;

      expect(result).toContain('allowed_hosts = ["localhost", "127.0.0.1"]');
      expect(result).toContain('security = ["auth", "encryption"]');
      expect(doc.toJsObject.settings.allowed_hosts).toEqual(["localhost", "127.0.0.1"]);
      expect(doc.toJsObject.features.security).toEqual(["auth", "encryption"]);
    });

    it('should work with empty format objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.ports = [8080, 8081, 8082];

      const emptyFormat = {};

      doc.patch(jsObject, emptyFormat);
      const result = doc.toTomlString;

      expect(result).toContain('ports = [ 8080, 8081, 8082 ]'); // Should use auto-detected format
      expect(doc.toJsObject.settings.ports).toEqual([8080, 8081, 8082]);
    });
  });

  describe('anonymous constructor patterns', () => {
    it('should work with new Object() constructor', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.servers = ["web", "api", "db"];

      const format = new Object({ bracketSpacing: true });

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('servers = [ "web", "api", "db" ]');
      expect(doc.toJsObject.settings.servers).toEqual(["web", "api", "db"]);
    });

    it('should work with Object.create patterns', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.databases = ["mysql", "postgres"];

      const format = Object.create(null, {
        bracketSpacing: { value: false, enumerable: true, writable: true }
      });

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('databases = ["mysql", "postgres"]');
      expect(doc.toJsObject.settings.databases).toEqual(["mysql", "postgres"]);
    });

    it('should work with function constructors', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.protocols = ["http", "https"];

      function FormatLike(bracketSpacing) {
        this.bracketSpacing = bracketSpacing;
      }
      const format = new FormatLike(true);

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('protocols = [ "http", "https" ]');
      expect(doc.toJsObject.settings.protocols).toEqual(["http", "https"]);
    });

    it('should work with custom class instances', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.environments = ["dev", "prod"];

      class CustomFormat {
        constructor(bracketSpacing) {
          this.bracketSpacing = bracketSpacing;
        }
      }
      const format = new CustomFormat(false);

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('environments = ["dev", "prod"]');
      expect(doc.toJsObject.settings.environments).toEqual(["dev", "prod"]);
    });

    it('should work with objects containing methods', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.features = ["auth", "logging"];

      const format = {
        bracketSpacing: true,
        getBracketSpacing() { return this.bracketSpacing; }
      };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('features = [ "auth", "logging" ]');
      expect(doc.toJsObject.settings.features).toEqual(["auth", "logging"]);
    });
  });

  describe('comparison with TomlFormat.default()', () => {
    it('should produce equivalent results to TomlFormat.default()', () => {
      const doc1 = new TomlDocument(originalToml);
      const doc2 = new TomlDocument(originalToml);
      
      const jsObject1 = doc1.toJsObject;
      const jsObject2 = doc2.toJsObject;
      
      jsObject1.settings.modules = ["core", "plugins"];
      jsObject2.settings.modules = ["core", "plugins"];

      // Use plain object
      const plainFormat = { bracketSpacing: true };
      doc1.patch(jsObject1, plainFormat);

      // Use TomlFormat.default()
      const realFormat = TomlFormat.default();
      realFormat.bracketSpacing = true;
      doc2.patch(jsObject2, realFormat);

      expect(doc1.toJsObject).toEqual(doc2.toJsObject);
      expect(doc1.toTomlString).toBe(doc2.toTomlString);
    });
  });

  describe('null and undefined handling', () => {
    it('should handle null format parameter', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.newArray = ["item1", "item2"];

      expect(() => {
        doc.patch(jsObject, null);
      }).not.toThrow();

      const result = doc.toTomlString;
      expect(result).toContain('newArray = [ "item1", "item2" ]'); // Uses auto-detected format
    });

    it('should handle undefined format parameter', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.newArray = ["item1", "item2"];

      expect(() => {
        doc.patch(jsObject, undefined);
      }).not.toThrow();

      const result = doc.toTomlString;
      expect(result).toContain('newArray = [ "item1", "item2" ]'); // Uses auto-detected format
    });

    it('should handle omitted format parameter', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.newArray = ["item1", "item2"];

      expect(() => {
        doc.patch(jsObject);
      }).not.toThrow();

      const result = doc.toTomlString;
      expect(result).toContain('newArray = [ "item1", "item2" ]'); // Uses auto-detected format
    });
  });

  describe('multiple properties and complex scenarios', () => {
    it('should handle multiple format properties without TomlFormat class', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.modules = ["core", "plugins"];

      const format = {
        bracketSpacing: true,
        trailingComma: true,
        newLine: "\\n",
        trailingNewline: 2
      };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('modules = [ "core", "plugins", ]'); // Has trailing comma and bracket spacing
      expect(doc.toJsObject.settings.modules).toEqual(["core", "plugins"]);
    });

    it('should handle minimal format objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.tools = ["webpack", "babel"];

      const format = { bracketSpacing: false };

      doc.patch(jsObject, format);
      const result = doc.toTomlString;

      expect(result).toContain('tools = ["webpack", "babel"]');
      expect(doc.toJsObject.settings.tools).toEqual(["webpack", "babel"]);
    });
  });

  describe('README documentation examples', () => {
    it('should work with exact README example syntax', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.settings.data = ["json", "yaml"];

      const readmeFormat = { bracketSpacing: true };

      doc.patch(jsObject, readmeFormat);
      const result = doc.toTomlString;

      expect(result).toContain('data = [ "json", "yaml" ]');
      expect(doc.toJsObject.settings.data).toEqual(["json", "yaml"]);
    });
  });
});