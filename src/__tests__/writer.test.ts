import { insert, applyWrites } from '../writer';
import toTOML from '../to-toml';
import {
  generateInlineArray,
  generateKeyValue,
  generateInlineItem,
  generateString,
  generateDocument
} from '../generate';
import { TomlFormat } from '../toml-format';

test('it should insert elements into empty inline array', () => {
  const inline_array = generateInlineArray();
  const key_value = generateKeyValue(['a'], inline_array);
  const ast = [key_value];
  const format = TomlFormat.defaultFormat();

  expect(toTOML(ast, format)).toEqual(`a = []\n`);

  insert(key_value, inline_array, generateInlineItem(generateString('b')));
  applyWrites(key_value);

  expect(toTOML(ast, format)).toEqual(`a = ["b"]\n`);

  insert(key_value, inline_array, generateInlineItem(generateString('c')));
  insert(key_value, inline_array, generateInlineItem(generateString('d')));
  insert(key_value, inline_array, generateInlineItem(generateString('e')));
  applyWrites(key_value);

  expect(toTOML(ast, format)).toEqual(`a = ["b", "c", "d", "e"]\n`);
});

test('it should insert first item on first line in document', () => {
  const document = generateDocument();
  const item = generateKeyValue(['a'], generateString('b'));
  const format = TomlFormat.defaultFormat();

  insert(document, document, item);

  expect(toTOML(document.items, format)).toEqual(`a = "b"\n`);
});
