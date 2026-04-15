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
  
  // TOML 1.1.0 exclusions (features that became valid in 1.1.0)
  // See https://github.com/toml-lang/toml-test/blob/main/version.go
  'datetime/no-secs', // Times without seconds are now valid
  'local-time/no-secs', // Times without seconds are now valid
  'local-datetime/no-secs', // Times without seconds are now valid
  'string/basic-byte-escapes', // \x is now valid in 1.1.0
  'inline-table-trailing-comma', // TOML 1.1.0 allows trailing commas
  'inline-table/linebreak-01', // Newlines in inline tables are now allowed
  'inline-table/linebreak-02', // Newlines in inline tables are now allowed
  'inline-table/linebreak-03', // Newlines in inline tables are now allowed
  'inline-table/linebreak-04', // Newlines in inline tables are now allowed
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
    expect(parse(input, { integersAsBigInt: false })).toEqual(expected);
  });
});

test('toml-test - integer/long preserves full precision by default', async () => {
  const input = await readFile('submodules/toml-test/tests/valid/integer/long.toml', 'utf8');
  const actual = parse(input);

  expect(actual).toEqual({
    'int64-max': BigInt('9223372036854775807'),
    'int64-max-neg': BigInt('-9223372036854775808'),
  });
});

// Generate tests for spec-test valid
spec_test.forEach(([name, input_file, expected_file]) => {
  const testFn = SKIPPED_VALID_TESTS.includes(name as string) ? test.skip : test;
  testFn(`spec-test - ${name}`, async () => {
    const input = await readFile(input_file, 'utf8');
    const expected = load(await readFile(expected_file, 'utf8'));
    const actual = parse(input, { integersAsBigInt: false });
    expect(actual).toEqual(expected);
  });
});

// Encoding tests that contain raw invalid UTF-8 bytes must be read as a Buffer
// so the byte-level validator in parse() can reject them before JS decodes them.
const ENCODING_TESTS = new Set([
  'encoding/bad-utf8-in-string',
  'encoding/bad-utf8-in-string-literal',
  'encoding/bad-utf8-in-multiline',
  'encoding/bad-utf8-in-multiline-literal',
  'encoding/bad-utf8-in-comment',
  'encoding/bad-codepoint',
]);

// Generate tests for toml-test invalid
toml_invalid.forEach(([name, input_file]) => {
  const testFn = SKIPPED_TESTS.includes(name as string) ? test.skip : test;
  testFn(`toml-test invalid - ${name}`, async () => {
    if (ENCODING_TESTS.has(name as string)) {
      // Read as raw bytes so the UTF-8 validator can inspect the byte sequences
      // before they are replaced by the JS string decoder.
      const input = await readFile(input_file);
      expect(() => parse(input)).toThrow();
    } else {
      const input = await readFile(input_file, 'utf8');
      expect(() => parse(input)).toThrow();
    }
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
