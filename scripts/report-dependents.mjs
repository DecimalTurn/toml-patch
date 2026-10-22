/**
 * Build a Markdown report of the packages that depend on `@decimalturn/toml-patch`.
 *
 * The script gets dependent package names from npm's paginated dependents pages,
 * then looks up each package in the npm registry. For every package it records
 * the latest version, the dependency range used for `toml-patch`, a normalized
 * GitHub repository URL, and weekly and monthly download counts from the npm
 * downloads API. The report sorts packages by weekly downloads.
 *
 * A JSON cache is used by default. It stores the dependent names and fetched
 * package data so a later run can identify new dependents and fill in values
 * when npm is temporarily unavailable. If npm's dependents pages cannot be
 * read, the script falls back to the names in that cache. If no cache exists,
 * the script reports the npm error instead of using a package list embedded in
 * this file. Missing download counts for existing packages prevent the report
 * from being overwritten, while a new package can be recorded as unavailable
 * until npm publishes download data for it.
 *
 * Run it from the repository root:
 *
 *   node scripts/report-dependents.mjs
 *
 * By default this writes `docs/dependents.md` and `docs/dependents.json`, then
 * opens the Markdown report with the operating system's default application.
 * Use `--help` for the complete option list. The most useful options are:
 *
 *   --package <name>     Report dependents of another npm package.
 *   --output <path>     Write Markdown to a different path.
 *   --cache <path>      Read and write a different JSON cache.
 *   --names-file <path> Use a JSON array or one package name per line.
 *   --no-cache          Ignore the cache and do not write one.
 *
 * The npm requests require network access. A names file is useful when the
 * npm dependents page is unavailable or when the report should cover a fixed
 * set of packages. Use `--refresh-names` to require a live npm refresh instead
 * of falling back to cached names when npm is unavailable.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_PACKAGE = '@decimalturn/toml-patch';
const DEFAULT_OUTPUT = 'docs/dependents.md';
const DEFAULT_CACHE = 'docs/dependents.json';
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_CONCURRENCY = 2;
const DEPENDENTS_PAGE = 'https://www.npmjs.com/browse/depended/';
const REGISTRY = 'https://registry.npmjs.org/';
const DOWNLOADS_API = 'https://api.npmjs.org/downloads/point/';

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const packageName = options.package ?? DEFAULT_PACKAGE;
const cachePath = options.cache ?? DEFAULT_CACHE;
const cache = options.noCache ? undefined : await readCache(cachePath);
const { dependentNames, namesSource, shouldWriteCache } = await resolveDependentNames(packageName, options, cache);
options.namesSource = namesSource;
const report = await buildReport(packageName, dependentNames, options, cache);
if (!options.noCache && shouldWriteCache) {
  await writeFile(cachePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
const outputPath = options.output ?? DEFAULT_OUTPUT;
await writeFile(outputPath, `${toMarkdown(report)}\n`, 'utf8');
await openFile(outputPath);
console.log(`Wrote ${report.count} dependents to ${outputPath}`);

async function openFile(filePath) {
  const absolutePath = resolve(filePath);
  if (process.platform === 'win32') {
    await execFileAsync('cmd.exe', ['/c', 'start', '', absolutePath]);
  } else if (process.platform === 'darwin') {
    await execFileAsync('open', [absolutePath]);
  } else {
    await execFileAsync('xdg-open', [absolutePath]);
  }
}

async function buildReport(packageName, dependentNames, reportOptions, cache) {
  const uniqueNames = [...new Set(dependentNames)].filter((name) => name !== packageName);
  const cachedRows = new Map((cache?.rows ?? []).map((row) => [row.name, row]));
  const rows = await mapWithConcurrency(
    uniqueNames,
    DEFAULT_CONCURRENCY,
    (name) => fetchPackageRow(name, packageName, reportOptions, cachedRows.get(name)),
  );
  const unavailableDownloads = rows
    .filter((row) => row.weeklyDownloads == null || row.monthlyDownloads == null)
    .map((row) => row.name);
  const unavailableExistingDownloads = cache
    ? unavailableDownloads.filter((name) => {
        const cachedRow = cachedRows.get(name);
        return cachedRow?.weeklyDownloads != null || cachedRow?.monthlyDownloads != null;
      })
    : unavailableDownloads;
  if (unavailableExistingDownloads.length > 0) {
    throw new Error(
      `npm download data was unavailable for ${unavailableExistingDownloads.length} existing package(s). ` +
        'The existing report was not overwritten. Retry after the npm API rate limit clears.',
    );
  }
  rows.sort((left, right) => right.weeklyDownloads - left.weeklyDownloads || left.name.localeCompare(right.name));

  return {
    cacheVersion: 1,
    packageName,
    generatedAt: new Date().toISOString(),
    dependentSource: reportOptions.namesSource,
    sourceUrl: dependentPageUrl(packageName),
    cachePath: reportOptions.cache ?? DEFAULT_CACHE,
    dependentNames: rows.map((row) => row.name),
    newSinceLastRun:
      cache && reportOptions.namesSource.startsWith('npm dependents page cache')
        ? cache.newSinceLastRun ?? []
        : cache
          ? uniqueNames.filter((name) => !cache.dependentNames.includes(name))
          : [],
    count: rows.length,
    rows,
  };
}

async function resolveDependentNames(packageName, reportOptions, cache) {
  if (reportOptions.namesFile) {
    return {
      dependentNames: await readNamesFile(reportOptions.namesFile),
      namesSource: `names from ${reportOptions.namesFile}`,
      shouldWriteCache: true,
    };
  }

  try {
    return {
      dependentNames: await fetchDependentNames(packageName),
      namesSource: 'npm dependents pages',
      shouldWriteCache: true,
    };
  } catch (error) {
    if (reportOptions.refreshNames || !cache?.dependentNames?.length) throw error;
    console.warn(
      `Could not refresh dependent names from npm: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.warn(`Using ${cache.dependentNames.length} dependent names from ${cache.generatedAt}.`);
    return {
      dependentNames: cache.dependentNames,
      namesSource: `npm dependents page cache from ${cache.generatedAt}`,
      shouldWriteCache: false,
    };
  }
}

async function fetchDependentNames(packageName) {
  const names = new Set();
  const sourceUrl = dependentPageUrl(packageName);

  for (let offset = 0; offset < 100 * DEFAULT_PAGE_SIZE; offset += DEFAULT_PAGE_SIZE) {
    const html = await fetchText(`${sourceUrl}?offset=${offset}`);
    const pageNames = extractPackageNames(html, packageName);
    for (const name of pageNames) names.add(name);
    if (pageNames.length < DEFAULT_PAGE_SIZE) break;
  }

  if (names.size === 0) {
    throw new Error(`No dependents found at ${sourceUrl}`);
  }

  return [...names];
}

function extractPackageNames(html, packageName) {
  const names = new Set();
  const packageLinkPattern = /href=["'](?:https:\/\/www\.npmjs\.com)?\/package\/([^"'?#]+)/gi;

  for (const match of html.matchAll(packageLinkPattern)) {
    const name = decodeURIComponent(match[1]);
    if (name !== packageName) names.add(name);
  }

  return [...names];
}

async function fetchPackageRow(name, dependencyName, reportOptions, cachedRow) {
  const encodedName = encodeURIComponent(name);
  const metadata = await fetchJson(`${REGISTRY}${encodedName}`);
  const latestVersion = metadata?.['dist-tags']?.latest ?? cachedRow?.latestVersion ?? null;
  const latestMetadata = latestVersion ? metadata.versions?.[latestVersion] : undefined;
  const dependency = findDependency(latestMetadata, dependencyName);
  const repository = normalizeRepository(latestMetadata?.repository ?? metadata?.repository ?? latestMetadata?.homepage) ?? cachedRow?.repository ?? null;
  const [weeklyDownloads, monthlyDownloads] = await Promise.all([
    fetchDownloads('last-week', encodedName),
    fetchDownloads('last-month', encodedName),
  ]);

  return {
    name,
    npmUrl: `https://www.npmjs.com/package/${encodedName}`,
    repository,
    latestVersion,
    dependencyRange: dependency?.range ?? cachedRow?.dependencyRange ?? null,
    dependencyType: dependency?.type ?? cachedRow?.dependencyType ?? null,
    weeklyDownloads: weeklyDownloads.downloads ?? cachedRow?.weeklyDownloads ?? null,
    weeklyStart: weeklyDownloads.start ?? cachedRow?.weeklyStart ?? null,
    weeklyEnd: weeklyDownloads.end ?? cachedRow?.weeklyEnd ?? null,
    monthlyDownloads: monthlyDownloads.downloads ?? cachedRow?.monthlyDownloads ?? null,
    monthlyStart: monthlyDownloads.start ?? cachedRow?.monthlyStart ?? null,
    monthlyEnd: monthlyDownloads.end ?? cachedRow?.monthlyEnd ?? null,
    error: metadata ? null : cachedRow ? 'package metadata cached' : 'package metadata unavailable',
  };
}

function findDependency(metadata, dependencyName) {
  for (const [type, dependencies] of Object.entries({
    dependencies: metadata?.dependencies,
    devDependencies: metadata?.devDependencies,
    peerDependencies: metadata?.peerDependencies,
    optionalDependencies: metadata?.optionalDependencies,
  })) {
    if (dependencies && dependencyName in dependencies) {
      return { type, range: dependencies[dependencyName] };
    }
  }

  return undefined;
}

function normalizeRepository(repository) {
  const value = typeof repository === 'string' ? repository : repository?.url;
  if (!value) return null;

  const match = value.match(/github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:#.*)?$/i);
  return match ? `https://github.com/${match[1]}` : null;
}

async function fetchDownloads(period, encodedName) {
  const data = await fetchJson(`${DOWNLOADS_API}${period}/${encodedName}`, 3);
  return data
    ? { downloads: Number(data.downloads ?? 0), start: data.start ?? null, end: data.end ?? null }
    : { downloads: null, start: null, end: null };
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await mapper(values[index]);
      } catch (error) {
        results[index] = {
          name: values[index],
          npmUrl: `https://www.npmjs.com/package/${encodeURIComponent(values[index])}`,
          repository: null,
          latestVersion: null,
          dependencyRange: null,
          dependencyType: null,
          weeklyDownloads: null,
          weeklyStart: null,
          weeklyEnd: null,
          monthlyDownloads: null,
          monthlyStart: null,
          monthlyEnd: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'toml-patch-dependent-report/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response.text();
}

async function fetchJson(url, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'toml-patch-dependent-report/1.0' },
      });
      if (response.ok) return response.json();
    } catch {
      // Retry transient network and npm API failures before reporting data as unavailable.
    }

    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  return undefined;
}

function dependentPageUrl(packageName) {
  return `${DEPENDENTS_PAGE}${encodeURIComponent(packageName)}`;
}

function toMarkdown(report) {
  const weeklyPeriod = periodLabel(report.rows, 'weeklyStart', 'weeklyEnd');
  const monthlyPeriod = periodLabel(report.rows, 'monthlyStart', 'monthlyEnd');
  const lines = [
    `# Dependents of ${report.packageName}`,
    '',
    `Generated: ${report.generatedAt}`,
    `Dependent names: ${report.dependentSource}`,
    `Source: ${report.sourceUrl}`,
    `Cache: ${report.cachePath}`,
    `Packages in this report: ${report.count}`,
    '',
    `Weekly downloads (${weeklyPeriod}) and monthly downloads (${monthlyPeriod}) come from the npm downloads API or the local cache when npm is unavailable.`,
    'The dependency range is read from the latest published package metadata. When a package does not publish a GitHub repository URL, the repository cell is left blank.',
    '',
    '## New since the last run',
    '',
    report.newSinceLastRun.length === 0
      ? 'No new dependents were found.'
      : `Found ${report.newSinceLastRun.length} new dependent(s).`,
    '',
  ];

  if (report.newSinceLastRun.length > 0) {
    lines.push('| Package | Weekly downloads | Monthly downloads | GitHub repository | Latest version | `toml-patch` range |');
    lines.push('| --- | ---: | ---: | --- | --- | --- |');
    for (const name of report.newSinceLastRun) {
      const row = report.rows.find((candidate) => candidate.name === name);
      if (row) lines.push(markdownRow(row));
    }
    lines.push('');
  }

  lines.push(
    '| Package | Weekly downloads | Monthly downloads | GitHub repository | Latest version | `toml-patch` range |',
    '| --- | ---: | ---: | --- | --- | --- |',
  );

  for (const row of report.rows) {
    lines.push(markdownRow(row));
  }

  return lines.join('\n');
}

function markdownRow(row) {
  return `| [${row.name}](${row.npmUrl}) | ${formatNumber(row.weeklyDownloads)} | ${formatNumber(row.monthlyDownloads)} | ${
    row.repository ? `[GitHub](${row.repository})` : ''
  } | ${row.latestVersion ?? ''} | ${row.dependencyRange ?? row.error ?? ''} |`;
}

function periodLabel(rows, startKey, endKey) {
  const row = rows.find((candidate) => candidate[startKey] && candidate[endKey]);
  return row ? `${row[startKey]} to ${row[endKey]}` : 'period unavailable';
}

function formatNumber(value) {
  return value == null ? 'unavailable' : Number(value).toLocaleString('en-US');
}

async function readNamesFile(filePath) {
  const contents = await readFile(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    const names = JSON.parse(contents);
    if (!Array.isArray(names) || !names.every((name) => typeof name === 'string')) {
      throw new Error(`${filePath} must contain a JSON array of package names`);
    }
    return names;
  }

  return contents.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}

async function readCache(filePath) {
  try {
    const cache = JSON.parse(await readFile(filePath, 'utf8'));
    if (!Array.isArray(cache.dependentNames) || !Array.isArray(cache.rows)) return undefined;
    return cache;
  } catch {
    return undefined;
  }
}

function parseArgs(args) {
  const result = { package: DEFAULT_PACKAGE, output: DEFAULT_OUTPUT };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument === '--output') result.output = args[++index];
    else if (argument === '--cache') result.cache = args[++index];
    else if (argument === '--no-cache') result.noCache = true;
    else if (argument === '--package') result.package = args[++index];
    else if (argument === '--names-file') result.namesFile = args[++index];
    else if (argument === '--refresh-names') result.refreshNames = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function printHelp() {
  console.log(`Usage: node scripts/report-dependents.mjs [options]

Options:
  --output <path>      Markdown output path (default: ${DEFAULT_OUTPUT})
  --cache <path>       JSON cache path (default: ${DEFAULT_CACHE})
  --no-cache            Ignore and do not write the JSON cache
  --package <name>     Package to inspect (default: ${DEFAULT_PACKAGE})
  --names-file <path>  JSON array or newline-separated dependent names
  --refresh-names      Require a fresh read from npm's paginated dependents page
  --help               Show this help

Normal runs read the npm dependents pages first and fall back to the cached snapshot from ${SNAPSHOT_DATE}.
The JSON cache stores names, metadata, and download counts and fills gaps when npm is unavailable.
Package metadata and weekly/monthly download counts are refreshed when npm responds.`);
}
