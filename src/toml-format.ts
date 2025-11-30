import {
  KeyValue,
  Table,
  InlineTable,
  TableArray,
  InlineArray,
  isInlineTable,
  isInlineArray,
  isKeyValue,
  Document
} from './ast';
import { generateTable, generateDocument, generateTableArray } from './generate';
import { insert, remove, applyWrites, shiftNode } from './writer';

export class TomlFormat {
  
  // Note that the following options won't be reflected inside the AST. They will after only the stringification process
  newLine: string;
  trailingNewline: number;
  
  // The following options will be reflected inside the AST
  trailingComma?: boolean;
  bracketSpacing?: boolean;

  // These options are not yet implemented
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;

  constructor() {
    // New TomlFormat object should have everything set to empty except for defaults
    this.newLine = '\n';
    this.trailingNewline = 1;
  }
}
export function formatTopLevel(document: Document): Document {
  const move_to_top_level = document.items.filter(item => {
    if (!isKeyValue(item)) return false;

    const is_inline_table = isInlineTable(item.value);
    const is_inline_array =
      isInlineArray(item.value) &&
      item.value.items.length &&
      isInlineTable(item.value.items[0].item);

    return is_inline_table || is_inline_array;
  }) as KeyValue[];

  move_to_top_level.forEach(node => {
    remove(document, document, node);

    if (isInlineTable(node.value)) {
      insert(document, document, formatTable(node));
    } else {
      formatTableArray(node).forEach(table_array => {
        insert(document, document, table_array);
      });
    }
  });

  applyWrites(document);
  return document;
}

function formatTable(key_value: KeyValue): Table {
  const table = generateTable(key_value.key.value);

  for (const item of (key_value.value as InlineTable).items) {
    insert(table, table, item.item);
  }

  applyWrites(table);
  return table;
}

function formatTableArray(key_value: KeyValue): TableArray[] {
  const root = generateDocument();

  for (const inline_array_item of (key_value.value as InlineArray).items) {
    const table_array = generateTableArray(key_value.key.value);
    insert(root, root, table_array);

    for (const inline_table_item of (inline_array_item.item as InlineTable).items) {
      insert(root, table_array, inline_table_item.item);
    }
  }

  applyWrites(root);
  return root.items as TableArray[];
}

export function formatPrintWidth(document: Document, format: TomlFormat): Document {
  // TODO
  return document;
}

export function formatEmptyLines(document: Document): Document {
  let shift = 0;
  let previous = 0;
  for (const item of document.items) {
    if (previous === 0 && item.loc.start.line > 1) {
      // Remove leading newlines
      shift = 1 - item.loc.start.line;
    } else if (item.loc.start.line + shift > previous + 2) {
      shift += previous + 2 - (item.loc.start.line + shift);
    }

    shiftNode(item, {
      lines: shift,
      columns: 0
    });
    previous = item.loc.end.line;
  }

  return document;
}