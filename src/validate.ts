//import { Document } from './types';

import {
    isKeyValue,
    WithItems,
    KeyValue,
    isTable,
    TreeNode,
    Document,
    isDocument,
    Block,
    NodeType,
    isTableArray,
    isInlineArray,
    hasItem,
    InlineItem,
    AST,
    InlineArray,
    InlineTable,
    DateTime,
    Integer,
    String
  } from './ast';
import traverse from './traverse';

export function validate(document: Document) {

    // traverse the document to check if there is a inline array
    // if yes, make sure that the loc.end.columns is bigger than the loc.end.column of the last item
	// same for inline tables
	// If yes, the inline array/table is valid
	// If not, throw an error

    traverse(document, {
        [NodeType.InlineArray](node : InlineArray) {
            const { start, end } = node.loc;
            // We check the last items's loc.end.column and the inline array's loc.end.column
            const lastItem = node.items[node.items.length - 1];
            if (lastItem.loc.end.column >= end.column) {
                const stringRepresentation = node.items
                    .map((item) => (item.item as String | Integer | DateTime).raw)
                    .join(', ') + "\n" + "Elements (<start,end>):" + node.items
                    .map((item) => ("<" + item.item.loc.start.column + "-" + item.item.loc.end.column + ">")) + "\n" + 
                    "Inline array loc: <" + start.column + "-" + end.column + ">" + "\n" +
                    "Expecped end column: " + (lastItem.loc.end.column + 1) + "\n" + 
                    "Difference: " + (lastItem.loc.end.column - end.column) + "\n";

                throw new Error(`Invalid inline array: ${stringRepresentation}`);
            }
        },
        [NodeType.InlineTable](node : InlineTable) {
            const { start, end } = node.loc;
            const lastItem = node.items[node.items.length - 1];
            if (lastItem.loc.end.column >= end.column) {
                const stringRepresentation = "[" + node.items.map((item) => item.item.key + "=" + item.item.value ).join(', ') + "]";
                throw new Error(`Invalid inline table: ${stringRepresentation}`);
            }
        },
    });

}

