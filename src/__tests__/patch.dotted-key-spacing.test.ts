import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';
import { dotted_key_tabs } from '../__fixtures__';

/* The TOML spec allows extraneous spacing between the key and the dot
   for dotted keys. This is not recommended, but it is allowed.

  When adding a new dotted key to an existing TOML document, the spacing and overall
  style should be preserved. There might be cases where the appropriate spacing
   is not obvious, but the patcher should try to preserve the existing spacing as 
   much as possible.
   
  //TODO: add more tests with space before and or after the dot. Try with many spaces.
  // Also try tests where the table name is a dotted key with spacing, and 
  // the new table should then have a similar spacing (to be confirmed).

*/
describe('patching dotted keys with extraneous spacing', () => {

  test('editing a key with spacing preserves the spacing', () => {
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

  test('adding a new dotted key with spacing to an existing dotted key with spacing', () => {
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

  test('single key added to indented single key with spacing', () => {
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

describe('patching dotted keys with tab spacing', () => {

  test('editing a key with tab spacing preserves the spacing', () => {
    const src = dedent`
      fruit\t.\tcolor = "yellow"
    `;

    const obj = parse(src) as any;
    obj.fruit.color = "green";
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      fruit\t.\tcolor = "green"
    `);
  });

  test('adding a new dotted key with tab spacing preserves the spacing', () => {
    const src = dedent`
      fruit\t.\tcolor = "yellow"
    `;

    const obj = parse(src) as any;
    obj.fruit.flavor = "banana";
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      fruit\t.\tcolor = "yellow"
      fruit\t.\tflavor = "banana"
    `);
  });

  test('editing a literal-tab fixture preserves the spacing', () => {
    const obj = parse(dotted_key_tabs) as any;
    obj.fruit.color = "green";
    const result = patch(dotted_key_tabs, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual('fruit\t.\tcolor = "green"');
  });

  test('adding a dotted key to a literal-tab fixture preserves the spacing', () => {
    const obj = parse(dotted_key_tabs) as any;
    obj.fruit.flavor = "banana";
    const result = patch(dotted_key_tabs, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual([
      'fruit\t.\tcolor = "yellow"',
      'fruit\t.\tflavor = "banana"',
    ].join('\n'));
  });

});

describe('patching spaced dotted table titles', () => {

  test('editing a value under a spaced dotted table title preserves the title spacing', () => {
    const src = dedent`
      [fruit .  color .  shade]
      name = "yellow"
    `;

    const obj = parse(src) as any;
    obj.fruit.color.shade.name = 'green';
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [fruit .  color .  shade]
      name = "green"
    `);
  });

  test('adding a row under a spaced dotted table title preserves the title spacing', () => {
    const src = dedent`
      [fruit .  color]
      name = "yellow"
    `;

    const obj = parse(src) as any;
    obj.fruit.color.taste = 'sweet';
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [fruit .  color]
      name = "yellow"
      taste = "sweet"
    `);
  });

  test('renaming the root segment of a spaced dotted table preserves its title spacing', () => {
    const src = dedent`
      # fruit colors
      [fruit .  color]
      name = "yellow"

      [keep]
      value = 1
    `;

    const obj = parse(src) as any;
    const renamedTable = obj.fruit;
    delete obj.fruit;
    obj.plant = renamedTable;
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      # fruit colors
      [plant .  color]
      name = "yellow"

      [keep]
      value = 1
    `);
  });

  test('renaming an intermediate segment of a deep spaced dotted table preserves its title spacing', () => {
    const src = dedent`
      [fruit .  color .  shade]
      name = "yellow"
    `;

    const obj = parse(src) as any;
    const renamedTable = obj.fruit.color;
    delete obj.fruit.color;
    obj.fruit.hue = renamedTable;
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [fruit .  hue .  shade]
      name = "yellow"
    `);
  });

  test('reordering spaced dotted table-array entries keeps each body with its title', () => {
    const src = dedent`
      [[fruit .  color]]
      name = "yellow"

      [[fruit .  color]]
      name = "red"
    `;

    const obj = parse(src) as any;
    obj.fruit.color.reverse();
    const result = patch(src, obj, { updateOrder: true });

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [[fruit .  color]]
      name = "red"

      [[fruit .  color]]
      name = "yellow"
    `);
  });

  test('deleting one child table preserves the remaining spaced dotted tables', () => {
    const src = dedent`
      [fruit .  color]
      name = "yellow"

      [fruit .  color .  shade]
      value = "light"

      [fruit .  color .  tone]
      value = "warm"
    `;

    const obj = parse(src) as any;
    delete obj.fruit.color.shade;
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [fruit .  color]
      name = "yellow"

      [fruit .  color .  tone]
      value = "warm"
    `);
  });

  test('deleting one spaced dotted key-value preserves its sibling separator spacing', () => {
    const src = dedent`
      fruit .  color = "yellow"
      fruit .  flavor = "sweet"
    `;

    const obj = parse(src) as any;
    delete obj.fruit.color;
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      fruit .  flavor = "sweet"
    `);
  });


  
  test('converting a spaced dotted key to a table preserves sibling spacing', () => {
    const src = dedent`
      fruit .  color = "yellow"
      fruit .  flavor = "sweet"
    `;

    const obj = parse(src) as any;
    obj.fruit.color = { rgb: "ff0000", opacity: 1 };
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      fruit .  color = { rgb = "ff0000", opacity = 1 }
      fruit .  flavor = "sweet"
    `);
  });


  test('renaming a spaced dotted table while partially deleting a sibling preserves both changes', () => {
    const src = dedent`
      # fruit colors
      [fruit .  color]
      # keep this row
      name = "yellow"

      [keep]
      value = 1
      remove = true
    `;

    const obj = parse(src) as any;
    const renamedTable = obj.fruit;
    delete obj.fruit;
    obj.plant = renamedTable;
    delete obj.keep.remove;
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      # fruit colors
      [plant .  color]
      # keep this row
      name = "yellow"

      [keep]
      value = 1
    `);
  });

  test('renaming a segment preserves mixed spacing around each dotted separator', () => {
    const src = dedent`
      [fruit . color.  shade]
      name = "yellow"
    `;

    const obj = parse(src) as any;
    const renamedTable = obj.fruit.color.shade;
    delete obj.fruit.color.shade;
    obj.fruit.color.hue = renamedTable;
    const result = patch(src, obj);

    expect(parse(result)).toEqual(obj);
    expect(result).toEqual(dedent`
      [fruit . color.  hue]
      name = "yellow"
    `);
  });

});