import type { BankFile, BankQuestion } from '@focus/shared';

// Synthetic, non-DVSA question bank that stands in for the licensed bank in every test.
// It is shaped exactly like the real `pnpm content bank-build` output — topic-slug
// conceptIds (`c.<slug>.<item>`), route-2 questions are the road-sign questions, and a
// `clipId` marks a video question — so the pool builders behave identically to production.
// The real bank is Crown-copyright and git-excluded; the vitest config aliases the runtime
// loader (`@/content/bank`) to this module so the suite is deterministic on any clone.

interface CarSpec {
  route: string;
  slug: string;
  n: number;
}

// Deliberate distribution: every family here is ≥ PRACTICE_MIN_POOL except
// `essential-documents` (3), which must stay hidden from the practice topic picker.
const CAR_SPECS: CarSpec[] = [
  { route: 'route-1', slug: 'alertness', n: 6 },
  { route: 'route-1', slug: 'attitude', n: 6 },
  { route: 'route-2', slug: 'signs', n: 12 },
  { route: 'route-3', slug: 'hazard-awareness', n: 6 },
  { route: 'route-3', slug: 'safety-margins', n: 5 },
  { route: 'route-3', slug: 'vehicle-handling', n: 5 },
  { route: 'route-4', slug: 'rules-of-the-road', n: 8 },
  { route: 'route-5', slug: 'motorway-rules', n: 6 },
  { route: 'route-6', slug: 'vulnerable-road-users', n: 5 },
  { route: 'route-6', slug: 'other-vehicles', n: 5 },
  { route: 'route-7', slug: 'safety-and-your-vehicle', n: 6 },
  { route: 'route-7', slug: 'essential-documents', n: 3 },
  { route: 'route-7', slug: 'incidents', n: 5 },
  { route: 'route-7', slug: 'vehicle-loading', n: 5 },
];

function letters(slug: string): string {
  const a = slug.replace(/[^a-z]/g, '');
  return (a[0] ?? 'x').toUpperCase() + (a[1] ?? 'q').toUpperCase();
}

function options(seed: number): BankQuestion['options'] {
  const correct = seed % 4;
  return (['a', 'b', 'c', 'd'] as const).map((id, i) => ({
    id,
    text: `Option ${id.toUpperCase()} for question ${seed}`,
    correct: i === correct,
  }));
}

let counter = 0;

function carQuestion(spec: CarSpec, i: number): BankQuestion {
  counter += 1;
  const item = `${letters(spec.slug)}${String(1000 + counter).padStart(4, '0')}`;
  return {
    item,
    topic: spec.slug,
    routeId: spec.route,
    conceptId: `c.${spec.slug}.${item.toLowerCase()}`,
    prompt: `Synthetic ${spec.slug} question ${i + 1}`,
    options: options(counter),
    explanation: `The official explanation for ${spec.slug} question ${i + 1}.`,
    sourceRefs: ['HC-r1'],
    niExempt: false,
  };
}

function videoQuestions(): BankQuestion[] {
  const out: BankQuestion[] = [];
  for (let clip = 1; clip <= 3; clip++) {
    const clipId = `vm900${clip}`;
    for (let q = 1; q <= 3; q++) {
      counter += 1;
      const item = `VM900${clip}-${q}`;
      out.push({
        item,
        topic: 'Video scene',
        routeId: 'route-3',
        conceptId: `c.video.${item.toLowerCase()}`,
        prompt: `Synthetic video question ${clip}.${q}`,
        options: options(counter),
        explanation: `The official explanation for video question ${clip}.${q}.`,
        sourceRefs: ['HC-r1'],
        niExempt: false,
        clipId,
      });
    }
  }
  return out;
}

// vB.3 media questions. Both sit in dedicated single-question families (count < the practice
// minimum) so they stay out of the practice topic picker while remaining in the mock pool and
// findable by predicate (q.stemImage / an option's imageRef) in render tests.

// A stem-image question: the situation is an image above text answer options.
function stemImageQuestion(): BankQuestion {
  return {
    item: 'RS9001',
    topic: 'road-scene',
    routeId: 'route-3',
    conceptId: 'c.road-scene.rs9001',
    prompt: 'What should you do as you approach this junction?',
    stemImage: 'RS9001s.gif',
    options: [
      { id: 'a', text: 'Give way to traffic from the right', correct: true },
      { id: 'b', text: 'Speed up to clear the junction', correct: false },
      { id: 'c', text: 'Stop only if a vehicle is coming', correct: false },
      { id: 'd', text: 'Sound your horn and proceed', correct: false },
    ],
    explanation: 'The official explanation for the junction stem-image question.',
    sourceRefs: ['HC-r1'],
    niExempt: false,
  };
}

// An image-option question: the answer options are sign images, each carrying authored altText
// so every option is still audible (product rule 8).
function imageOptionQuestion(): BankQuestion {
  return {
    item: 'RP9101',
    topic: 'road-sign-pick',
    routeId: 'route-6',
    conceptId: 'c.road-sign-pick.rp9101',
    prompt: 'Which sign warns that people may be walking in the road?',
    options: [
      { id: 'a', imageRef: 'RP9101a.gif', altText: 'Roadworks ahead warning sign', correct: false },
      { id: 'b', imageRef: 'RP9101b.gif', altText: 'Pedestrians in the road ahead warning sign', correct: true },
      { id: 'c', imageRef: 'RP9101c.gif', altText: 'Slippery road surface warning sign', correct: false },
      { id: 'd', imageRef: 'RP9101d.gif', altText: 'Two-way traffic ahead warning sign', correct: false },
    ],
    explanation: 'The official explanation for the pedestrians-in-the-road sign question.',
    sourceRefs: ['KYTS-p13'],
    niExempt: false,
  };
}

function build(): BankFile {
  counter = 0;
  const car = CAR_SPECS.flatMap((spec) =>
    Array.from({ length: spec.n }, (_, i) => carQuestion(spec, i)),
  );
  return {
    bankFormat: 1,
    source: 'synthetic',
    questions: [...car, stemImageQuestion(), imageOptionQuestion(), ...videoQuestions()],
  };
}

export const BANK: BankFile = build();
