import { Value, NodeType, TreeNode, AST, InlineTable } from './ast';
import traverse from './traverse';
import { last, blank, isDate, has } from './utils';
import ParseError from './parse-error';

/**
 * Recursively tracks all nested inline tables within an inline table.
 * This ensures that nested inline tables like { nest = {} } are also tracked as immutable.
 */
function trackNestedInlineTables(inlineTable: InlineTable, basePath: string[], inlineTables: Set<string>) {
  for (const item of inlineTable.items) {
    const keyValue = item.item;
    const fullPath = basePath.concat(keyValue.key.value);
    
    if (keyValue.value.type === NodeType.InlineTable) {
      inlineTables.add(joinKey(fullPath));
      // Recursively track nested inline tables
      trackNestedInlineTables(keyValue.value, fullPath, inlineTables);
    }
  }
}

/**
 * Converts the given AST to a JavaScript object.
 * 
 * @param ast The abstract syntax tree to convert.
 * @param input The original input string (used for error reporting).
 * @returns The JavaScript object representation of the AST.
 */
export default function toJS(ast: AST, input: string = ''): any {
  const result = blank();
  const tables: Set<string> = new Set();
  const table_arrays: Set<string> = new Set();
  const defined: Set<string> = new Set();
  const implicit_tables: Set<string> = new Set();
  const inline_tables: Set<string> = new Set();
  let active: any = result;
  let previous_active: any;
  let skip_depth = 0;
  let active_path: string[] = [];

  traverse(ast, {
    [NodeType.Table](node) {
      const key = node.key.item.value;
      try {
        validateKey(result, [], key, node.type, { tables, table_arrays, defined, implicit_tables, inline_tables });
      } catch (err) {
        const e = err as Error;
        throw new ParseError(input, node.key.loc.start, e.message);
      }

      const joined_key = joinKey(key);
      tables.add(joined_key);
      defined.add(joined_key);

      active = ensureTable(result, key);
      active_path = key;
    },

    [NodeType.TableArray](node) {
      const key = node.key.item.value;

      try {
        validateKey(result, [], key, node.type, { tables, table_arrays, defined, implicit_tables, inline_tables });
      } catch (err) {
        const e = err as Error;
        throw new ParseError(input, node.key.loc.start, e.message);
      }

      const joined_key = joinKey(key);
      table_arrays.add(joined_key);
      defined.add(joined_key);

      active = ensureTableArray(result, key);
      active_path = key;
    },

    [NodeType.KeyValue]: {
      enter(node) {
        if (skip_depth > 0) return;

        const key = node.key.value;
        try {
          validateKey(active, active_path, key, node.type, {
            tables,
            table_arrays,
            defined,
            implicit_tables,
            inline_tables
          });
        } catch (err) {
          const e = err as Error;
          throw new ParseError(input, node.key.loc.start, e.message);
        }

        // Track implicit tables created by dotted keys.
        // Example: within [fruit], `apple.color = ...` implicitly defines tables `fruit.apple`.
        // Example: `type.name = ...` implicitly defines table `product.type`.
        if (key.length > 1) {
          for (let i = 1; i < key.length; i++) {
            const implicit = joinKey(active_path.concat(key.slice(0, i)));
            implicit_tables.add(implicit);
            defined.add(implicit);
          }
        }

        let value;
        try {
          value = toValue(node.value);
        } catch (err) {
          // Convert plain Errors from toValue() to ParseErrors with location info
          const e = err as Error;
          throw new ParseError(input, node.value.loc.start, e.message);
        }
        
        // Inline tables are immutable in TOML: once defined, they cannot be extended.
        // Track their key path so later dotted keys can be rejected.
        if (node.value.type === NodeType.InlineTable) {
          const base_path = active_path.concat(key);
          inline_tables.add(joinKey(base_path));
          // Also track nested inline tables within this inline table
          trackNestedInlineTables(node.value, base_path, inline_tables);
        }
        const target = key.length > 1 ? ensureTable(active, key.slice(0, -1)) : active;

        target[last(key)!] = value;
        defined.add(joinKey(active_path.concat(key)));
      }
    },

    [NodeType.InlineTable]: {
      enter() {
        // Handled by toValue
        skip_depth++;
      },
      exit() {
        skip_depth--;
      }
    }
  });

  return result;
}

