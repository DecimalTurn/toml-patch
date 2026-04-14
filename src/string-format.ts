// TOML string types: basic, literal, multiline basic, multiline literal

import { NodeType } from "./ast";

// This module provides the type definitions and functions for generating TOML string types.
// Note that theses types are raw, meaning they include the quotes and any necessary escaping.

export type StringValue = {
  raw: string;
  value: string;
  type: 'basic' | 'literal' | 'multiline-basic' | 'multiline-literal';
};

export function rawStringWrapper(raw: string): 
  MultilineBasicString | 
  MultilineLiteralString | 
  LiteralString | 
  BasicString | null 
{
  try {
    return new MultilineLiteralString(raw);
  } catch {
    try {
      return new MultilineBasicString(raw);
    } catch {
      try {
        return new LiteralString(raw);
      } catch {
        try {
          return new BasicString(raw);
        } catch {
          return null;
        }
      }
    }
  }
}

export class BasicString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  type: "basic" = "basic";
  constructor(public raw: string) {
    if (!raw.startsWith('"') || !raw.endsWith('"')) {
      throw new Error(`Invalid basic string raw value: ${raw}`);
    }
    // Remove the surrounding quotes to get the value
    this.value = raw.slice(1, -1);
  }
}

export class MultilineBasicString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  type: "multiline-basic" = "multiline-basic";
  constructor(public raw: string) {
    if (!raw.startsWith('"""') || !raw.endsWith('"""')) {
      throw new Error(`Invalid multiline basic string raw value: ${raw}`);
    }
    // Remove the surrounding triple quotes to get the value
    this.value = raw.slice(3, -3);
    this.hasLineEndingBackslash = detectLineContinuation(this);
  }
  hasLineEndingBackslash: boolean 
  static fromLiteralString(string: LiteralString): MultilineBasicString {
    const escapedValue = string.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const raw = `"""${escapedValue}"""`;
    return new MultilineBasicString(raw); 
  }

  static fromMultilineLiteralString(input: MultilineLiteralString): MultilineBasicString {
    const escapedValue = input.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const raw = `"""${escapedValue}"""`;
    return new MultilineBasicString(raw); 
  }

}
export class LiteralString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  type: "literal" = "literal";
  constructor(public raw: string) {
    if (!raw.startsWith("'") || !raw.endsWith("'")) {
      throw new Error(`Invalid literal string raw value: ${raw}`);
    }
    // Remove the surrounding single quotes to get the value
    this.value = raw.slice(1, -1);
  }
}

export class MultilineLiteralString implements StringValue {
  declare private readonly _nominal: void;
  value: string;
  type: "multiline-literal" = "multiline-literal";
  constructor(public raw: string) {
    if (!raw.startsWith("'''") || !raw.endsWith("'''")) {
      throw new Error(`Invalid multiline literal string raw value: ${raw}`);
    }
    // Remove the surrounding triple single quotes to get the value
    this.value = raw.slice(3, -3);
  }
  
  static fromLiteralString(string: LiteralString): MultilineLiteralString {
    const raw = `'''${string.value}'''`;
    return new MultilineLiteralString(raw);
  }
}

export function detectLineContinuation(
  stringValue: MultilineBasicString
): boolean {
  // Line continuation is indicated by an odd number of backslashes at the end of any line
  return /\\(?:\\\\)*$/m.test(stringValue.value);
}