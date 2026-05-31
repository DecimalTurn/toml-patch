/**
 * Tests for the inlineTableStart option which controls at what nesting depth
 * tables should start being formatted as inline tables versus separate sections.
 */

import { stringify, parse } from '../index';
import dedent from 'dedent';
import patch from '../patch-toml';
import { calculateTableDepth } from '../formatter';

describe('inlineTableStart option', () => {
  describe('calculateTableDepth function', () => {
    it('should calculate correct depths for various key paths', () => {
      expect(calculateTableDepth(['root'])).toBe(0);
      expect(calculateTableDepth(['root', 'nested'])).toBe(1);
      expect(calculateTableDepth(['root', 'nested', 'deep'])).toBe(2);
      expect(calculateTableDepth(['a', 'b', 'c', 'd'])).toBe(3);
      expect(calculateTableDepth([])).toBe(0);
    });
  });

  describe('with inlineTableStart = 2', () => {
    it('should format root level tables (depth 0) as separate sections', () => {
      const jsObject = {
        database: {
          host: "localhost",
          port: 5432
        }
      };

      const result = stringify(jsObject, { inlineTableStart: 2 });

      // Root level table should be a separate section
      expect(result).toContain('[database]');
      expect(result).toContain('host = "localhost"');
      expect(result).toContain('port = 5432');
      expect(result).not.toContain('database = {');
    });

    it('should format first nested level tables (depth 1) as separate sections', () => {
      const jsObject = {
        server: {
          database: {
            host: "localhost",
            port: 5432
          }
        }
      };

      const result = stringify(jsObject, { inlineTableStart: 2 });

      // Both levels should be separate sections
      expect(result).toContain('[server]');
      expect(result).toContain('[server.database]');
      expect(result).toContain('host = "localhost"');
      expect(result).toContain('port = 5432');
      expect(result).not.toContain('database = {');
    });

    it('should format second nested level tables (depth 2) as inline tables', () => {
      const jsObject = {
        application: {
          server: {
            database: {
              host: "localhost",
              port: 5432
            },
            cache: {
              type: "redis",
              ttl: 3600
            }
          }
        }
      };

      const result = stringify(jsObject, { inlineTableStart: 2 });

      // First two levels should be separate sections
      expect(result).toContain('[application]');
      expect(result).toContain('[application.server]');
      
      // Third level (depth 2) should be inline tables
      expect(result).toContain('database = { host = "localhost", port = 5432 }');
      expect(result).toContain('cache = { type = "redis", ttl = 3600 }');
      
      // Should not have separate sections for these
      expect(result).not.toContain('[application.server.database]');
      expect(result).not.toContain('[application.server.cache]');
    });

    it('should work correctly with patching operations', () => {
      const existing = `[config]
name = "test"
`;

      const newData = {
        config: {
          name: "test",
          server: {
            database: {
              host: "localhost",
              port: 5432
            }
          }
        }
      };

      const result = patch(existing, newData, { inlineTableStart: 2 });

      // Should create [config.server] section (depth 1)
      expect(result).toContain('[config.server]');
      
      // Should use inline table for database (depth 2)
      expect(result).toContain('database = { host = "localhost", port = 5432 }');
      
      // Should not create separate section for database
      expect(result).not.toContain('[config.server.database]');
    });
  });

  describe('inlineTableStart comparison', () => {
    it('should demonstrate different behavior with inlineTableStart = 0, 1, and 2', () => {
      const jsObject = {
        level0: {
          level1: {
            level2: {
              key: "value"
            }
          }
        }
      };

      // inlineTableStart = 0: All inline
      const result0 = stringify(jsObject, { inlineTableStart: 0 });
      expect(result0).toContain('level0 = { level1 = { level2 = { key = "value" } } }');
      expect(result0).not.toContain('[level0]');

      // inlineTableStart = 1: Root as section, rest inline
      const result1 = stringify(jsObject, { inlineTableStart: 1 });
      expect(result1).toContain('[level0]');
      expect(result1).toContain('level1 = { level2 = { key = "value" } }');
      expect(result1).not.toContain('[level0.level1]');

      // inlineTableStart = 2: First two levels as sections
      const result2 = stringify(jsObject, { inlineTableStart: 2 });
      expect(result2).toContain('[level0]');
      expect(result2).toContain('[level0.level1]');
      expect(result2).toContain('level2 = { key = "value" }');
      expect(result2).not.toContain('[level0.level1.level2]');
    });
  });

  describe('edge cases', () => {
    it('should handle inlineTableStart=0 (all tables as inline)', () => {
      const jsObject = {
        root: {
          nested: {
            value: "test"
          }
        }
      };

      const result = stringify(jsObject, { inlineTableStart: 0 });
      
      // Everything should be inline with inlineTableStart=0
      expect(result).toContain('root = { nested = { value = "test" } }');
      expect(result).not.toContain('[root]');
      expect(result).not.toContain('[root.nested]');
    });

    it('should handle large inlineTableStart values (all tables as separate sections)', () => {
      const jsObject = {
        root: {
          level1: {
            level2: {
              level3: {
                value: "deep"
              }
            }
          }
        }
      };

      const result = stringify(jsObject, { inlineTableStart: 10 });
      
      // All tables should be separate sections with large inlineTableStart
      expect(result).toContain('[root]');
      expect(result).toContain('[root.level1]');
      expect(result).toContain('[root.level1.level2]');
      expect(result).toContain('[root.level1.level2.level3]');
      expect(result).toContain('value = "deep"');
    });
  });

  describe('inline tables inside [[table_array]] sections', () => {
    it('should expand inline table inside [[slides]] section with inlineTableStart = 2', () => {
      const jsObject = {
        slides: [
          {
            MultipleChoice: {
              title: "What is this bird species?",
              time_limit: 30000,
              points_awarded: 1000
            }
          }
        ]
      };

      const result = stringify(jsObject, { inlineTableStart: 2 });

      expect(result).toEqual(dedent`
        [[slides]]

        [slides.MultipleChoice]
        title = "What is this bird species?"
        time_limit = 30000
        points_awarded = 1000
        ` + '\n'
      );
    });

    it('should demonstrate different behavior with inlineTableStart = 0, 1, 2, and 3 for the reported issue', () => {
      const input = dedent`
        title = "Birds and Boba for CPW 2026"

        [[slides]]
        MultipleChoice = { title = "What is this bird species?", media = { Image = { Url = { alt = "", url = "21617416afc593a8e621c30d152b1b0b0486201a.jpg" } } }, introduce_question = 5000, time_limit = 30000, points_awarded = 1000, answers = [ { content = { Text = "Common Grackle" }, correct = true }, { content = { Text = "American Crow" }, correct = false }, { content = { Text = "Common Raven" }, correct = false }, { content = { Text = "Cooper's Hawk" }, correct = false } ] }
        `;

      const parsed = parse(input);

      // inlineTableStart = 0: Everything inline, [[slides]] collapses to an inline array
      const result0 = stringify(parsed, { inlineTableStart: 0 });
      expect(result0).toEqual(dedent`
        title = "Birds and Boba for CPW 2026"
        slides = [ { MultipleChoice = { title = "What is this bird species?", media = { Image = { Url = { alt = "", url = "21617416afc593a8e621c30d152b1b0b0486201a.jpg" } } }, introduce_question = 5000, time_limit = 30000, points_awarded = 1000, answers = [ { content = { Text = "Common Grackle" }, correct = true }, { content = { Text = "American Crow" }, correct = false }, { content = { Text = "Common Raven" }, correct = false }, { content = { Text = "Cooper's Hawk" }, correct = false } ] } } ]
        ` + '\n'
      );

      // inlineTableStart = 1: [[slides]] as table array section, MultipleChoice stays inline
      const result1 = stringify(parsed, { inlineTableStart: 1 });
      expect(result1).toEqual(dedent`
        title = "Birds and Boba for CPW 2026"

        [[slides]]
        MultipleChoice = { title = "What is this bird species?", media = { Image = { Url = { alt = "", url = "21617416afc593a8e621c30d152b1b0b0486201a.jpg" } } }, introduce_question = 5000, time_limit = 30000, points_awarded = 1000, answers = [ { content = { Text = "Common Grackle" }, correct = true }, { content = { Text = "American Crow" }, correct = false }, { content = { Text = "Common Raven" }, correct = false }, { content = { Text = "Cooper's Hawk" }, correct = false } ] }
        ` + '\n'
      );

      // inlineTableStart = 2: [[slides]] and [slides.MultipleChoice] as sections, deeper nesting stays inline
      const result2 = stringify(parsed, { inlineTableStart: 2 });
      expect(result2).toEqual(dedent`
        title = "Birds and Boba for CPW 2026"

        [[slides]]

        [slides.MultipleChoice]
        title = "What is this bird species?"
        media = { Image = { Url = { alt = "", url = "21617416afc593a8e621c30d152b1b0b0486201a.jpg" } } }
        introduce_question = 5000
        time_limit = 30000
        points_awarded = 1000
        answers = [ { content = { Text = "Common Grackle" }, correct = true }, { content = { Text = "American Crow" }, correct = false }, { content = { Text = "Common Raven" }, correct = false }, { content = { Text = "Cooper's Hawk" }, correct = false } ]
        ` + '\n'
      );

      // inlineTableStart = 3: [[slides]], [slides.MultipleChoice] and [slides.MultipleChoice.media] as sections
      const result3 = stringify(parsed, { inlineTableStart: 3 });
      expect(result3).toEqual(dedent`
        title = "Birds and Boba for CPW 2026"

        [[slides]]

        [slides.MultipleChoice]
        title = "What is this bird species?"

        introduce_question = 5000
        time_limit = 30000
        points_awarded = 1000
        answers = [ { content = { Text = "Common Grackle" }, correct = true }, { content = { Text = "American Crow" }, correct = false }, { content = { Text = "Common Raven" }, correct = false }, { content = { Text = "Cooper's Hawk" }, correct = false } ]

        [slides.MultipleChoice.media]
        Image = { Url = { alt = "", url = "21617416afc593a8e621c30d152b1b0b0486201a.jpg" } }
        ` + '\n'
      );
    });
  });
});