export function toValue(node: Value): any {
  switch (node.type) {
    case NodeType.InlineTable:
      const result = blank();
      const defined_keys = new Set<string>();
      const defined_prefixes = new Map<string, string>(); // prefix -> one of the full keys that uses it

      node.items.forEach(({ item }) => {
        const key = item.key.value;
        const value = toValue(item.value);

        // Check for duplicate keys and conflicting key paths
        const full_key = joinKey(key);
        
        // Check if this exact key was already defined
        if (defined_keys.has(full_key)) {
          throw new Error(`Duplicate key "${full_key}" in inline table`);
        }
        
        // Check if any prefix of this key conflicts with an existing key
        // e.g., if "a.b" is defined, we can't later define "a.b.c" (would overwrite the value)
        for (let i = 1; i < key.length; i++) {
          const prefix = joinKey(key.slice(0, i));
          if (defined_keys.has(prefix)) {
            throw new Error(`Key "${full_key}" conflicts with already defined key "${prefix}" in inline table`);
          }
        }
        
        // Check if this key is a prefix of an already defined key
        // e.g., if "a.b.c" is defined, we can't later define "a.b" (would overwrite the table)
        if (defined_prefixes.has(full_key)) {
          const existing = defined_prefixes.get(full_key)!;
          throw new Error(`Key "${full_key}" conflicts with already defined key "${existing}" in inline table`);
        }
        
        defined_keys.add(full_key);
        
        // Track all prefixes of this key
        for (let i = 1; i < key.length; i++) {
          const prefix = joinKey(key.slice(0, i));
          if (!defined_prefixes.has(prefix)) {
            defined_prefixes.set(prefix, full_key);
          }
        }

        const target = key.length > 1 ? ensureTable(result, key.slice(0, -1)) : result;
        target[last(key)!] = value;
      });

      return result;

    case NodeType.InlineArray:
      return node.items.map(item => toValue(item.item as Value));

    case NodeType.DateTime:
      // Preserve TOML date/time custom classes so format is retained when
      // round-tripping through stringify() (e.g. date-only, time-only, local vs offset).
      // These classes extend Date, so JS users can still treat them as Dates.
      return node.value;

    case NodeType.String:
    case NodeType.Integer:
    case NodeType.Float:
    case NodeType.Boolean:
      return node.value;

    default:
      throw new Error(`Unrecognized value type "${(node as TreeNode).type}"`);
  }
}

