import type { PlayerCard } from '@/stores/playerStore';
import { CheckpointQuestion } from './CheckpointQuestion';
import { Contrast } from './Contrast';
import { HazardCue } from './HazardCue';
import { Misconception } from './Misconception';
import { RuleCard } from './RuleCard';
import { SceneDecision } from './SceneDecision';
import { Sequence } from './Sequence';
import { SignMeaning } from './SignMeaning';

export function StepRenderer(props: {
  card: PlayerCard;
  heading: string;
  answered: boolean;
  selectedId?: string;
  onAnswer: (input: string | string[]) => void;
}) {
  const { card, answered, selectedId, onAnswer } = props;

  if (card.kind === 'checkpoint-q' || card.kind === 'drill-q') {
    return (
      <CheckpointQuestion
        question={card.question}
        heading={props.heading}
        answered={answered}
        selectedId={selectedId}
        onAnswer={onAnswer}
      />
    );
  }

  const step = card.step;
  switch (step.type) {
    case 'rule_card':
      return <RuleCard step={step} answered={answered} selectedId={selectedId} onAnswer={onAnswer} />;
    case 'scene_decision':
      return (
        <SceneDecision step={step} answered={answered} selectedId={selectedId} onAnswer={onAnswer} />
      );
    case 'sign_meaning':
      return (
        <SignMeaning step={step} answered={answered} selectedId={selectedId} onAnswer={onAnswer} />
      );
    case 'contrast':
      return <Contrast step={step} answered={answered} selectedId={selectedId} onAnswer={onAnswer} />;
    case 'sequence':
      return <Sequence step={step} answered={answered} onAnswer={onAnswer} />;
    case 'hazard_cue':
      return <HazardCue step={step} answered={answered} selectedId={selectedId} onAnswer={onAnswer} />;
    case 'misconception':
      return (
        <Misconception step={step} answered={answered} selectedId={selectedId} onAnswer={onAnswer} />
      );
    case 'checkpoint':
      return null;
  }
}
