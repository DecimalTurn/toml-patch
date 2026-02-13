export interface Location {
  start: Position;
  end: Position;
}

export interface Position {
  // Note: line is 1-indexed while column is 0-indexed
  // Index is UTF-16 based (from cursor), but column display uses code points for UX
  line: number;
  column: number;
}

export interface Span {
  lines: number;
  columns: number;
}

export function getSpan(location: Location): Span {
  return {
    lines: location.end.line - location.start.line + 1,
    columns: location.end.column - location.start.column
  };
}

export type Locator = (start: number, end: number) => Location;
export function createLocate(input: string): Locator {
  const lines = findLines(input);

  return (start: number, end: number) => {
    return {
      start: findPosition(lines, start),
      end: findPosition(lines, end)
    };
  };
}

export function findPosition(input: string | number[], index: number): Position {
  // abc\ndef\ng
  // 0123 4567 8
  //      012
  //           0
  //
  // lines = [3, 7, 9]
  //
  // c = 2: 0 -> 1, 2 - (undefined + 1 || 0) = 2
  //     3: 0 -> 1, 3 - (undefined + 1 || 0) = 3
  // e = 5: 1 -> 2, 5 - (3 + 1 || 0) = 1
  // g = 8: 2 -> 3, 8 - (7 + 1 || 0) = 0

  const lines = Array.isArray(input) ? input : findLines(input);

  // Binary search: find first line_index where lines[line_index] >= index
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid] < index) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const line = lo + 1;
  const column = index - (lines[line - 2] + 1 || 0);

  return { line, column };
}

export function getLine(input: string, position: Position): string {
  const lines = findLines(input);

  const start = lines[position.line - 2] !== undefined ? lines[position.line - 2] + 1 : 0;
  const end = lines[position.line - 1] || input.length;

  return input.substring(start, end);
}

export function findLines(input: string): number[] {
  const indexes: number[] = [];

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '\n') {
      indexes.push(i);
    } else if (char === '\r') {
      // Handle \r\n as a single line break
      if (input[i + 1] === '\n') {
        indexes.push(i + 1); // Position after \r\n
        i++; // Skip the \n
      } else {
        indexes.push(i);
      }
    }
  }
  indexes.push(input.length);

  return indexes;
}

export function clonePosition(position: Position): Position {
  return { line: position.line, column: position.column };
}

export function cloneLocation(location: Location): Location {
  return { start: clonePosition(location.start), end: clonePosition(location.end) };
}
/**
 * Returns a Position at line 1, column 0.
 * This means that lines are 1-indexed and columns are 0-indexed.
 * 
 * @returns A Position at line 1, column 0
 */
export function zero(): Position {
  return { line: 1, column: 0 };
}