function validateKey(
  object: any,
  prefix: string[],
  key: string[],
  type: NodeType.Table | NodeType.TableArray | NodeType.KeyValue,
  state: {
    tables: Set<string>;
    table_arrays: Set<string>;
    defined: Set<string>;
    implicit_tables: Set<string>;
    inline_tables: Set<string>;
  }
) {
  const full_key = prefix.concat(key);
  const joined_full_key = joinKey(full_key);

  // 0. Inline tables are immutable.
  // Once a key is assigned an inline table, it cannot be extended by dotted keys or table headers.
  // (toml-test invalid: spec-1.1.0/common-49-0, inline-table/overwrite-02, inline-table/overwrite-05)
  if (type === NodeType.KeyValue && key.length > 1) {
    for (let i = 1; i < key.length; i++) {
      const candidate = joinKey(prefix.concat(key.slice(0, i)));
      if (state.inline_tables.has(candidate)) {
        throw new Error(`Invalid key, cannot extend an inline table at ${candidate}`);
      }
    }
  }
  
  // Also check if a table header tries to extend an inline table
  if ((type === NodeType.Table || type === NodeType.TableArray) && state.inline_tables.has(joined_full_key)) {
    throw new Error(`Invalid key, cannot extend an inline table at ${joined_full_key}`);
  }
  
  // Check if table header path contains an inline table
  if (type === NodeType.Table || type === NodeType.TableArray) {
    for (let i = 1; i < key.length; i++) {
      const candidate = joinKey(prefix.concat(key.slice(0, i)));
      if (state.inline_tables.has(candidate)) {
        throw new Error(`Invalid key, cannot extend an inline table at ${candidate}`);
      }
    }
  }

  // 0a. Dotted key-value assignments cannot traverse into an array-of-tables.
  // This would be ambiguous (which element?) and is rejected by toml-test's
  // append-with-dotted-keys fixtures.
  if (type === NodeType.KeyValue && key.length > 1) {
    for (let i = 1; i < key.length; i++) {
      const candidate = joinKey(prefix.concat(key.slice(0, i)));
      if (state.table_arrays.has(candidate)) {
        throw new Error(`Invalid key, cannot traverse into an array of tables at ${candidate}`);
      }
    }
  }

  // 0b. Tables created implicitly by dotted keys cannot be re-opened via table headers.
  // (toml-test invalid: spec-1.1.0/common-46-0 and common-46-1)
  if ((type === NodeType.Table || type === NodeType.TableArray) && state.implicit_tables.has(joined_full_key)) {
    throw new Error(`Invalid key, a table has already been defined implicitly named ${joined_full_key}`);
  }

  // 0c. A table path cannot later be re-assigned as a value.
  // Example: `type.name = "Nail"` then `type = { edible = false }` is invalid.
  // Example: `a.b.c = 1` then `a.b = 2` is invalid (a.b was implicitly created as a table).
  // (toml-test invalid: spec-1.1.0/common-50-0, table/append-with-dotted-keys-05)
  if (type === NodeType.KeyValue && state.implicit_tables.has(joined_full_key)) {
    throw new Error(`Invalid key, a table has already been defined named ${joined_full_key}`);
  }

  // 0d. Dotted keys cannot extend tables that were explicitly defined earlier.
  // Example: `[a.b.c]` followed by `[a]` then `b.c.t = "value"` is invalid.
  // (toml-test invalid: table/append-with-dotted-keys-01, table/append-with-dotted-keys-02)
  if (type === NodeType.KeyValue && key.length > 1) {
    for (let i = 1; i <= key.length; i++) {
      const candidate = joinKey(prefix.concat(key.slice(0, i)));
      if (state.tables.has(candidate)) {
        throw new Error(`Invalid key, cannot add to an explicitly defined table ${candidate} using dotted keys`);
      }
    }
  }

  // 1. Cannot override primitive value
  let parts: string[] = [];
  let index = 0;
  for (const part of key) {
    parts.push(part);

    if (!has(object, part)) return;
    if (isPrimitive(object[part])) {
      const fullKey = joinKey(prefix.concat(parts));
      throw new Error(`Invalid key, a value has already been defined for ${fullKey}`);
    }

    const joined_parts = joinKey(prefix.concat(parts));
    if (Array.isArray(object[part]) && !state.table_arrays.has(joined_parts)) {
      throw new Error(`Invalid key, cannot add to a static array at ${joined_parts}`);
    }

    const next_is_last = index++ < key.length - 1;
    object = Array.isArray(object[part]) && next_is_last ? last(object[part]) : object[part];
  }

  const joined_key = joined_full_key;

  // 2. Cannot override table
  if (object && type === NodeType.Table && state.defined.has(joined_key)) {
    throw new Error(`Invalid key, a table has already been defined named ${joined_key}`);
  }

  // 2b. Cannot assign a value to a path that is already a table (explicit or implicit).
  if (object && type === NodeType.KeyValue && key.length === 1 && state.defined.has(joined_key)) {
    // If the path exists as a structured value, overriding it is invalid.
    if (!isPrimitive(object)) {
      throw new Error(`Invalid key, a table has already been defined named ${joined_key}`);
    }
  }

  // 3. Cannot add table array to static array or table
  if (object && type === NodeType.TableArray && !state.table_arrays.has(joined_key)) {
    throw new Error(`Invalid key, cannot add an array of tables to a table at ${joined_key}`);
  }
}

function ensureTable(object: any, key: string[]): any {
  const target = ensure(object, key.slice(0, -1));
  const last_key = last(key)!;
  if (!target[last_key]) {
    target[last_key] = blank();
  }

  return target[last_key];
}

function ensureTableArray(object: any, key: string[]): any {
  const target = ensure(object, key.slice(0, -1));
  const last_key = last(key)!;
  if (!target[last_key]) {
    target[last_key] = [];
  }

  const next = blank();
  target[last(key)!].push(next);

  return next;
}

function ensure(object: any, keys: string[]): any {
  return keys.reduce((active, subkey) => {
    if (!active[subkey]) {
      active[subkey] = blank();
    }
    return Array.isArray(active[subkey]) ? last(active[subkey]) : active[subkey];
  }, object);
}

function isPrimitive(value: any) {
  return typeof value !== 'object' && !isDate(value);
}

function joinKey(key: string[]): string {
  return key.join('.');
}
