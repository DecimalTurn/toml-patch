// @ts-nocheck
/**
 * TomlDocument JavaScript integration tests
 */

import { TomlDocument, TomlFormat } from "../../../dist/toml-patch.js";

describe('TomlDocument JavaScript Integration', () => {
  const originalToml = `title = "Test App"
[database]
host = "localhost"
port = 5432
enabled = true

[server]
name = "web-server"
timeout = 30
`;

  describe('basic functionality', () => {
    it('should parse TOML to JavaScript object correctly', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      
      expect(jsObject.title).toBe("Test App");
      expect(jsObject.database.host).toBe("localhost");
      expect(jsObject.database.port).toBe(5432);
      expect(jsObject.server.name).toBe("web-server");
    });

    it('should format arrays with bracket spacing', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.database.servers = ["web", "api"];

      const format = { bracketSpacing: true };
      doc.patch(jsObject, format);

      expect(doc.toTomlString).toContain('servers = [ "web", "api" ]');
    });

    it('should format arrays without bracket spacing', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.database.servers = ["web", "api"];

      const format = { bracketSpacing: false };
      doc.patch(jsObject, format);

      expect(doc.toTomlString).toContain('servers = ["web", "api"]');
    });

    it('should auto-detect format when no format provided', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.database.ports = [8080, 9000];

      doc.patch(jsObject);

      expect(doc.toTomlString).toContain('ports = [ 8080, 9000 ]');
    });
  });

  describe('format compatibility', () => {
    it('should work with plain JavaScript format objects', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.server.protocols = ["http", "https"];

      const format = { 
        bracketSpacing: true, 
        trailingComma: false 
      };
      doc.patch(jsObject, format);

      expect(doc.toTomlString).toContain('protocols = [ "http", "https" ]');
    });

    it('should work with TomlFormat instances', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.database.features = ["ssl", "backup"];

      const format = new TomlFormat('\n', 1, false, true);
      doc.patch(jsObject, format);

      expect(doc.toTomlString).toContain('features = [ "ssl", "backup" ]');
    });

    it('should handle null/undefined format gracefully', () => {
      const doc = new TomlDocument(originalToml);
      const jsObject = doc.toJsObject;
      jsObject.server.middleware = ["auth", "cors"];

      expect(() => doc.patch(jsObject, null)).not.toThrow();
      expect(() => doc.patch(jsObject, undefined)).not.toThrow();
      expect(() => doc.patch(jsObject)).not.toThrow();
    });
  });
});