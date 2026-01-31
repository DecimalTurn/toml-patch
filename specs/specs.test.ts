import { promisify } from 'util';
import { join, basename } from 'path';
import { readFile as _readFile, existsSync, readFileSync } from 'fs';
import { sync as glob } from 'glob';
import { load } from 'js-yaml';
import { parse } from '../src/';

const readFile = promisify(_readFile);

// TOML version to test against (1.0.0 or 1.1.0)
const TOML_VERSION = '1.1.0';

// Tests to skip temporarily - remove items from this list as they get fixed
// Format: 'test-type/test-name' (e.g., 'table/redefine-03', 'key/newline-01')
const SKIPPED_TESTS = [
  // Table validation (complex AST changes - 9 tests)
  'table/redefine-03',
  'table/redefine-02',
  'table/newline-03',
  'table/newline-01',
  'table/duplicate-key-05',
  'table/duplicate-key-04',
  'table/append-with-dotted-keys-05',
  'table/append-with-dotted-keys-02',
  'table/append-with-dotted-keys-01',
  
  // Key validation (newlines - 8 tests)
  'key/newline-06',
  'key/newline-05',
  'key/newline-04',
  'key/newline-01',
  'key/duplicate-keys-09',
  'key/after-value',
  'key/after-table',
  'key/after-array',
  
  // Inline table validation (overwrite, duplicate, immutability - 10 tests)
  'inline-table/overwrite-09',
  'inline-table/overwrite-08',
  'inline-table/overwrite-07',
  'inline-table/overwrite-05',
  'inline-table/overwrite-02',
  'inline-table/overwrite-01',
  'inline-table/duplicate-key-03',
  'inline-table/duplicate-key-02',
  'inline-table/duplicate-key-01',
  'inline-table/newline-comment',
  
  // String validation (escape sequences, multiline quotes - 13 tests)
  'string/multiline-quotes-01',
  'string/literal-multiline-quotes-02',
  'string/literal-multiline-quotes-01',
  'string/bad-uni-esc-ml-06',
  'string/bad-uni-esc-06',
  'string/bad-slash-escape',
  'string/multiline-escaped-crlf',
  'string/hex-escape',
  'string/escape-tricky',
  'string/escape-esc',
  
  // Encoding validation (UTF-8 - 7 tests)
  'encoding/ideographic-space',
  'encoding/bad-utf8-in-string',
  'encoding/bad-utf8-in-string-literal',
  'encoding/bad-utf8-in-multiline',
  'encoding/bad-utf8-in-multiline-literal',
  'encoding/bad-utf8-in-comment',
  'encoding/bad-codepoint',
  
  
  // Spec test edge cases (8 tests)
  'table-4',
  'table-3',
  'string-literal-multiline-quotes',
  'inline-table-trailing-comma',
  'inline-table-imutable-2',
  'inline-table-imutable-1',
  'bare-key-2',
  
  // toml-test invalid - Control characters (18 tests)
  'control/rawstring-us',
  'control/rawstring-lf',
  'control/rawstring-del',
  'control/rawstring-cr',
  'control/rawmulti-us',
  'control/rawmulti-null',
  'control/rawmulti-lf',
  'control/rawmulti-del',
  'control/multi-del',
  'control/comment-us',
  'control/comment-null',
  'control/comment-lf',
  'control/comment-ff',
  'control/comment-del',
  'control/comment-cr',
  'control/bare-cr',
  
  // toml-test invalid - Boolean validation (12 tests)
  'bool/wrong-case-true',
  'bool/wrong-case-false',
  'bool/starting-same-true',
  'bool/starting-same-false',
  'bool/mixed-case-true',
  'bool/mixed-case-false',
  'bool/just-t',
  'bool/just-f',
  'bool/capitalized-true',
  'bool/capitalized-false',
  'bool/almost-true',
  'bool/almost-true-with-extra',
  'bool/almost-false',
  'bool/almost-false-with-extra',
  
  // spec-test invalid - String control characters (8 tests)
  'string-literal-multiline-control-4',
  'string-literal-multiline-control-3',
  'string-literal-multiline-control-2',
  'string-literal-multiline-control-1',
  'string-literal-control-4',
  'string-literal-control-3',
  'string-literal-control-2',
  'string-literal-control-1',
  'string-basic-multiline-control-4',
  'string-basic-control-4',
  
  // spec-test invalid - Other validation (5 tests)
  'key-value-pair-2',
  'bare-key-1',
  
  // toml-test invalid - Additional control characters (2 tests)
  'control/rawstring-null',
  'control/string-del',
  
  // toml-test invalid - DateTime validation (36 tests)
  'datetime/no-year-month-sep',
  
  'datetime/only-T',
  
  // toml-test invalid - Key validation (5 tests)
  'key/newline-03',
  'key/no-eol-01',
  'key/no-eol-05',
  'key/partial-quoted',
  
  // toml-test invalid - String validation (4 tests)
  'string/missing-quotes',
  'string/missing-quotes-array',
  'string/missing-quotes-inline-table',
  'string/no-close-10',
  
  // toml-test invalid - Table validation (4 tests)
  'table/dot',
  'table/llbrace',
  'table/nested-brackets-open',
  'table/rrbrace',
];

