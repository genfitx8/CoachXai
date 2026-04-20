import { CoachingAction, CoachingPlan, SwingCause } from './types';

const ACTION_MAP: Record<SwingCause['code'], CoachingAction> = {
  OPEN_FACE_AT_IMPACT: {
    title: 'Square the face through impact',
    cue: 'Match lead-wrist and clubface alignment earlier in transition.',
    drill: 'Impact bag with neutral-grip checkpoints (3 sets x 10 reps).',
  },
  CLOSED_FACE_AT_IMPACT: {
    title: 'Control face closure rate',
    cue: 'Keep forearm rotation quieter through P6–P7.',
    drill: 'Split-hand half swings to reduce over-rotation (3 sets x 12 reps).',
  },
  OUT_TO_IN_PATH: {
    title: 'Neutralize across-the-ball path',
    cue: 'Deliver clubhead from inside trail-forearm plane.',
    drill: 'Headcover gate path drill with inside strike target (4 sets x 8 balls).',
  },
  IN_TO_OUT_PATH: {
    title: 'Stabilize excessive inside-out path',
    cue: 'Rotate chest through while keeping handle exit neutral.',
    drill: 'Alignment-stick corridor drill to center path (4 sets x 8 balls).',
  },
  STEPPED_DOWN_ATTACK: {
    title: 'Shallow low-point depth',
    cue: 'Move pressure earlier to lead side while keeping chest level through impact.',
    drill: 'Tee-forward sweep drill and shallow-divot constraint (3 sets x 10 reps).',
  },
  SHALLOW_UPWARD_ATTACK: {
    title: 'Control upward strike bias',
    cue: 'Keep sternum centered and reduce excessive trail-side tilt at impact.',
    drill: 'Centered-pivot driver drill with launch-window target (3 sets x 10 reps).',
  },
  FACE_PATH_MISMATCH: {
    title: 'Synchronize face and path',
    cue: 'Keep face-to-path gap within ±2° at impact checkpoints.',
    drill: 'Start-line gate + curvature window drill (5 sets x 6 balls).',
  },
};

export function buildCoachingPlan(causes: SwingCause[]): CoachingPlan {
  const priorities = causes
    .slice(0, 3)
    .map((cause) => ACTION_MAP[cause.code]);

  if (priorities.length === 0) {
    return {
      summary: 'Impact conditions are mostly neutral. Maintain current movement pattern and monitor consistency.',
      priorities: [
        {
          title: 'Maintain baseline mechanics',
          cue: 'Preserve current setup, tempo, and strike pattern.',
          drill: 'Tempo ladder (slow/normal/fast) for 15-ball blocks.',
        },
      ],
    };
  }

  return {
    summary: `Primary deterministic focus: ${priorities.map((item) => item.title).join(' → ')}`,
    priorities,
  };
}
