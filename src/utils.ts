// Returns the detected newline (\n or \r\n) from a string, defaulting to \n
export function detectNewline(str: string): string {
  const lfIndex = str.indexOf('\n');
  if (lfIndex > 0 && str.substring(lfIndex - 1, lfIndex) === '\r') {
    return '\r\n';
  }
  return '\n';
}

// Counts consecutive trailing newlines at the end of a string
export function countTrailingNewlines(str: string, newlineChar: string): number {
  let count = 0;
  let pos = str.length;
  while (pos >= newlineChar.length) {
    if (str.substring(pos - newlineChar.length, pos) === newlineChar) {
      count++;
      pos -= newlineChar.length;
    } else {
      break;
    }
  }
  return count;
}
export function last<TValue>(values: TValue[]): TValue | undefined {
  return values[values.length - 1];
}

export type BlankObject = { [key: string]: any };

export function blank(): BlankObject {
  return Object.create(null);
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isInteger(value: any): value is number {
  return typeof value === 'number' && value % 1 === 0 && isFinite(value) && !Object.is(value, -0);
}

export function isFloat(value: any): value is number {
  return typeof value === 'number' && (!isInteger(value) || !isFinite(value) || Object.is(value, -0));
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function isDate(value: any): value is Date {
  return Object.prototype.toString.call(value) === '[object Date]';
}

export function isObject(value: any): boolean {
  return value && typeof value === 'object' && !isDate(value) && !Array.isArray(value);
}

export function isIterable<T>(value: any): value is Iterable<T> {
  return value != null && typeof value[Symbol.iterator] === 'function';
}

export function has(object: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function arraysEqual<TItem>(a: TItem[], b: TItem[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

export function datesEqual(a: any, b: any): boolean {
  return isDate(a) && isDate(b) && a.toISOString() === b.toISOString();
}

export function pipe<TValue>(value: TValue, ...fns: Array<(value: TValue) => TValue>): TValue {
  return fns.reduce((value, fn) => fn(value), value);
}

export function stableStringify(object: any): string {
  if (isObject(object)) {
    const key_values = Object.keys(object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`);

    return `{${key_values.join(',')}}`;
  } else if (Array.isArray(object)) {
    return `[${object.map(stableStringify).join(',')}]`;
  } else {
    return JSON.stringify(object);
  }
}

export function merge<TValue>(target: TValue[], values: TValue[]) {
  // __mutating__: merge values into target
  // Reference: https://dev.to/uilicious/javascript-array-push-is-945x-faster-than-array-concat-1oki
  const original_length = target.length;
  const added_length = values.length;
  target.length = original_length + added_length;

  for (let i = 0; i < added_length; i++) {
    target[original_length + i] = values[i];
  }
}
