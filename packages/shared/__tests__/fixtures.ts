export interface RawOption {
  id: string;
  text: string;
  correct: boolean;
  misconceptionId?: string;
}

export interface RawQuestion {
  prompt: string;
  options: RawOption[];
  explanation: string;
  conceptId?: string;
  sourceRef?: string;
}

export interface RawStep {
  id: string;
  type: string;
  conceptId?: string;
  sourceRef?: string;
  title?: string;
  body?: string;
  question?: RawQuestion;
  scene?: string;
  sign?: { shape: string; glyph?: string; label?: string };
  a?: { label: string; body: string };
  b?: { label: string; body: string };
  prompt?: string;
  items?: { id: string; text: string }[];
  correctOrder?: string[];
  explanation?: string;
  wrongBelief?: string;
  repairNote?: string;
  questions?: RawQuestion[];
}

export interface RawMission {
  missionId: string;
  routeId: string;
  title: string;
  estimatedMinutes: number;
  reviewStatus: string;
  steps: RawStep[];
}

export interface RawMisconception {
  misconceptionId: string;
  conceptId: string;
  wrongBelief: string;
  repairNote: string;
  sourceRef: string;
}

export interface RawContent {
  routes: { routeId: string; title: string }[];
  sourceRefs: Record<string, { title: string; url?: string }>;
  misconceptions: RawMisconception[];
  missions: { file: string; data: RawMission }[];
}

const q = (
  prompt: string,
  options: RawOption[],
  explanation: string,
  extra?: { conceptId: string; sourceRef: string },
): RawQuestion => ({ prompt, options, explanation, ...extra });

export function goodMission(): RawMission {
  return {
    missionId: 'r1-m1',
    routeId: 'route-1',
    title: 'Good mission',
    estimatedMinutes: 6,
    reviewStatus: 'draft',
    steps: [
      {
        id: 'r1-m1-s1',
        type: 'rule_card',
        conceptId: 'c.t.alpha',
        sourceRef: 'HC-1',
        title: 'Alpha rule',
        body: 'The alpha rule body.',
        question: q(
          'What does alpha require?',
          [
            { id: 'a', text: 'The wrong alpha', correct: false, misconceptionId: 'm.t.one' },
            { id: 'b', text: 'The right alpha', correct: true },
            { id: 'c', text: 'Nothing at all', correct: false },
          ],
          'Alpha requires the right alpha.',
        ),
      },
      {
        id: 'r1-m1-s2',
        type: 'scene_decision',
        conceptId: 'c.t.bravo',
        sourceRef: 'HC-2',
        scene: 'You approach a bravo situation.',
        question: q(
          'What do you do?',
          [
            { id: 'a', text: 'The bravo move', correct: true },
            { id: 'b', text: 'The rash move', correct: false, misconceptionId: 'm.t.two' },
            { id: 'c', text: 'Stop dead', correct: false },
          ],
          'The bravo move is correct.',
        ),
      },
      {
        id: 'r1-m1-s3',
        type: 'sign_meaning',
        conceptId: 'c.t.charlie',
        sourceRef: 'KYTS-1',
        sign: { shape: 'warning-triangle' },
        question: q(
          'What does this sign mean?',
          [
            { id: 'a', text: 'No charlie ever', correct: false, misconceptionId: 'm.t.three' },
            { id: 'b', text: 'Charlie parking', correct: false },
            { id: 'c', text: 'Charlie ahead', correct: true },
          ],
          'It warns of charlie ahead.',
        ),
      },
      {
        id: 'r1-m1-s4',
        type: 'contrast',
        conceptId: 'c.t.delta',
        sourceRef: 'HC-3',
        a: { label: 'Delta A', body: 'Delta A means one thing.' },
        b: { label: 'Delta B', body: 'Delta B means another.' },
        question: q(
          'Which is delta A?',
          [
            { id: 'a', text: 'The other thing', correct: false, misconceptionId: 'm.t.four' },
            { id: 'b', text: 'The one thing', correct: true },
            { id: 'c', text: 'Neither thing', correct: false },
          ],
          'Delta A means the one thing.',
        ),
      },
      {
        id: 'r1-m1-s5',
        type: 'sequence',
        conceptId: 'c.t.echo',
        sourceRef: 'HC-4',
        prompt: 'Put the echo in order:',
        items: [
          { id: 'a', text: 'First echo part' },
          { id: 'b', text: 'Second echo part' },
          { id: 'c', text: 'Third echo part' },
        ],
        correctOrder: ['a', 'b', 'c'],
        explanation: 'Echo happens in that order.',
      },
      {
        id: 'r1-m1-s6',
        type: 'hazard_cue',
        conceptId: 'c.t.foxtrot',
        sourceRef: 'HC-5',
        scene: 'A foxtrot hazard develops.',
        question: q(
          'What is the cue?',
          [
            { id: 'a', text: 'The foxtrot cue', correct: true },
            { id: 'b', text: 'A red herring', correct: false, misconceptionId: 'm.t.one' },
            { id: 'c', text: 'Nothing to see', correct: false },
          ],
          'The foxtrot cue is the giveaway.',
        ),
      },
      {
        id: 'r1-m1-s7',
        type: 'misconception',
        conceptId: 'c.t.golf',
        sourceRef: 'HC-6',
        wrongBelief: 'Many think golf is optional.',
        repairNote: 'Golf is required by rule 6.',
        question: q(
          'Is golf optional?',
          [
            { id: 'a', text: 'Yes, always', correct: false, misconceptionId: 'm.t.two' },
            { id: 'b', text: 'No, it is required', correct: true },
            { id: 'c', text: 'Only on Sundays', correct: false },
          ],
          'Golf is required.',
        ),
      },
      {
        id: 'r1-m1-s8',
        type: 'checkpoint',
        conceptId: 'c.t.check',
        sourceRef: 'HC-1',
        questions: [
          q(
            'Checkpoint alpha?',
            [
              { id: 'a', text: 'Wrong alpha', correct: false, misconceptionId: 'm.t.one' },
              { id: 'b', text: 'Right alpha', correct: true },
              { id: 'c', text: 'No alpha', correct: false },
            ],
            'Right alpha, as taught.',
            { conceptId: 'c.t.alpha', sourceRef: 'HC-1' },
          ),
          q(
            'Checkpoint bravo?',
            [
              { id: 'a', text: 'The bravo move', correct: true },
              { id: 'b', text: 'The rash move', correct: false, misconceptionId: 'm.t.two' },
              { id: 'c', text: 'No move', correct: false },
            ],
            'The bravo move, as taught.',
            { conceptId: 'c.t.bravo', sourceRef: 'HC-2' },
          ),
          q(
            'Checkpoint charlie?',
            [
              { id: 'a', text: 'No charlie', correct: false, misconceptionId: 'm.t.three' },
              { id: 'b', text: 'Charlie parking', correct: false },
              { id: 'c', text: 'Charlie ahead', correct: true },
            ],
            'Charlie ahead, as taught.',
            { conceptId: 'c.t.charlie', sourceRef: 'KYTS-1' },
          ),
          q(
            'Checkpoint delta?',
            [
              { id: 'a', text: 'The other thing', correct: false, misconceptionId: 'm.t.four' },
              { id: 'b', text: 'The one thing', correct: true },
              { id: 'c', text: 'Neither', correct: false },
            ],
            'The one thing, as taught.',
            { conceptId: 'c.t.delta', sourceRef: 'HC-3' },
          ),
          q(
            'Checkpoint echo?',
            [
              { id: 'a', text: 'In that order', correct: true },
              { id: 'b', text: 'In reverse', correct: false, misconceptionId: 'm.t.one' },
              { id: 'c', text: 'Any order', correct: false },
            ],
            'In that order, as taught.',
            { conceptId: 'c.t.echo', sourceRef: 'HC-4' },
          ),
        ],
      },
    ],
  };
}

