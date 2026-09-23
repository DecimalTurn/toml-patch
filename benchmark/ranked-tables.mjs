/**
 * Shared rendering for the per-fixture ranked result tables used by the iarna
 * and smol-toml benchmark summaries.
 *
 * Every fixture gets its own table with one row per implementation, fastest
 * first. Performance is the time per iteration so small documents stay
 * readable, and Slowdown is the ratio against the fastest implementation
 * measured in the same run.
 */

/** Formats a throughput as a time per iteration, in µs or ms. */
export function formatPerformance(hz) {
  if (!hz) return '**DNF**';
  const milliseconds = 1000 / hz;
  return milliseconds < 1
    ? `${(milliseconds * 1000).toFixed(2)} \u00b5s/iter`
    : `${milliseconds.toFixed(2)} ms/iter`;
}

/** Formats the slowdown against the fastest implementation, e.g. `1.44x`. */
export function formatSlowdown(hz, fastestHz) {
  if (!hz || !fastestHz) return '**DNF**';
  return `${(fastestHz / hz).toFixed(2).replace(/\.00$/, '')}x`;
}

/**
 * Builds one fixture's ranked table.
 *
 * @param {object} options
 * @param {string} options.heading - Table heading, e.g. `Parse, 0A-spec-01-example`.
 * @param {Array<{ id: string, label?: string, hz?: number }>} options.rows - One
 *   row per implementation. `id` matches the ratio column, `label` is what the
 *   reader sees and defaults to the id. A missing or zero `hz` is a DNF row.
 * @param {boolean} [options.includeRank] - Adds the medal/number column. The
 *   render order already carries the ranking, so only the smol-toml README
 *   style uses it.
 * @param {{ compareId: string, currentId: string }} [options.ratio] - Adds the
 *   baseline comparison column, filled in on the current build's row.
 * @returns {string} Markdown for the table, ending with a blank line.
 */
export function buildRankedTable({ heading, rows, includeRank = false, ratio }) {
  const ranked = [...rows].sort((left, right) => (right.hz ?? 0) - (left.hz ?? 0));
  const fastestHz = ranked[0]?.hz;
  const compareHz = ratio
    ? ranked.find(({ id }) => id === ratio.compareId)?.hz
    : undefined;

  const headers = [];
  const separators = [];
  if (includeRank) {
    headers.push('');
    separators.push(':--:');
  }
  headers.push('Library', 'Performance', 'Slowdown', 'Notes');
  separators.push('---', '---', '---', '---');
  if (ratio) {
    headers.push('Ratio');
    separators.push('---');
  }

  let markdown = `#### ${heading}\n\n`;
  markdown += '|' + headers.map(header => header === '' ? '    ' : ` ${header} `).join('|') + '|\n';
  markdown += '|' + separators.join('|') + '|\n';

  for (const [index, { id, label, hz }] of ranked.entries()) {
    const cells = [];
    if (includeRank) {
      cells.push(hz ? (index < 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][index] : index + 1) : '-');
    }
    cells.push(label ?? id, formatPerformance(hz), formatSlowdown(hz, fastestHz), '');
    if (ratio) {
      cells.push(id === ratio.currentId && compareHz && hz
        ? (hz / compareHz).toFixed(2)
        : '');
    }
    markdown += '| ' + cells.join(' | ') + ' |\n';
  }

  return markdown + '\n';
}

/**
 * Builds a complete summary document from per-fixture tables.
 *
 * @param {object} options
 * @param {string} options.title - Document title, e.g. `Parse Benchmark Results`.
 * @param {string[]} options.tables - Rendered tables, in report order.
 * @returns {string} Markdown for the whole summary.
 */
export function buildReport({ title, tables }) {
  let markdown = `# ${title}\n\n`;
  markdown += '*Time per iteration. Lower is better.*\n\n';
  for (const table of tables) markdown += table;
  return markdown;
}
