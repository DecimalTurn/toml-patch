import { promisify } from 'util';
import { join, basename } from 'path';
import { readFile as _readFile, existsSync, readFileSync } from 'fs';
import { sync as glob } from 'glob';
import { load } from 'js-yaml';
import { parse } from '../src/';

const readFile = promisify(_readFile);

// TOML version to test against (1.0.0 or 1.1.0)
const TOML_VERSION = '1.1.0';

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
    if (!existsSync(expected)) return;

    return [name, input, expected];
  })
  .filter(Boolean) as Array<string[]>;

const spec_test_pattern = 'submodules/spec-tests/values/*.toml';
const spec_test_input = glob(spec_test_pattern);

const spec_test = spec_test_input
  .map(input => {
    const name = basename(input, '.toml');
    const expected = join('submodules/spec-tests/values', `${name}.yaml`);
    if (!existsSync(expected)) return;

    return [name, input, expected];
  })
  .filter(Boolean) as Array<string[]>;

const toml_invalid_pattern = 'submodules/toml-test/tests/invalid/**/*.toml';
const toml_invalid_input = glob(toml_invalid_pattern).filter(isIncludedInVersion);

const toml_invalid = toml_invalid_input.map(input => {
  const relativePath = input.replace('submodules/toml-test/tests/invalid/', '');
  const name = relativePath.replace('.toml', '');
  return [name, input];
}) as Array<string[]>;

const spec_invalid_pattern = 'submodules/spec-tests/errors/*.toml';
const spec_invalid_input = glob(spec_invalid_pattern);

const spec_invalid = spec_invalid_input.map(input => {
  const name = basename(input, '.toml');
  return [name, input];
}) as Array<string[]>;

test.each(toml_test)('toml-test - %s', async (_name, input_file, expected_file) => {
  const input = await readFile(input_file, 'utf8');
  const expected = expandJSON(JSON.parse(await readFile(expected_file, 'utf8')));

  expect(parse(input)).toEqual(expected);
});

test.each(spec_test)('spec-test - %s', async (_name, input_file, expected_file) => {
  const input = await readFile(input_file, 'utf8');
  const expected = load(await readFile(expected_file, 'utf8'));

  const actual = parse(input);
  expect(actual).toEqual(expected);
});

test.each(toml_invalid)('toml-test invalid - %s', async (_name, input_file) => {
  const input = await readFile(input_file, 'utf8');
  expect(() => parse(input)).toThrow();
});

test.each(spec_invalid)('spec-test invalid - %s', async (_name, input_file) => {
  const input = await readFile(input_file, 'utf8');
  expect(() => parse(input)).toThrow();
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
  } else if (value.type === 'array') {
    return value.value.map(expandJSONValue);
  } else if (value.type === 'datetime') {
    return new Date(value.value);
  } else if (value.type === 'datetime-local') {
    return new Date(value.value);
  } else if (value.type === 'date') {
    return new Date(`${value.value}T00:00:00.000Z`);
  } else if (value.type === 'time') {
    return new Date(`0000-01-01T${value.value}`);
  } else if (value.type === 'string') {
    return value.value;
  } else if (value.type === 'float') {
    // Handle special float values: inf, -inf, nan
    if (value.value === 'inf') {
      return Infinity;
    } else if (value.value === '-inf') {
      return -Infinity;
    } else if (value.value === 'nan') {
      return NaN;
    }
    return Number(value.value);
  } else if (value.type === 'integer') {
    return Number(value.value);
  } else if (value.type === 'bool') {
    return value.value === 'true';
  } else if (!('type' in value)) {
    return expandJSON(value);
  } else {
    throw new Error(`Unknown type "${value.type}"`);
  }
}
