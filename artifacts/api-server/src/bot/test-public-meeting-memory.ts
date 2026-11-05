import assert from 'node:assert/strict';
import { NO_TARGET } from '@workspace/shared/coords';
import { chooseEvidenceWeightedVote } from './voting.js';
import { PublicMeetingEvidenceLedger } from './publicMeetingMemory.js';

const roster = [
  { slot: 0, username: 'Nova' },
  { slot: 1, username: 'Mira' },
  { slot: 2, username: 'Green' },
  { slot: 3, username: 'Red' },
];

const ledger = new PublicMeetingEvidenceLedger();
ledger.ingest(1_000, [
  { slot: 1, sentAtMs: 1_001, text: 'I personally saw Green vent near the reactor.' },
], roster);

const first = ledger.snapshot()[0];
assert.ok(first);
assert.equal(first.kind, 'testimony');
assert.equal(first.subjectSlot, 2);
assert.equal(first.eventKey, 'vent');
assert.equal(first.stance, 'affirms');
assert.equal(first.confidence, 0.65);
assert.equal(first.contradicts.length, 0);
assert.equal(
  chooseEvidenceWeightedVote(0, [...roster, { slot: 4, username: 'Bolt' }].map(player => ({ ...player, alive: true })), ledger.voteMessages()),
  2,
  'a direct public witness claim from an earlier meeting remains available to deterministic voting',
);

ledger.ingest(2_000, [
  { slot: 3, sentAtMs: 2_001, text: 'Green did not vent and is not suspicious.' },
], roster);
const entries = ledger.snapshot();
assert.equal(entries.length, 2, 'the ledger appends a later meeting instead of resetting');
assert.deepEqual(entries[0].contradicts, [entries[1].id]);
assert.deepEqual(entries[1].contradicts, [entries[0].id]);
assert.match(ledger.priorTranscript(2_000), /confidence heuristic 0\.65/);
assert.match(ledger.priorTranscript(2_000), /Mira/);
assert.equal(
  chooseEvidenceWeightedVote(0, roster.map(player => ({ ...player, alive: true })), ledger.voteMessages()),
  NO_TARGET,
  'a later contradictory public statement lowers the combined evidence below the accusation threshold',
);

// Repeated bot ticks must not duplicate the same public transcript entry.
ledger.ingest(2_000, [
  { slot: 3, sentAtMs: 2_001, text: 'Green did not vent and is not suspicious.' },
], roster);
assert.equal(ledger.size, 2);

// Claims about multiple players are not assigned to an arbitrary target.
const ambiguous = new PublicMeetingEvidenceLedger();
ambiguous.ingest(3_000, [
  { slot: 1, sentAtMs: 3_001, text: 'I saw Green and Red near the vent.' },
], roster);
assert.equal(ambiguous.snapshot()[0].subjectSlot, null);

// "I did not see" is not misclassified as proof that the player did not act.
const limitedKnowledge = new PublicMeetingEvidenceLedger();
limitedKnowledge.ingest(4_000, [
  { slot: 1, sentAtMs: 4_001, text: 'I did not see Green vent.' },
], roster);
assert.equal(limitedKnowledge.snapshot()[0].stance, 'unknown');

// Untrusted display/chat text is sanitized before being retained.
const sanitized = new PublicMeetingEvidenceLedger();
sanitized.ingest(5_000, [
  { slot: 1, sentAtMs: 5_001, text: 'I saw Green\u202e vent\u0007 near reactor.' },
], roster);
assert.doesNotMatch(sanitized.snapshot()[0].text, /[\u0000-\u001f\u007f\u202e]/);

// Each bot instance owns its own ledger; another lobby/agent starts empty.
const isolated = new PublicMeetingEvidenceLedger();
assert.equal(isolated.size, 0);
assert.equal(isolated.priorEntries(6_000).length, 0);

// Retention is bounded; old records and dangling contradiction links are evicted.
const bounded = new PublicMeetingEvidenceLedger();
for (let index = 0; index < 60; index++) {
  bounded.ingest(7_000 + index, [
    { slot: 1, sentAtMs: 10_000 + index, text: 'I saw Green vent.' },
  ], roster);
}
assert.equal(bounded.size, 48);
assert.equal(bounded.snapshot().length, 48);
assert.equal(
  bounded.snapshot().every(entry => entry.contradicts.every(id => bounded.snapshot().some(other => other.id === id))),
  true,
  'eviction must not leave dangling contradiction links',
);

console.log('PASS: bounded per-agent public meeting memory, cross-round evidence, contradiction links, sanitation and isolation');
