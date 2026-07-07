import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.expo', '.turbo', 'dist', '.git']);

function walk(dir, exts = ['.ts', '.tsx']) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  let files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

function scan(files, pattern) {
  const violations = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const match = pattern.exec(line);
      pattern.lastIndex = 0;
      if (match) {
        violations.push(`${relative(ROOT, file)}:${i + 1} — matched "${match[0]}"`);
      }
    });
  }
  return violations;
}

function report(name, violations) {
  if (violations.length === 0) {
    console.log(`TRIPWIRE OK: ${name}`);
    return true;
  }
  console.error(`TRIPWIRE FAILED: ${name}`);
  for (const v of violations) console.error(`  ${v}`);
  return false;
}

let ok = true;

// 1. ENGINE PURITY — packages/engine/src must have no wall-clock/random access.
{
  const files = walk(join(ROOT, 'packages/engine/src'));
  const violations = scan(files, /Date\.now|new Date\(|Math\.random/);
  ok = report('ENGINE PURITY (packages/engine/src)', violations) && ok;
}

// 2. APP TIME SOURCE — all app/mobile time reads must funnel through src/lib/clock.ts.
{
  const clockPath = join(ROOT, 'apps/mobile/src/lib/clock.ts');
  const files = [
    ...walk(join(ROOT, 'apps/mobile/src')),
    ...walk(join(ROOT, 'apps/mobile/app')),
  ].filter((f) => f !== clockPath && !f.endsWith('.test.ts'));
  const violations = scan(files, /new Date\(|Date\.now\(/);
  ok = report('APP TIME SOURCE (apps/mobile/src, apps/mobile/app)', violations) && ok;
}

// 3. ESCAPE HATCHES — no type-safety or test-focus escape hatches in tracked source/test dirs.
{
  const dirs = [
    'apps/mobile/src',
    'apps/mobile/app',
    'apps/mobile/__acceptance__',
    'packages/engine/src',
    'packages/engine/__tests__',
    'packages/shared/src',
    'packages/shared/__tests__',
  ];
  const files = dirs.flatMap((d) => walk(join(ROOT, d)));
  const violations = scan(
    files,
    /: any|as any|@ts-ignore|@ts-expect-error|it\.only|describe\.only|it\.skip/,
  );
  ok = report('ESCAPE HATCHES', violations) && ok;
}

// 4. CONTENT PACK BOUNDARY — app code imports no raw content JSON, only the CLI-built pack;
//    no raw content JSON files live inside the app tree.
{
  const files = [...walk(join(ROOT, 'apps/mobile/src')), ...walk(join(ROOT, 'apps/mobile/app'))];
  const violations = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const match = /(?:from\s+|require\(\s*)['"]([^'"]+\.json)['"]/.exec(line);
      if (match && !match[1].endsWith('generated/pack.json')) {
        violations.push(`${relative(ROOT, file)}:${i + 1} — raw JSON import "${match[1]}"`);
      }
    });
  }
  const contentDir = join(ROOT, 'apps/mobile/src/content');
  for (const f of walk(contentDir, ['.json'])) {
    if (relative(contentDir, f) !== join('generated', 'pack.json')) {
      violations.push(`${relative(ROOT, f)} — raw content JSON inside the app tree`);
    }
  }
  ok = report('CONTENT PACK BOUNDARY (apps/mobile)', violations) && ok;
}

if (!ok) {
  console.error('\ntripwires failed — see violations above');
  process.exit(1);
}
