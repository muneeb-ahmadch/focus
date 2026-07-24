import { BankFile } from '@focus/shared';

// The generated question bank (car + video questions) is licensed Crown-copyright and
// git-excluded — it exists only where `pnpm content bank-build` has run, never on a clean
// clone / CI. It is loaded with require() (not a static import) so `tsc` tolerates its
// absence; the vitest config aliases this whole module to a synthetic fixture, so tests
// never touch the real bank and run identically everywhere. On device the file is always
// present (you cannot build the app without ingesting), so the empty fallback only guards
// against a genuinely missing bundle.
const EMPTY: BankFile = { bankFormat: 1, source: 'empty', questions: [] };

function loadBank(): BankFile {
  let raw: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    raw = require('./generated/bank.json');
  } catch {
    return EMPTY;
  }
  const parsed = BankFile.safeParse(raw);
  if (!parsed.success) {
    throw new Error('bundled question bank failed validation — rebuild with pnpm content bank-build');
  }
  return parsed.data;
}

export const BANK: BankFile = loadBank();
