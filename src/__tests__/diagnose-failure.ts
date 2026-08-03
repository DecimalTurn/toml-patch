/**
 * Quick diagnostic: reproduce a specific failure and show exactly what differs.
 * Usage: npx tsx src/__tests__/diagnose-failure.ts <seed>
 */
import { randomToml } from '../randomizer';
import { parse, stringify } from '../';

const seed = parseInt(process.argv[2] || '0', 10);

const generated = randomToml({ seed });
console.log('=== Original TOML ===');
console.log(generated.toml);

const obj1 = parse(generated.toml);

const reStringified = stringify(obj1);
console.log('\n=== Re-stringified TOML ===');
console.log(reStringified);

const obj2 = parse(reStringified);

// Deep compare showing differences
function diffPaths(a: any, b: any, path = ''): string[] {
  const diffs: string[] = [];
  
  if (a === b) return diffs;
  
  // NaN check
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return diffs;
  // +0/-0 check
  if (typeof a === 'number' && typeof b === 'number' && a === 0 && b === 0) return diffs;
  
  if (a == null || b == null) {
    diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return diffs;
  }
  
  if (typeof a !== typeof b) {
    diffs.push(`${path}: type mismatch ${typeof a}(${String(a)}) vs ${typeof b}(${String(b)})`);
    return diffs;
  }
  
  if (a instanceof Date && b instanceof Date) {
    if (a.getTime() !== b.getTime()) {
      diffs.push(`${path}: Date ${a.toISOString()} vs ${b.toISOString()}`);
    }
    return diffs;
  }
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: array length ${a.length} vs ${b.length}`);
    }
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      diffs.push(...diffPaths(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    // BigInt check
    if (typeof a === 'bigint' && typeof b === 'bigint') {
      if (a !== b) diffs.push(`${path}: bigint ${a}n vs ${b}n`);
      return diffs;
    }
    
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    
    // Check for missing keys
    const onlyA = keysA.filter(k => !keysB.includes(k));
    const onlyB = keysB.filter(k => !keysA.includes(k));
    for (const k of onlyA) diffs.push(`${path}.${k}: missing in re-parsed`);
    for (const k of onlyB) diffs.push(`${path}.${k}: extra in re-parsed`);
    
    for (const k of keysA) {
      if (keysB.includes(k)) {
        diffs.push(...diffPaths(a[k], b[k], `${path}.${k}`));
      }
    }
    return diffs;
  }
  
  // Primitive difference
  if (a !== b) {
    diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
  
  return diffs;
}

const diffs = diffPaths(obj1, obj2);
if (diffs.length === 0) {
  console.log('\n=== RESULT: Objects are EQUAL ===');
} else {
  console.log(`\n=== ${diffs.length} DIFFERENCES ===`);
  for (const d of diffs.slice(0, 20)) {
    console.log(`  ${d}`);
  }
  if (diffs.length > 20) console.log(`  ... and ${diffs.length - 20} more`);
}
