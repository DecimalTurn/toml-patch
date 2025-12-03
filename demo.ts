// The goal of this file is to explore the different ways the AST is built when parsing TOML files vs parsing JS objects.


import parseJS from './src/parse-js';
import toTOML from './src/to-toml';
import { TomlFormat } from './src/toml-format';


// First thing, we look at how a JS object is parsed into an AST when it has nested objects.

const jsObject = {
  top: {
    name: "example",
    nested: {
      key: "value"
    }
  }
};

const ast = parseJS(jsObject);
const fmt = new TomlFormat();
const str = toTOML(ast.items, fmt);

console.log(JSON.stringify(ast, null, 2));
// Write to file:
import { writeFileSync } from 'fs';
writeFileSync('ast-output.json', JSON.stringify(ast, null, 2));
writeFileSync('toml-output.toml', str);

//Conclusion: The default formatting for a nested table will be to appear as an inline table:
/*eg.:
[top]
name = "example"
nested = { key = "value" }
*/

// Next, we look at how a TOML file with nested tables is parsed into an AST. From toml-input.toml
import parseTOML from './src/parse-toml';
import { readFileSync } from 'fs';

const tomlInput = readFileSync('toml-input.toml', 'utf-8');
console.log('TOML Input:', tomlInput);
const astGenerator = parseTOML(tomlInput);
// Collect all blocks from the generator into a Document
const blocks = Array.from(astGenerator);
const astFromToml = {
  type: 'Document',
  items: blocks,
  loc: blocks.length > 0 ? {
    start: blocks[0].loc.start,
    end: blocks[blocks.length - 1].loc.end
  } : { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
};
console.log('AST from TOML:', astFromToml);
const strFromToml = toTOML(blocks, fmt);

console.log('Writing AST to file:', JSON.stringify(astFromToml, null, 2));
writeFileSync('ast-from-toml-output.json', JSON.stringify(astFromToml, null, 2));
writeFileSync('toml-from-toml-output.toml', strFromToml);