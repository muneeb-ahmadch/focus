import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack } from './build';
import { validateContent, type RawContentInput, type ValidationReport } from './validate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CONTENT_DIR = join(ROOT, 'content');
const PACK_PATH = join(ROOT, 'apps/mobile/src/content/generated/pack.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ReadProblem {
  label: string;
  detail: string;
}

function readJsonOrReport(absPath: string, label: string, problems: ReadProblem[]): unknown {
  let text: string;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch (e) {
    problems.push({ label, detail: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    problems.push({ label, detail: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
}

function walkJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function loadRawContent(): RawContentInput {
  if (!existsSync(CONTENT_DIR)) {
    console.error(`error: no content directory found at ${relative(ROOT, CONTENT_DIR)}`);
    process.exit(1);
  }

  const problems: ReadProblem[] = [];
  const routes = readJsonOrReport(join(CONTENT_DIR, 'routes.json'), 'routes.json', problems);
  const sourceRefs = readJsonOrReport(
    join(CONTENT_DIR, 'source-refs.json'),
    'source-refs.json',
    problems,
  );
  const misconceptions = readJsonOrReport(
    join(CONTENT_DIR, 'misconceptions.json'),
    'misconceptions.json',
    problems,
  );

  const missionsDir = join(CONTENT_DIR, 'routes');
  const missionPaths = existsSync(missionsDir) ? walkJsonFiles(missionsDir).sort() : [];
  const missions: { file: string; data: unknown }[] = [];
  for (const full of missionPaths) {
    const label = relative(missionsDir, full);
    const data = readJsonOrReport(full, label, problems);
    if (data !== undefined) missions.push({ file: label, data });
  }

  if (problems.length > 0) {
    for (const p of problems) {
      console.error(`ERROR ${p.label} invalid JSON`);
      console.error(`  ${p.detail}`);
    }
    process.exit(1);
  }

  return { routes, sourceRefs, misconceptions, missions };
}

function countMisconceptions(input: RawContentInput): number {
  return Array.isArray(input.misconceptions) ? input.misconceptions.length : 0;
}

function countSourceRefs(input: RawContentInput): number {
  return isRecord(input.sourceRefs) ? Object.keys(input.sourceRefs).length : 0;
}

function printSummary(input: RawContentInput, report: ValidationReport): void {
  for (const e of report.errors) console.error(`ERROR ${e.file} [${e.where}] ${e.message}`);
  for (const w of report.warnings) console.log(`WARN ${w.file} [${w.where}] ${w.message}`);
  console.log(
    `content: ${input.missions.length} missions, ${countMisconceptions(input)} misconceptions, ` +
      `${countSourceRefs(input)} source refs — ${report.errors.length} errors, ${report.warnings.length} warnings`,
  );
}

function runValidate(input: RawContentInput): ValidationReport {
  const report = validateContent(input);
  printSummary(input, report);
  if (report.errors.length > 0) process.exit(1);
  return report;
}

function cmdValidate(): void {
  runValidate(loadRawContent());
}

function cmdBuild(): void {
  const input = loadRawContent();
  runValidate(input);
  const bytes = buildPack(input);
  mkdirSync(dirname(PACK_PATH), { recursive: true });
  writeFileSync(PACK_PATH, bytes, 'utf8');
  console.log(`wrote ${relative(ROOT, PACK_PATH)} (${Buffer.byteLength(bytes, 'utf8')} bytes)`);
}

function cmdCheck(): void {
  const input = loadRawContent();
  runValidate(input);
  const bytes = buildPack(input);
  const existing = existsSync(PACK_PATH) ? readFileSync(PACK_PATH, 'utf8') : undefined;
  if (existing !== bytes) {
    console.error('pack is stale — run pnpm content build');
    process.exit(1);
  }
  console.log('pack up to date');
}

const command = process.argv[2];
switch (command) {
  case 'validate':
    cmdValidate();
    break;
  case 'build':
    cmdBuild();
    break;
  case 'check':
    cmdCheck();
    break;
  default:
    console.error(`error: unknown command "${command ?? ''}" (expected validate | build | check)`);
    process.exit(1);
}
