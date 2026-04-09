#!/usr/bin/env node
// Decoder script for https://github.com/toml-lang/toml-test
//
// Reads a TOML document from stdin as raw bytes, then outputs the
// toml-test tagged JSON format to stdout. Exits with code 1 on error.
//
// Reading as raw bytes (rather than a pre-decoded string) means the
// TextDecoder fatal mode in parse() will reject any invalid UTF-8
// sequences before parsing begins.

import { parseTOML, LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './dist/toml-patch.js';

const NodeType = {
  Table: 'Table',
  TableArray: 'TableArray',
  KeyValue: 'KeyValue',
  String: 'String',
  Integer: 'Integer',
  Float: 'Float',
  Boolean: 'Boolean',
  DateTime: 'DateTime',
  InlineArray: 'InlineArray',
  InlineTable: 'InlineTable',
  Comment: 'Comment',
};

function tagValue(node) {
  switch (node.type) {
    case NodeType.String:
      return { type: 'string', value: node.value };

    case NodeType.Integer:
      return { type: 'integer', value: node.value.toString() };

    case NodeType.Float: {
      const v = node.value;
      if (isNaN(v)) return { type: 'float', value: 'nan' };
      if (v === Infinity) return { type: 'float', value: 'inf' };
      if (v === -Infinity) return { type: 'float', value: '-inf' };
      // Preserve the decimal even for whole-number floats (e.g. 1.0)
      const s = v.toString();
      return { type: 'float', value: s.includes('.') || s.includes('e') ? s : s + '.0' };
    }

    case NodeType.Boolean:
      return { type: 'bool', value: node.value.toString() };

    case NodeType.DateTime:
      return tagDate(node.value);

    case NodeType.InlineArray:
      return node.items.map(item => tagValue(item.item));

    case NodeType.InlineTable:
      return tagItems(node.items.map(item => item.item));

    default:
      throw new Error(`Unexpected value node type: ${node.type}`);
  }
}

function tagDate(date) {
  if (date instanceof OffsetDateTime) {
    return { type: 'datetime', value: date.toISOString() };
  }
  if (date instanceof LocalDateTime) {
    return { type: 'datetime-local', value: date.toISOString() };
  }
  if (date instanceof LocalDate) {
    return { type: 'date-local', value: date.toISOString() };
  }
  if (date instanceof LocalTime) {
    return { type: 'time-local', value: date.toISOString() };
  }
  // Fallback for plain Date (offset datetime)
  return { type: 'datetime', value: date.toISOString() };
}

function tagItems(keyValues) {
  const result = {};
  for (const kv of keyValues) {
    if (kv.type !== NodeType.KeyValue) continue;
    const keys = kv.key.value;
    let target = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) target[keys[i]] = {};
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = tagValue(kv.value);
  }
  return result;
}

  // Walk the top-level AST blocks into a nested result object
function tagAST(ast) {
  const result = {};

  for (const block of ast) {
    if (block.type === NodeType.Comment) continue;

    if (block.type === NodeType.Table) {
      const keys = block.key.item.value;
      active = ensurePath(result, keys);
      for (const row of block.items) {
        if (row.type === NodeType.KeyValue) {
          setNestedKey(active, row.key.value, tagValue(row.value));
        }
      }
      continue;
    }

    if (block.type === NodeType.TableArray) {
      const keys = block.key.item.value;
      const parentPath = keys.slice(0, -1);
      const arrayKey = keys[keys.length - 1];
      const parent = ensurePath(result, parentPath);
      if (!Array.isArray(parent[arrayKey])) parent[arrayKey] = [];
      const entry = {};
      parent[arrayKey].push(entry);
      active = entry;
      for (const row of block.items) {
        if (row.type === NodeType.KeyValue) {
          setNestedKey(active, row.key.value, tagValue(row.value));
        }
      }
      continue;
    }

    if (block.type === NodeType.KeyValue) {
      setNestedKey(result, block.key.value, tagValue(block.value));
    }
  }

  return result;
}

function ensurePath(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (!(k in cur)) cur[k] = {};
    // If it's an array (table-array), follow the last element
    cur = Array.isArray(cur[k]) ? cur[k][cur[k].length - 1] : cur[k];
  }
  return cur;
}

function setNestedKey(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in cur)) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// Read stdin as raw bytes so the UTF-8 validator runs before parsing
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const bytes = Buffer.concat(chunks);

  let str;
  try {
    // fatal: true rejects any invalid UTF-8 byte sequences
    str = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    process.stderr.write(`invalid UTF-8: ${e.message}\n`);
    process.exit(1);
  }

  try {
    const tagged = tagAST(parseTOML(str));
    process.stdout.write(JSON.stringify(tagged, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
});
