// Pins v4 smoke defect 1 (checklists/v4-smoke.md): t.text() carries type
// metrics but no colour, so a style that spreads it without an explicit
// `color:` falls back to RN's default black — invisible on dark surfaces
// (Learn's mission ✓ glyph). Static scan of the whole defect class, same
// spirit as motion-gate: every object literal spreading t.text() must set
// color in that same literal.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MOBILE_ROOT = path.resolve(__dirname, '../..');
const SCAN_ROOTS = [path.join(MOBILE_ROOT, 'src'), path.join(MOBILE_ROOT, 'app')];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

function enclosingObjectLiteral(source: string, index: number): string {
  let depth = 0;
  let open = -1;
  for (let i = index; i >= 0; i--) {
    const ch = source[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) {
        open = i;
        break;
      }
      depth--;
    }
  }
  if (open === -1) return '';
  depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

describe('themed text colour gate', () => {
  it('every style object spreading t.text() sets an explicit color', () => {
    const violations: string[] = [];
    const spread = /\.\.\.t\.text\(/g;
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(spread)) {
          const literal = enclosingObjectLiteral(source, match.index);
          if (!/[,{\s]color\s*:/.test(literal)) {
            const line = source.slice(0, match.index).split('\n').length;
            violations.push(`${path.relative(MOBILE_ROOT, file)}:${line}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
