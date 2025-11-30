import toTOML from '../to-toml';
import parseTOML from '../parse-toml';
import { example, kitchen_sink, hard_example, hard_example_unicode } from '../__fixtures__';
import dedent from 'dedent';
import { TomlFormat } from '../toml-format';

test('it should convert ast to toml', () => {
  expect(toTOML(parseTOML(example), TomlFormat.defaultFormat())).toEqual(example);
});

test('it should convert kitchen sink', () => {
  expect(toTOML(parseTOML(kitchen_sink), TomlFormat.defaultFormat())).toEqual(kitchen_sink);
});

test('it should convert hard examples', () => {
  expect(toTOML(parseTOML(hard_example), TomlFormat.defaultFormat())).toEqual(hard_example);
  expect(toTOML(parseTOML(hard_example_unicode), TomlFormat.defaultFormat())).toEqual(hard_example_unicode);
});


test('it should convert simple examples 1', () => {
  const simpleToml = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  let intermediate = parseTOML(simpleToml);
  expect(toTOML(intermediate, TomlFormat.defaultFormat())).toEqual(simpleToml);

  
});
