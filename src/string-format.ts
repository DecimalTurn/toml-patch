// TOML string types: basic, literal, multiline basic, multiline literal

import { NodeType } from "./ast";

// This module provides the type definitions and functions for generating TOML string types.
// Note that theses types are raw, meaning they include the quotes and any necessary escaping.

export type StringValue = {
  raw: string;
  value: string;
};

export class BasicString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  constructor(public raw: string) {
    // Remove the surrounding quotes to get the value
    this.value = raw.slice(1, -1);
  }
}

export class MultilineBasicString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  constructor(public raw: string) {
    // Remove the surrounding triple quotes to get the value
    this.value = raw.slice(3, -3);
    this.hasLineEndingBackslash = detectLineContinuation(this);
  }
  hasLineEndingBackslash: boolean 
}

export class LiteralString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  constructor(public raw: string) {
    // Remove the surrounding single quotes to get the value
    this.value = raw.slice(1, -1);
  }
}

export class MultilineLiteralString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  constructor(public raw: string) {
    // Remove the surrounding triple single quotes to get the value
    this.value = raw.slice(3, -3);
  }
  
}

export function detectLineContinuation(
  stringValue: MultilineBasicString
): boolean {
  // Line continuation is indicated by an odd number of backslashes at the end of any line
  return /\\(?:\\\\)*$/m.test(stringValue.value);
}

export function createString(raw: string): StringValue {
  if (raw.startsWith("'''")) {
    return new MultilineLiteralString(raw);
  } else if (raw.startsWith('"""')) {
      return new MultilineBasicString(raw);
  } else if (raw.startsWith("'")) {
    return new LiteralString(raw);
  } else if (raw.startsWith('"')) {
      return new BasicString(raw);
  } else {
    throw new Error(`Invalid string raw value: ${raw}`);
  }
}