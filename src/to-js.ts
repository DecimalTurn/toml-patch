import { Value, NodeType, TreeNode, AST, isInlineTable } from './ast';
import traverse from './traverse';
import { last, blank, isDate, has } from './utils';
import ParseError from './parse-error';
import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './date-format';

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
  let active: any = result;
  let previous_active: any;
  let skip_depth = 0;

  traverse(ast, {
    [NodeType.Table](node) {
      const key = node.key.item.value;
      try {
        validateKey(result, key, node.type, { tables, table_arrays, defined });
      } catch (err) {
        const e = err as Error;
        throw new ParseError(input, node.key.loc.start, e.message);
      }

      const joined_key = joinKey(key);
      tables.add(joined_key);
      defined.add(joined_key);

      active = ensureTable(result, key);
    },

    [NodeType.TableArray](node) {
      const key = node.key.item.value;

      try {
        validateKey(result, key, node.type, { tables, table_arrays, defined });
      } catch (err) {
        const e = err as Error;
        throw new ParseError(input, node.key.loc.start, e.message);
      }

      const joined_key = joinKey(key);
      table_arrays.add(joined_key);
      defined.add(joined_key);

      active = ensureTableArray(result, key);
    },

    [NodeType.KeyValue]: {
      enter(node) {
        if (skip_depth > 0) return;

        const key = node.key.value;
        try {
          validateKey(active, key, node.type, { tables, table_arrays, defined });
        } catch (err) {
          const e = err as Error;
          throw new ParseError(input, node.key.loc.start, e.message);
        }

        const value = toValue(node.value);
        const target = key.length > 1 ? ensureTable(active, key.slice(0, -1)) : active;

        target[last(key)!] = value;
        defined.add(joinKey(key));
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

      node.items.forEach(({ item }) => {
        const key = item.key.value;
        const value = toValue(item.value);

        const target = key.length > 1 ? ensureTable(result, key.slice(0, -1)) : result;
        target[last(key)!] = value;
      });

      return result;

    case NodeType.InlineArray:
      return node.items.map(item => toValue(item.item as Value));

    case NodeType.DateTime:
      if (node.value instanceof LocalDate || 
          node.value instanceof LocalTime || 
          node.value instanceof LocalDateTime || 
          node.value instanceof OffsetDateTime) {
        return new Date(node.value.valueOf());
      }
      else {
        console.warn('Warning: DateTime value is not a recognized custom date class, returning as-is:', node.value);
        return node.value;
      }

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
  key: string[],
  type: NodeType.Table | NodeType.TableArray | NodeType.KeyValue,
  state: { tables: Set<string>; table_arrays: Set<string>; defined: Set<string> }
) {
  // 1. Cannot override primitive value
  let parts: string[] = [];
  let index = 0;
  for (const part of key) {
    parts.push(part);

    if (!has(object, part)) return;
    if (isPrimitive(object[part])) {
      throw new Error(`Invalid key, a value has already been defined for ${parts.join('.')}`);
    }

    const joined_parts = joinKey(parts);
    if (Array.isArray(object[part]) && !state.table_arrays.has(joined_parts)) {
      throw new Error(`Invalid key, cannot add to a static array at ${joined_parts}`);
    }

    const next_is_last = index++ < key.length - 1;
    object = Array.isArray(object[part]) && next_is_last ? last(object[part]) : object[part];
  }

  const joined_key = joinKey(key);

  // 2. Cannot override table
  if (object && type === NodeType.Table && state.defined.has(joined_key)) {
    throw new Error(`Invalid key, a table has already been defined named ${joined_key}`);
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
