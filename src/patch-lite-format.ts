import {
  DEFAULT_NEWLINE,
  DEFAULT_TRAILING_NEWLINE,
  DEFAULT_TRAILING_COMMA,
  DEFAULT_BRACKET_SPACING,
  DEFAULT_INLINE_TABLE_START,
  DEFAULT_TRUNCATE_ZERO_TIME_IN_DATES,
  DEFAULT_USE_TABS_FOR_INDENTATION,
  DEFAULT_MINIMUM_DECIMALS,
  DEFAULT_LEADING_BOM
} from './toml-format';

// Minimal formatting shape needed by patch-lite internals.
// This intentionally avoids the full TomlFormat class API.
export interface PatchLiteFormat {
  newLine: string;
  trailingNewline: number;
  trailingComma: boolean;
  bracketSpacing: boolean;
  leadingBom: boolean;
  inlineTableStart?: number;
  truncateZeroTimeInDates?: boolean;
  useTabsForIndentation?: boolean;
  minimumDecimals?: number;
}

export function createDefaultPatchLiteFormat(): PatchLiteFormat {
  return {
    newLine: DEFAULT_NEWLINE,
    trailingNewline: DEFAULT_TRAILING_NEWLINE,
    trailingComma: DEFAULT_TRAILING_COMMA,
    bracketSpacing: DEFAULT_BRACKET_SPACING,
    leadingBom: DEFAULT_LEADING_BOM,
    inlineTableStart: DEFAULT_INLINE_TABLE_START,
    truncateZeroTimeInDates: DEFAULT_TRUNCATE_ZERO_TIME_IN_DATES,
    useTabsForIndentation: DEFAULT_USE_TABS_FOR_INDENTATION,
    minimumDecimals: DEFAULT_MINIMUM_DECIMALS
  };
}
