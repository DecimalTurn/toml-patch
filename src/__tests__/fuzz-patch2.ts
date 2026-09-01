/**
 * Patch fuzz harness variant that adds spaces around every syntactic dotted-key separator
 * before exercising patch().
 *
 * Usage: npx -y tsx src/__tests__/fuzz-patch2.ts [--count N] [--seed SEED] [--mutations M]
 */
import parseTOML from '../parse-toml';
import traverse from '../traverse';
import { fuzzOne, type PatchFuzzResult } from './fuzz-patch';

function positionOffset(source: string, line: number, column: number): number {
  let currentLine = 1;
  let lineStart = 0;
  for (let index = 0; index < source.length && currentLine < line; index++) {
    if (source[index] === '\n') {
      currentLine++;
      lineStart = index + 1;
    }
  }
  return lineStart + column;
}

/**
 * Adds whitespace around tokenizer-recognized dotted-key separators. Dots inside quoted
 * keys, strings, dates and comments are emitted as part of literal tokens and remain intact.
 */
export function spaceDottedKeySeparators(source: string): string {
  const dotOffsets: number[] = [];
  try {
    traverse(Array.from(parseTOML(source)), {
      Key: (key) => {
        let quote: '"' | "'" | undefined;
        let escaped = false;
        for (let index = 0; index < key.raw.length; index++) {
          const character = key.raw[index];
          if (quote) {
            if (quote === '"' && escaped) escaped = false;
            else if (quote === '"' && character === '\\') escaped = true;
            else if (character === quote) quote = undefined;
            continue;
          }
          if (character === '"' || character === "'") {
            quote = character;
          } else if (character === '.') {
            dotOffsets.push(positionOffset(source, key.loc.start.line, key.loc.start.column + index));
          }
        }
      }
    });
  } catch {
    // The primary harness skips generated documents that do not parse. Keep those
    // documents unchanged so the alternative harness follows the same behavior.
    return source;
  }

  let result = source;
  for (let index = dotOffsets.length - 1; index >= 0; index--) {
    const offset = dotOffsets[index];
    result = `${result.slice(0, offset)} . ${result.slice(offset + 1)}`;
  }
  return result;
}

export function fuzzOne2(seed: number, mutationCount: number): PatchFuzzResult {
  return fuzzOne(seed, mutationCount, spaceDottedKeySeparators);
}

function main(): void {
  const args = process.argv.slice(2);
  const param = (name: string, def: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? parseInt(args[index + 1], 10) : def;
  };
  const count = param('count', 200);
  const startSeed = param('seed', 0);
  const mutations = param('mutations', 3);

  console.log(`Patch-fuzzing spaced dotted keys: ${count} seeds (${mutations} mutations each)...`);

  let tested = 0;
  let skipped = 0;
  const failures: PatchFuzzResult[] = [];
  for (let index = 0; index < count; index++) {
    const seed = startSeed + index;
    const result = fuzzOne2(seed, mutations);
    if (result.status === 'ok' && result.mutationDescs && result.mutationDescs.length > 0) {
      tested++;
    } else if (result.status === 'ok') {
      skipped++;
    } else {
      tested++;
      failures.push(result);
      console.log(`FAIL [seed=${seed}]: ${result.status} - ${result.error}`);
    }

    if ((index + 1) % 50 === 0) {
      console.log(`  Progress: ${index + 1}/${count}, tested: ${tested}, failures: ${failures.length}`);
    }
  }

  console.log(`Patch fuzz complete: ${tested} tested, ${skipped} skipped, ${failures.length} failures`);
  if (failures.length > 0) process.exit(1);
}

if (import.meta.main) {
  main();
}
