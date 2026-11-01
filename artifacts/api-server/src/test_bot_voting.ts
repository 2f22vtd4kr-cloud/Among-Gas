import assert from 'node:assert/strict';
import { NO_TARGET } from '@workspace/shared/coords';
import { chooseEvidenceWeightedVote } from './bot/voting.js';

const roster = [
  { slot: 0, username: 'Alice', alive: true },
  { slot: 1, username: 'Blue', alive: true },
  { slot: 2, username: 'Green', alive: true },
];

function test(name: string, actual: number, expected: number): void {
  assert.equal(actual, expected, name);
  console.log('PASS:', name);
}

test(
  'direct eyewitness evidence selects the accused living player',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'I saw Blue vent near reactor.' },
  ]),
  1,
);

test(
  'independent corroboration outweighs a single weak suspicion',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'Blue is sus.' },
    { slot: 2, text: 'I watched Blue come out of the vent.' },
  ]),
  1,
);

test(
  'weak unsupported suspicion produces an explicit skip',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'Blue is sus.' },
  ]),
  NO_TARGET,
);

test(
  'equally supported accusations produce an explicit skip',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'I saw Blue vent near reactor.' },
    { slot: 1, text: 'I saw Green sabotage the reactor.' },
  ]),
  NO_TARGET,
);

test(
  'a clear or exculpatory statement does not become an accusation',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'Blue is not suspicious; do not vote Blue.' },
  ]),
  NO_TARGET,
);

test(
  'two independent calls to skip override weak suspicion',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'Blue is sus.' },
    { slot: 2, text: 'Skip, there is no evidence.' },
    { slot: 1, text: 'Skip, nothing to go on.' },
  ]),
  NO_TARGET,
);

test(
  'dead players are never selected as vote targets',
  chooseEvidenceWeightedVote(0, [
    roster[0],
    { ...roster[1], alive: false },
    roster[2],
  ], [
    { slot: 0, text: 'I saw Blue vent near reactor.' },
  ]),
  NO_TARGET,
);

test(
  'self is excluded and an empty eligible roster skips',
  chooseEvidenceWeightedVote(0, [roster[0]], []),
  NO_TARGET,
);

test(
  'public player-number references resolve to the correct slot',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'Player 2 is suspicious.' },
    { slot: 2, text: 'I saw #2 vent near reactor.' },
  ]),
  1,
);


test(
  'exculpatory statements about a different player do not erase an accusation',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'I saw Blue vent near reactor. Green is innocent.' },
  ]),
  1,
);

test(
  'a speaker retracting their own earlier accusation removes that evidence',
  chooseEvidenceWeightedVote(0, roster, [
    { slot: 0, text: 'I saw Blue vent near reactor.' },
    { slot: 0, text: 'I was wrong; Blue is innocent.' },
  ]),
  NO_TARGET,
);

console.log('All evidence-weighted voting tests passed.');
