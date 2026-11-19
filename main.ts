// Token Radar runner (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every genuine pre-token protocol with lib/radar.ts,
// and writes the entry's outputs:
//
//   /output/board.json     the ranked board (198 rows: the 40-protocol watchlist plus
//                           every other genuine pre-token protocol in the snapshot)
//   /output/data.js        the same board, compact, for the dashboard page
//   /output/dashboard/    this repository's dashboard/ (index.html, app.css, app.js)
//   /output/screenshots/  this repository's screenshots/ (board, detail, filtered)
//   /output/dossier.json  the judge's summary, written by vendor/makefun-board.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildPayload, parseSnapshot } from './lib/radar.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The caps the gate enforces on the dossier's text, screenshots and dashboard files. */
const DOSSIER_TEXT_BYTES = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASH_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--flag value` or `--flag=value` from the arguments, else `fallback`. */
function flagValue(flag: string, fallback: string): string {
  const args = process.argv.slice(2);
  const spot = args.indexOf(`--${flag}`);
  if (spot >= 0 && spot + 1 < args.length) return args[spot + 1]!;
  const glued = args.find((a) => a.startsWith(`--${flag}=`));
  return glued === undefined ? fallback : glued.slice(flag.length + 3);
}

/** Die with a message on stderr and exit code 2. */
function fail(message: string): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(2);
}

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, payload } = buildPayload(snap);
const problem = boardIssue(board, snap);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`);

/** Copy a directory's plain files into `dest`, skipping dot-names; returns the names copied. */
function copyPlainFiles(srcDir: string, destDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(destDir, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(srcDir)) {
    if (entry.startsWith('.')) continue;
    const from = join(srcDir, entry);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(destDir, entry));
    names.push(entry);
  }
  return names;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), `window.RADAR=${JSON.stringify(payload)};\n`);

const dashFiles = copyPlainFiles(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyPlainFiles(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_BYTES, screenshots: SHOT_LIMIT, dashboard: DASH_LIMIT }),
);

// Every output the entry promises must exist and be non-empty before the run reports success:
// a missing dashboard page or an empty board would hand the judge a broken entry.
const expected = [
  join(outDir, 'board.json'),
  join(outDir, 'data.js'),
  join(outDir, 'dashboard', 'index.html'),
  join(outDir, 'dossier.json'),
  ...shots.map((name) => join(outDir, 'screenshots', name)),
];
for (const file of expected) {
  if (!existsSync(file) || statSync(file).size === 0) fail(`expected output missing or empty: ${file}`);
}
if (dashFiles.indexOf('index.html') < 0) fail('dashboard/ holds no index.html: the page has no entrypoint');

const top = board[0]!;
process.stdout.write(
  `token-radar: ${snap.protocols.length} protocols in the snapshot, ${snap.watchlist.length} on the watchlist, ${board.length} rows ranked (${payload.set_aside_size} pre-token protocols set aside as wrapped, staked or bridged)\n` +
    `token-radar: rank 1 is ${top.name} at $${top.implied_value_usd.toLocaleString('en-US')} implied value\n` +
    `token-radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashFiles.length} files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
