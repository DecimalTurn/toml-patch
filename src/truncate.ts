import { AST, Block } from './ast';
import { Position } from './location';

/**
 * Compares two positions to determine their ordering.
 * @param pos1 - First position
 * @param pos2 - Second position
 * @returns Negative if pos1 < pos2, 0 if equal, positive if pos1 > pos2
 */
function comparePositions(pos1: Position, pos2: Position): number {
  if (pos1.line !== pos2.line) {
    return pos1.line - pos2.line;
  }
  return pos1.column - pos2.column;
}

/**
 * Checks if a block node should be included based on its location.
 * A block is included if its end position is before the limit position.
 * This ensures that only complete blocks that don't contain the change are kept.
 * @param node - The block node to check
 * @param limit - The position limit
 * @returns true if the block should be included
 */
function shouldIncludeBlock(node: Block, limit: Position): boolean {
  return comparePositions(node.loc.end, limit) < 0;
}

/**
 * Truncates an AST based on a position (line, column) in the source string.
 * 
 * This function filters the AST to include only the nodes that end before
 * the specified position. This ensures that blocks containing changes are
 * excluded and can be reparsed. This is useful for incremental parsing scenarios
 * where you want to keep only the unchanged portion of the AST.
 * 
 * Special handling: If the truncation point falls within a Table or TableArray
 * (e.g., in a comment inside the table), the entire table is excluded to ensure
 * proper reparsing.
 * 
 * @param ast - The AST to truncate
 * @param line - The line number (1-indexed) at which to truncate
 * @param column - The column number (0-indexed) at which to truncate
 * @returns An object containing the truncated AST and the end position of the last included node
 * 
 * @example
 * ```typescript
 * const ast = parseTOML(tomlString);
 * // Get AST up to line 5, column 10 (only nodes that end before this position)
 * const { truncatedAst, lastEndPosition } = truncateAst(ast, 5, 10);
 * for (const node of truncatedAst) {
 *   // process node
 * }
 * ```
 */
export function truncateAst(ast: AST, line: number, column: number): { 
  truncatedAst: AST; 
  lastEndPosition: Position | null 
} {
  const limit: Position = { line, column };
  const nodes: Block[] = [];
  let lastEndPosition: Position | null = null;
  
  for (const node of ast) {
    const nodeEndsBeforeLimit = comparePositions(node.loc.end, limit) < 0;
    const nodeStartsBeforeLimit = comparePositions(node.loc.start, limit) < 0;
    
    if (nodeEndsBeforeLimit) {
      // Node completely ends before the limit - include it
      nodes.push(node);
      lastEndPosition = node.loc.end;
    } else if (nodeStartsBeforeLimit && !nodeEndsBeforeLimit) {
      // Node starts before the limit but ends at or after it
      // This means the truncation point is within this node
      // For Table/TableArray nodes, don't include them if the change is inside
      // This ensures the entire table gets reparsed
      break;
    } else {
      // Node starts at or after the limit - stop
      break;
    }
  }
  
  return {
    truncatedAst: nodes,
    lastEndPosition
  };
}

/**
 * Finds the last block node in an AST that ends before the specified position.
 * 
 * @param ast - The AST to search
 * @param line - The line number (1-indexed)
 * @param column - The column number (0-indexed)
 * @returns The last block node that ends before the position, or undefined if no such node exists
 * 
 * @example
 * ```typescript
 * const ast = parseTOML(tomlString);
 * const lastNode = findLastNodeBeforePosition(ast, 5, 10);
 * if (lastNode) {
 *   console.log('Last node type:', lastNode.type);
 * }
 * ```
 */
export function findLastNodeBeforePosition(ast: AST, line: number, column: number): Block | undefined {
  const limit: Position = { line, column };
  let lastNode: Block | undefined = undefined;
  
  for (const node of ast) {
    if (shouldIncludeBlock(node, limit)) {
      lastNode = node;
    } else {
      // Once we encounter a node that starts after the limit, we can stop
      break;
    }
  }
  
  return lastNode;
}