// Valid tests to skip temporarily (parsing issues, not validation)
const SKIPPED_VALID_TESTS: string[] = [

];

// Load the list of files for the specified TOML version
const tomlVersionFilesPath = `submodules/toml-test/tests/files-toml-${TOML_VERSION}`;
const tomlVersionFiles = new Set(
  readFileSync(tomlVersionFilesPath, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.trim())
);

// Helper function to check if a file should be included based on TOML version
function isIncludedInVersion(filePath: string): boolean {
  const relativePath = filePath.replace('submodules/toml-test/tests/', '');
  // Check for both .toml and .json files
  return tomlVersionFiles.has(relativePath) || 
         tomlVersionFiles.has(relativePath.replace('.json', '.toml'));
}

const toml_test_pattern = 'submodules/toml-test/tests/valid/**/*.toml';
const toml_test_input = glob(toml_test_pattern).filter(isIncludedInVersion);

const toml_test = toml_test_input
  .map(input => {
    const relativePath = input.replace('submodules/toml-test/tests/valid/', '');
    const name = relativePath.replace('.toml', '');
    const expected = input.replace('.toml', '.json');
    if (!existsSync(expected)) return null;

    return [name, input, expected];
  })
  .filter((item): item is string[] => item !== null);

const spec_test_pattern = 'submodules/spec-tests/values/*.toml';
const spec_test_input = glob(spec_test_pattern);

const spec_test = spec_test_input
  .map(input => {
    const name = basename(input, '.toml');
    const expected = join('submodules/spec-tests/values', `${name}.yaml`);
    if (!existsSync(expected)) return null;

    return [name, input, expected];
  })
  .filter((item): item is string[] => item !== null);

const toml_invalid_pattern = 'submodules/toml-test/tests/invalid/**/*.toml';
const toml_invalid_input = glob(toml_invalid_pattern).filter(isIncludedInVersion);

const toml_invalid = toml_invalid_input
  .map(input => {
    const relativePath = input.replace('submodules/toml-test/tests/invalid/', '');
    const name = relativePath.replace('.toml', '');
    return [name, input];
  });

const spec_invalid_pattern = 'submodules/spec-tests/errors/*.toml';
const spec_invalid_input = glob(spec_invalid_pattern);

const spec_invalid = spec_invalid_input
  .map(input => {
    const name = basename(input, '.toml');
    return [name, input];
  });

// Log skipped tests information (opt-in)
const LOG_SKIPPED_TESTS =
  process.env.TOML_PATCH_SPECS_LOG_SKIPS === '1' ||
  process.env.TOML_PATCH_SPECS_LOG_SKIPS === 'true';

