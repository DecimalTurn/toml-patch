export function iterator(value: string): Iterator<string>;
export function iterator<T>(value: Iterable<T>): Iterator<T>;
export function iterator<T>(value: Iterable<T> | string): Iterator<T | string> {
  // NOTE: JavaScript's default string iterator iterates over Unicode code points.
  // This means Cursor.index would count code points, while our locator utilities
  // (see `src/location.ts`) use JS string indices (UTF-16 code units).
  // For non-BMP characters (surrogate pairs), that mismatch produces incorrect
  // token locations.
  //
  // To keep Cursor.index aligned with string indices, iterate strings by UTF-16
  // code units instead.
  if (typeof value === 'string') {
    let index = 0;
    return {
      next(): IteratorResult<string> {
        if (index >= value.length) {
          return { value: undefined as unknown as string, done: true };
        }
        const ch = value.charAt(index);
        index += 1;
        return { value: ch, done: false };
      }
    };
  }

  return value[Symbol.iterator]();
}

/**
 * Cursor<T>
 * 
 * A utility class that wraps an iterator and provides additional functionality
 * such as peeking at the next value without advancing the iterator, tracking
 * the current index, and iterating over the values.
 * 
 * @template T - The type of elements in the iterator.
 * 
 * Properties:
 * - `iterator`: The underlying iterator being wrapped.
 * - `index`: The current index of the iterator (starts at -1).
 * - `value`: The current value of the iterator.
 * - `done`: A boolean indicating whether the iterator is complete.
 * - `peeked`: The result of peeking at the next value without advancing.
 * 
 * Methods:
 * - `next()`: Advances the iterator and returns the next value.
 * - `peek()`: Returns the next value without advancing the iterator.
 * - `[Symbol.iterator]`: Makes the Cursor itself iterable.
 */
export default class Cursor<T> implements Iterator<T | undefined> {
  iterator: Iterator<T>;
  index: number;
  value?: T;
  done: boolean;
  peeked: IteratorResult<T | undefined> | null;

  constructor(iterator: Iterator<T>) {
    this.iterator = iterator;
    this.index = -1;
    this.value = undefined;
    this.done = false;
    this.peeked = null;
  }

  next(): IteratorResult<T | undefined> {
    if (this.done) return done();

    const result = this.peeked || this.iterator.next();

    this.index += 1;
    this.value = result.value;
    this.done = result.done ?? false;
    this.peeked = null;

    return result;
  }

  peek(): IteratorResult<T | undefined> {
    if (this.done) return done();
    if (this.peeked) return this.peeked;

    this.peeked = this.iterator.next();
    return this.peeked;
  }

  [Symbol.iterator]() {
    return this;
  }
}

function done(): IteratorResult<undefined> {
  return { value: undefined, done: true };
}
