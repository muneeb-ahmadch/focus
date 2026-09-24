import { routeQuotaFromShares, type Blueprint, type MockPoolQuestion } from '@focus/engine';
import type { BankFile } from '@focus/shared';
import { BANK } from '@/content/bank';

// A pool option is either text or a bundled image; an image option carries its authored
// altText so it stays audible (rule 8). Mirrors the bank's BankOption, minus the schema noise.
export interface PoolOption {
  id: string;
  text?: string;
  imageRef?: string;
  altText?: string;
  correct: boolean;
}

export interface PoolQuestion {
  id: string;
  conceptId: string;
  routeId: string;
  prompt: string;
  // present when the situation is shown as an image above the (text) options
  stemImage?: string;
  options: PoolOption[];
  // authored feedback — practice renders it; the strict mock never does
  explanation: string;
  video: boolean;
  sign: boolean;
}

// The road-sign floor (product rule 5 guarantees sign coverage). The per-route quota
// derived below already yields ~this many route-2 questions; this is a hard backstop.
const MIN_SIGNS = 4;

interface BuiltPool {
  pool: MockPoolQuestion[];
  questionById: Map<string, PoolQuestion>;
  byConcept: Map<string, PoolQuestion>;
}

function buildPool(bank: BankFile): BuiltPool {
  const pool: MockPoolQuestion[] = [];
  const questionById = new Map<string, PoolQuestion>();
  const byConcept = new Map<string, PoolQuestion>();

  for (const q of bank.questions) {
    const video = !!q.clipId;
    const sign = q.routeId === 'route-2'; // topic-map: route-2 = Road and traffic signs
    const entry: PoolQuestion = {
      id: q.item,
      conceptId: q.conceptId,
      routeId: q.routeId,
      prompt: q.prompt,
      ...(q.stemImage ? { stemImage: q.stemImage } : {}),
      options: q.options.map((o) => ({
        id: o.id,
        correct: o.correct,
        ...(o.text ? { text: o.text } : {}),
        ...(o.imageRef ? { imageRef: o.imageRef, altText: o.altText } : {}),
      })),
      explanation: q.explanation,
      video,
      sign,
    };
    questionById.set(q.item, entry);
    if (!byConcept.has(q.conceptId)) byConcept.set(q.conceptId, entry);
    pool.push({ id: q.item, routeId: q.routeId, video, sign });
  }

  return { pool, questionById, byConcept };
}

const built = buildPool(BANK);

// Review items originating from mock/practice carry a bank conceptId that the authored
// lesson pack doesn't know. The drill/rehab loop uses this to resolve a question for them.
export function getBankQuestionByConcept(conceptId: string): PoolQuestion | undefined {
  return built.byConcept.get(conceptId);
}

// Each route's share of the (non-video) bank, summing to 1 across routes with content.
// Non-video mirrors routeQuotaFromShares — video questions sit on a placeholder route
// until v14 and would skew the distribution. Readiness weights route coverage by these
// shares (§4 P1-4): finishing a larger-share route counts for more.
export function getRouteBankShares(): Record<string, number> {
  const counts = new Map<string, number>();
  for (const q of built.pool) if (!q.video) counts.set(q.routeId, (counts.get(q.routeId) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const shares: Record<string, number> = {};
  if (total === 0) return shares;
  for (const [routeId, count] of counts) shares[routeId] = count / total;
  return shares;
}

export const MOCK_BLUEPRINT: Blueprint = {
  total: 50,
  videoCount: 3,
  minSigns: MIN_SIGNS,
  routeQuota: routeQuotaFromShares(built.pool, 50 - 3),
};

export function getMockPool(): BuiltPool {
  return built;
}
