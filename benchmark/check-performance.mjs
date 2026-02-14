#!/usr/bin/env node
/**
 * Check benchmark performance against baseline
 * Fails if performance regression > 10%
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGRESSION_THRESHOLD = 0.9; // Fail if performance < 90% of baseline

/**
 * Extract ratio from markdown benchmark file
 */
function extractRatio(markdownPath) {
  if (!existsSync(markdownPath)) {
    return null;
  }

  const content = readFileSync(markdownPath, 'utf8');
  const lines = content.split('\n');
  
  // Locate the benchmark table header that includes a Ratio column
  const headerIdx = lines.findIndex(
    (line) => line.includes('| Benchmark |') && line.includes('| Ratio |'),
  );

  if (headerIdx === -1) {
    console.warn(`⚠️  No Ratio column found in benchmark table in ${markdownPath}`);
    return null;
  }

  const headerLine = lines[headerIdx];
  const headerColumns = headerLine
    .split('|')
    .map((col) => col.trim())
    .filter((col) => col);

  // Find the index of the Ratio column (ignore markdown styling)
  const ratioColumnIndex = headerColumns.findIndex((col) => col.replace(/\*\*/g, '') === 'Ratio');

  if (ratioColumnIndex === -1) {
    console.warn(`⚠️  Table header in ${markdownPath} does not contain a Ratio column`);
    return null;
  }

  // Find the Average row (starts with | **Average**)
  let avgLine = lines.find((line) => line.trim().startsWith('| **Average**'));

  // If no Average row, use the first data row (single benchmark case)
  if (!avgLine) {
    if (headerIdx + 2 < lines.length) {
      // Data row is 2 lines after header (header, separator, data)
      avgLine = lines[headerIdx + 2];
    }
  }

  if (!avgLine) {
    console.warn(`⚠️  No ratio data row found in ${markdownPath}`);
    return null;
  }

  // Extract the ratio from the Ratio column
  const columns = avgLine
    .split('|')
    .map((col) => col.trim())
    .filter((col) => col);

  if (ratioColumnIndex < 0 || ratioColumnIndex >= columns.length) {
    console.warn(`⚠️  Ratio column index ${ratioColumnIndex} is out of bounds for data row in ${markdownPath}`);
    return null;
  }

  const ratioColumn = columns[ratioColumnIndex];

  // Remove ** markdown and parse
  const ratioStr = ratioColumn.replace(/\*\*/g, '');
  const ratio = parseFloat(ratioStr);

  if (isNaN(ratio)) {
    console.warn(`⚠️  Could not parse ratio value '${ratioStr}' from ${markdownPath}`);
    return null;
  }

  return ratio;
}

function main() {
  const parseFile = join(__dirname, '../benchmark-parse.md');
  const stringifyFile = join(__dirname, '../benchmark-stringify.md');

  let failed = false;
  const results = [];

  // Check parse performance
  const parseRatio = extractRatio(parseFile);
  if (parseRatio !== null) {
    const status = parseRatio >= REGRESSION_THRESHOLD ? '✅' : '❌';
    const pct = ((parseRatio - 1) * 100).toFixed(1);
    const change = parseRatio >= 1 ? `+${pct}%` : `${pct}%`;
    
    console.log(`${status} Parse: ${parseRatio.toFixed(2)}x (${change})`);
    results.push({ type: 'Parse', ratio: parseRatio, passed: parseRatio >= REGRESSION_THRESHOLD });
    
    if (parseRatio < REGRESSION_THRESHOLD) {
      failed = true;
      const regression = ((1 - parseRatio) * 100).toFixed(1);
      console.error(`   ⚠️  Performance regression: ${regression}% slower than baseline`);
    }
  } else {
    console.log(`⏭️  Parse: No benchmark data found`);
  }

  // Check stringify performance
  const stringifyRatio = extractRatio(stringifyFile);
  if (stringifyRatio !== null) {
    const status = stringifyRatio >= REGRESSION_THRESHOLD ? '✅' : '❌';
    const pct = ((stringifyRatio - 1) * 100).toFixed(1);
    const change = stringifyRatio >= 1 ? `+${pct}%` : `${pct}%`;
    
    console.log(`${status} Stringify: ${stringifyRatio.toFixed(2)}x (${change})`);
    results.push({ type: 'Stringify', ratio: stringifyRatio, passed: stringifyRatio >= REGRESSION_THRESHOLD });
    
    if (stringifyRatio < REGRESSION_THRESHOLD) {
      failed = true;
      const regression = ((1 - stringifyRatio) * 100).toFixed(1);
      console.error(`   ⚠️  Performance regression: ${regression}% slower than baseline`);
    }
  } else {
    console.log(`⏭️  Stringify: No benchmark data found`);
  }

  console.log();

  if (results.length === 0) {
    console.log('ℹ️  No benchmark results found to check');
    process.exit(0);
  }

  if (failed) {
    console.error('❌ Performance check failed: regression threshold exceeded (>10% slower)');
    process.exit(1);
  } else {
    console.log('✅ All performance checks passed!');
    process.exit(0);
  }
}

main();
