// Re-encode the source visual-media-clip masters into app-bundled, git-excluded clips.
//
// Generic by design: every path is read from the untracked content/bank/sources.json,
// and the clip ids come from the (git-excluded) generated video bank — no source
// filenames or product identifiers live in this tracked file (same rule as the ingest).
// Runs only where the source material exists; a clean clone is a graceful no-op.
//
//   node scripts/reencode-clips.mjs        (or: pnpm reencode-clips)
//
// Output: apps/mobile/assets/clips/<clipId>.mp4 — H.264, 720p, silent, <= 6 MB each.
// The masters are silent (video-only), matching the strict mock's silent video
// questions; a computed two-pass bitrate targets a size safely under the ceiling.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'content/bank/sources.json');
const VIDEO_BANK = join(ROOT, 'content/bank/vmc.json');
const OUT_DIR = join(ROOT, 'apps/mobile/assets/clips');

const MAX_BYTES = 6 * 1024 * 1024; // hard ceiling, asserted after every encode
const TARGET_BYTES = 5.3 * 1024 * 1024; // aim under the ceiling, leaving muxing headroom
const HEIGHT = 720;

function skip(msg) {
  console.log(`reencode-clips: ${msg} — nothing to do (clone-safe no-op)`);
  process.exit(0);
}

if (!existsSync(SOURCES)) skip('no content/bank/sources.json');
if (!existsSync(VIDEO_BANK)) skip('no generated video bank (run `pnpm content ingest` first)');

const sources = JSON.parse(readFileSync(SOURCES, 'utf8'));
const clipsDir = sources.vmcClipsDir;
if (!clipsDir) skip('sources.json has no "vmcClipsDir"');
if (!existsSync(clipsDir)) skip(`source clips dir not found: ${clipsDir}`);

const bank = JSON.parse(readFileSync(VIDEO_BANK, 'utf8'));
const clipIds = [...new Set((bank.questions ?? []).map((q) => q.clipId))].filter(Boolean).sort();
if (clipIds.length === 0) skip('video bank has no clip ids');

const masters = readdirSync(clipsDir).filter((f) => f.toLowerCase().endsWith('.mp4'));

function sourceFor(clipId) {
  const num = clipId.replace(/^\D+/, ''); // vm2016 -> 2016
  const re = new RegExp(`(?<!\\d)${num}(?!\\d)`);
  const matches = masters.filter((f) => re.test(f));
  if (matches.length !== 1)
    throw new Error(
      `clip ${clipId}: expected exactly one source matching "${num}", found ${matches.length}`,
    );
  return join(clipsDir, matches[0]);
}

function durationOf(input) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input],
    { encoding: 'utf8' },
  );
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`bad duration for ${input}: "${out.trim()}"`);
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`reencode-clips: ${clipIds.length} clips -> apps/mobile/assets/clips`);

for (const clipId of clipIds) {
  const input = sourceFor(clipId);
  const out = join(OUT_DIR, `${clipId}.mp4`);
  const dur = durationOf(input);
  const kbps = Math.floor((TARGET_BYTES * 8) / dur / 1000);
  const passlog = join(tmpdir(), `focus-clip-${clipId}`);
  const shared = [
    '-y', '-i', input, '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high',
    '-vf', `scale=-2:${HEIGHT}`, '-pix_fmt', 'yuv420p',
    '-b:v', `${kbps}k`, '-passlogfile', passlog,
  ];
  execFileSync('ffmpeg', [...shared, '-pass', '1', '-f', 'null', '/dev/null'], { stdio: 'ignore' });
  execFileSync('ffmpeg', [...shared, '-pass', '2', '-movflags', '+faststart', out], { stdio: 'ignore' });
  rmSync(`${passlog}-0.log`, { force: true });
  rmSync(`${passlog}-0.log.mbtree`, { force: true });

  const bytes = statSync(out).size;
  if (bytes > MAX_BYTES)
    throw new Error(`${clipId}.mp4 is ${(bytes / 1048576).toFixed(2)} MB — exceeds the 6 MB ceiling`);
  console.log(`  ${clipId}.mp4  ${(bytes / 1048576).toFixed(2)} MB  ${kbps} kbps  ${dur.toFixed(1)}s`);
}

console.log('reencode-clips: done');