export function goodContent(): RawContent {
  return {
    routes: [
      { routeId: 'route-1', title: 'Road Basics' },
      { routeId: 'route-2', title: 'Signs' },
      { routeId: 'route-3', title: 'Hazard Awareness' },
      { routeId: 'route-4', title: 'Junctions' },
      { routeId: 'route-5', title: 'Motorways' },
      { routeId: 'route-6', title: 'Vulnerable Road Users' },
      { routeId: 'route-7', title: 'Vehicle & Documents' },
    ],
    sourceRefs: {
      'HC-1': { title: 'Highway Code rule 1' },
      'HC-2': { title: 'Highway Code rule 2' },
      'HC-3': { title: 'Highway Code rule 3' },
      'HC-4': { title: 'Highway Code rule 4' },
      'HC-5': { title: 'Highway Code rule 5' },
      'HC-6': { title: 'Highway Code rule 6' },
      'KYTS-1': { title: 'Know Your Traffic Signs p.1' },
    },
    misconceptions: [
      {
        misconceptionId: 'm.t.one',
        conceptId: 'c.t.alpha',
        wrongBelief: 'Alpha is the wrong way round.',
        repairNote: 'Alpha goes the right way; rule 1 says so.',
        sourceRef: 'HC-1',
      },
      {
        misconceptionId: 'm.t.two',
        conceptId: 'c.t.bravo',
        wrongBelief: 'Rushing bravo is fine.',
        repairNote: 'Bravo needs the measured move; rule 2 says so.',
        sourceRef: 'HC-2',
      },
      {
        misconceptionId: 'm.t.three',
        conceptId: 'c.t.charlie',
        wrongBelief: 'Triangles ban charlie.',
        repairNote: 'Triangles warn; they never ban.',
        sourceRef: 'KYTS-1',
      },
      {
        misconceptionId: 'm.t.four',
        conceptId: 'c.t.delta',
        wrongBelief: 'Delta A and B are the same.',
        repairNote: 'They differ; rule 3 draws the line.',
        sourceRef: 'HC-3',
      },
    ],
    missions: [{ file: 'route-1/mission-1.json', data: goodMission() }],
  };
}

export function secondMission(): RawMission {
  const m = goodMission();
  m.missionId = 'r1-m2';
  m.title = 'Second mission';
  for (const step of m.steps) step.id = step.id.replace('r1-m1', 'r1-m2');
  return m;
}
