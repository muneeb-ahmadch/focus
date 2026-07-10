// Slice v4 gate: the motion gate is ONE hook — any file that animates must
// consume useMotion() so reduce_motion zeroes it. Static scan, not convention.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MOBILE_ROOT = path.resolve(__dirname, '../..');
const SCAN_ROOTS = [path.join(MOBILE_ROOT, 'src'), path.join(MOBILE_ROOT, 'app')];
const THEME_DIR = path.join(MOBILE_ROOT, 'src', 'theme');

const ANIMATED_API =
  /\bwith(Timing|Spring|Delay|Repeat|Sequence|Decay)\s*\(|entering=\{|exiting=\{/;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('reduce_motion gate', () => {
  it('every animating file consumes useMotion()', () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (file.startsWith(THEME_DIR)) continue;
        const source = readFileSync(file, 'utf8');
        if (ANIMATED_API.test(source) && !/\buseMotion\s*\(/.test(source)) {
          violations.push(path.relative(MOBILE_ROOT, file));
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