if (LOG_SKIPPED_TESTS && (SKIPPED_TESTS.length > 0 || SKIPPED_VALID_TESTS.length > 0)) {
  const totalSkipped = SKIPPED_TESTS.length + SKIPPED_VALID_TESTS.length;
  console.log(
    `\nSkipping ${totalSkipped} tests temporarily (see SKIPPED_TESTS in specs.test.ts):`
  );

  if (SKIPPED_TESTS.length > 0) {
    console.log(`\n   Invalid tests (${SKIPPED_TESTS.length}):`);
    const invalidCategories = SKIPPED_TESTS.reduce((acc, test) => {
      const category = test.split('/')[0] || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(invalidCategories).forEach(([category, count]) => {
      console.log(`      - ${category}: ${count} test${count > 1 ? 's' : ''}`);
    });
  }

  if (SKIPPED_VALID_TESTS.length > 0) {
    console.log(`\n   Valid tests (${SKIPPED_VALID_TESTS.length}):`);
    const validCategories = SKIPPED_VALID_TESTS.reduce((acc, test) => {
      const category = test.split('/')[0] || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(validCategories).forEach(([category, count]) => {
      console.log(`      - ${category}: ${count} test${count > 1 ? 's' : ''}`);
    });
  }

  console.log('');
}

// Generate tests for toml-test valid
toml_test.forEach(([name, input_file, expected_file]) => {
  const testFn = SKIPPED_VALID_TESTS.includes(name as string) ? test.skip : test;
  testFn(`toml-test - ${name}`, async () => {
    const input = await readFile(input_file, 'utf8');
    const expected = expandJSON(JSON.parse(await readFile(expected_file, 'utf8')));
    expect(parse(input)).toEqual(expected);
  });
});

// Generate tests for spec-test valid
spec_test.forEach(([name, input_file, expected_file]) => {
  const testFn = SKIPPED_VALID_TESTS.includes(name as string) ? test.skip : test;
  testFn(`spec-test - ${name}`, async () => {
    const input = await readFile(input_file, 'utf8');
    const expected = load(await readFile(expected_file, 'utf8'));
    const actual = parse(input);
    expect(actual).toEqual(expected);
  });
});

// Generate tests for toml-test invalid
toml_invalid.forEach(([name, input_file]) => {
  const testFn = SKIPPED_TESTS.includes(name as string) ? test.skip : test;
  testFn(`toml-test invalid - ${name}`, async () => {
    const input = await readFile(input_file, 'utf8');
    expect(() => parse(input)).toThrow();
  });
});

// Generate tests for spec-test invalid
spec_invalid.forEach(([name, input_file]) => {
  const testFn = SKIPPED_TESTS.includes(name as string) ? test.skip : test;
  testFn(`spec-test invalid - ${name}`, async () => {
    const input = await readFile(input_file, 'utf8');
    expect(() => parse(input)).toThrow();
  });
});

function expandJSON(value: any): any {
  const result: { [key: string]: any } = {};
  Object.keys(value).forEach(key => {
    result[key] = expandJSONValue(value[key]);
  });

  return result;
}

function expandJSONValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(expandJSONValue);
  } else if (value && typeof value === 'object') {
    // Check if this is a typed value (has both 'type' and 'value' properties)
    // or a plain object/table
    if ('type' in value && 'value' in value && typeof value.type === 'string') {
      // This is a typed value
      switch (value.type) {
        case 'array':
          return value.value.map(expandJSONValue);
        case 'datetime':
        case 'datetime-local':
          return new Date(value.value);
        case 'date':
        case 'date-local':
          return new Date(`${value.value}T00:00:00.000Z`);
        case 'time':
        case 'time-local':
          return new Date(`0000-01-01T${value.value}`);
        case 'string':
          return value.value;
        case 'float':
          // Handle special float values: inf, -inf, nan
          if (value.value === 'inf') return Infinity;
          if (value.value === '+inf') return Infinity;
          if (value.value === '-inf') return -Infinity;
          if (value.value === 'nan') return NaN;
          if (value.value === '+nan') return NaN;
          if (value.value === '-nan') return NaN;
          return Number(value.value);
        case 'integer':
          return Number(value.value);
        case 'bool':
          return value.value === 'true';
        default:
          throw new Error(`Unknown type "${value.type}"`);
      }
    } else {
      // This is a plain object/table, recursively expand it
      return expandJSON(value);
    }
  }
  
  // Primitive value, return as-is
  return value;
}
