import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = resolve(repoRoot, 'tmp-test-output.md');
const packageManager = process.env.npm_execpath;
const outputChunks = [];
const ansiColorEmojis = new Map([
  [30, '⬛'],
  [31, '🟥'],
  [32, '🟩'],
  [33, '🟨'],
  [34, '🟦'],
  [35, '🟪'],
  [36, '🔷'],
  [37, '⬜'],
  [90, '🩶'],
  [91, '🟥'],
  [92, '🟩'],
  [93, '🟨'],
  [94, '🟦'],
  [95, '🟪'],
  [96, '🔷'],
  [97, '⬜'],
]);
const ansiColorRgb = new Map([
  [30, [0, 0, 0]],
  [31, [205, 49, 49]],
  [32, [13, 188, 121]],
  [33, [229, 229, 16]],
  [34, [36, 114, 200]],
  [35, [188, 63, 188]],
  [36, [17, 168, 205]],
  [37, [229, 229, 229]],
  [90, [127, 127, 127]],
  [91, [241, 76, 76]],
  [92, [35, 209, 139]],
  [93, [245, 245, 67]],
  [94, [59, 142, 234]],
  [95, [214, 112, 214]],
  [96, [41, 218, 229]],
  [97, [255, 255, 255]],
]);

function nearestAnsiColorCode(red, green, blue) {
  let closestCode = 37;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [code, [colorRed, colorGreen, colorBlue]] of ansiColorRgb) {
    const distance = (red - colorRed) ** 2 + (green - colorGreen) ** 2 + (blue - colorBlue) ** 2;
    if (distance < closestDistance) {
      closestCode = code;
      closestDistance = distance;
    }
  }

  return closestCode;
}

function ansi256ToRgb(color) {
  if (color < 16) {
    const code = color < 8 ? color + 30 : color + 82;
    return ansiColorRgb.get(code);
  }

  if (color < 232) {
    const index = color - 16;
    const red = Math.floor(index / 36);
    const green = Math.floor((index % 36) / 6);
    const blue = index % 6;
    const levels = [0, 95, 135, 175, 215, 255];
    return [levels[red], levels[green], levels[blue]];
  }

  const level = 8 + (color - 232) * 10;
  return [level, level, level];
}

function getAnsiColorEmoji(parameters) {
  const values = parameters === ''
    ? [0]
    : parameters.split(';').map((value) => value === '' ? 0 : Number(value));

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    const colorCode = ansiColorEmojis.has(value)
      ? value
      : value >= 40 && value <= 47
        ? value - 10
        : value >= 100 && value <= 107
          ? value - 10
          : null;

    if (colorCode !== null) {
      return ansiColorEmojis.get(colorCode);
    }

    if ((value === 38 || value === 48) && values[index + 1] === 5) {
      const rgb = ansi256ToRgb(values[index + 2]);
      return ansiColorEmojis.get(nearestAnsiColorCode(...rgb));
    }

    if ((value === 38 || value === 48) && values[index + 1] === 2) {
      const rgb = values.slice(index + 2, index + 5);
      if (rgb.length === 3 && rgb.every(Number.isFinite)) {
        return ansiColorEmojis.get(nearestAnsiColorCode(...rgb));
      }
    }
  }

  return '';
}

function cleanAnsiOutput(output) {
  const withoutOsc = output.replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '');
  const withoutCsi = withoutOsc.replace(/\u001B\[([0-?]*)([ -/]*)([@-~])/g, (match, parameters, intermediate, final) => {
    return final === 'm' ? getAnsiColorEmoji(parameters) : '';
  });
  return withoutCsi.replace(/\u001B[ -/]*[@-~]/g, '');
}

async function writeCapturedOutput(extraChunks = []) {
  const rawOutput = Buffer.concat([...outputChunks, ...extraChunks]).toString('utf8');
  await writeFile(outputFile, cleanAnsiOutput(rawOutput));
}

async function runTests() {
  const testProcess = spawn(process.execPath, [packageManager, 'run', 'test', ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const capture = (chunk) => {
    outputChunks.push(chunk);
    process.stdout.write(chunk);
  };

  testProcess.stdout.on('data', capture);
  testProcess.stderr.on('data', capture);

  testProcess.on('error', async (error) => {
    await writeCapturedOutput([Buffer.from(`${error.message}\n`)]);
    console.error(`\nTest output written to ${outputFile}`);
    process.exitCode = 1;
  });

  testProcess.on('close', async (code, signal) => {
    await writeCapturedOutput();
    console.error(`\nTest output written to ${outputFile}`);

    if (signal) {
      process.exitCode = 1;
    } else {
      process.exitCode = code ?? 1;
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runTests();
}

export { cleanAnsiOutput };