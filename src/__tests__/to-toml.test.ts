import toTOML from '../to-toml';
import parseTOML from '../parse-toml';
import { example, kitchen_sink, hard_example, hard_example_unicode } from '../__fixtures__';
import dedent from 'dedent';
import { TomlFormat } from '../toml-format';

test('it should convert ast to toml', () => {
  expect(toTOML(parseTOML(example), new TomlFormat())).toEqual(example);
});

test('it should convert kitchen sink', () => {
  expect(toTOML(parseTOML(kitchen_sink), new TomlFormat())).toEqual(kitchen_sink);
});

test('it should convert hard examples', () => {
  expect(toTOML(parseTOML(hard_example), new TomlFormat())).toEqual(hard_example);
  expect(toTOML(parseTOML(hard_example_unicode), new TomlFormat())).toEqual(hard_example_unicode);
});


test('it should convert simple examples 1', () => {
  const simpleToml = dedent`
    bar = "baz"

    [foo]
    a = "b"
    ` + '\n';

  let intermediate = parseTOML(simpleToml);
  expect(toTOML(intermediate, new TomlFormat())).toEqual(simpleToml);

  
});
