import patch from '../patch';
import { parse, stringify } from '../';
import dedent from 'dedent';

/* The TOML spec allows extraneous spacing between the key and the dot 
   for dotted keys. This is not recommended, but it is allowed.

   When adding a new dotted key to an existing TOML document, the spacing of and obvious
   styling should be preserved. There might be cases where the appropriate spacing
   is not obvious, but the patcher should try to preserve the existing spacing as 
   much as possible.
   
  //TODO: add more tests with space before and or after the dot. Try with many spaces.
  // Also try tests where the table name is a dotted key with spacing, and 
  // the new table should then have a similar spacing (to be confirmed).

*/
describe('patching dotted keys with extranous spacing', () => {

  test.fails('editing a key with spacing preserves the spacing', () => {
    const src = dedent`
      fruit. color = "yellow"
    `;

    const obj = parse(src) as any;
    //Edit fruit.color to "green"
    obj.fruit.color = "green";
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      fruit. color = "green"
    `);
  });

  test.fails('adding a new dotted key with spacing to an existing dotted key with spacing', () => {
    const src = dedent`
      fruit. color = "yellow"
    `;

    const obj = parse(src) as any;
    //Add fruit.flavor to the object
    obj.fruit.flavor = "banana";
    const result = patch(src, obj);
    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      fruit. color = "yellow"
      fruit. flavor = "banana"
    `);
  });

  test.fails('single key added to indented single key with spacing', () => {
    // fruit. color = "yellow"     # same as fruit.color
    //fruit . flavor = "banana"   # same as fruit.flavor
    const src = [
      '    fruit. color = "yellow"',
    ].join('\n')
    const obj = parse(src) as any;
    //Add fruit.flavor to the object
    obj.fruit.flavor = "banana";
    expect(patch(src, obj, { indentWidth: 4 })).toEqual([
      '    fruit. color = "yellow"',
      '    fruit. flavor = "banana"',
    ].join('\n'));  
  });

});