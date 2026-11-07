import assert from 'node:assert/strict';
import { reserveBotDiscussionSlot } from './BotAgent.js';

const meeting = {};
assert.equal(reserveBotDiscussionSlot(meeting, 1_000, 0, 6), true, 'first bot may open the meeting');
assert.equal(reserveBotDiscussionSlot(meeting, 1_001, 1, 6), false, 'other bots may not pile onto the opening tick');
assert.equal(reserveBotDiscussionSlot(meeting, 4_199, 1, 6), false, 'the global speaking gap is enforced');
assert.equal(reserveBotDiscussionSlot(meeting, 4_200, 1, 6), true, 'a later bot may take the next turn');
assert.equal(reserveBotDiscussionSlot(meeting, 7_749, 2, 6), false, 'slot variation cannot shorten the reserved gap');
assert.equal(reserveBotDiscussionSlot(meeting, 7_750, 2, 6), true, 'the next paced turn is available');
assert.equal(reserveBotDiscussionSlot(meeting, 11_650, 3, 6), true, 'a fourth distinct turn is allowed');
assert.equal(reserveBotDiscussionSlot(meeting, 20_000, 4, 6), false, 'a meeting is capped at four autonomous messages');

const nextMeeting = {};
assert.equal(reserveBotDiscussionSlot(nextMeeting, 1_000, 0, 6), true, 'a new meeting gets an independent schedule');

const smallMeeting = {};
assert.equal(reserveBotDiscussionSlot(smallMeeting, 1_000, 0, 2), true);
assert.equal(reserveBotDiscussionSlot(smallMeeting, 5_000, 1, 2), true);
assert.equal(reserveBotDiscussionSlot(smallMeeting, 9_000, 0, 2), false, 'small lobbies cap at their living bot count');


const questionMeeting = {};
assert.equal(reserveBotDiscussionSlot(questionMeeting, 1_000, 0, 6), true,
  'the first bot may open a meeting');
assert.equal(reserveBotDiscussionSlot(questionMeeting, 2_599, 1, 6, '1:1000'), false,
  'a selected answer still waits for a natural pause');
assert.equal(reserveBotDiscussionSlot(questionMeeting, 2_600, 1, 6, '1:1000'), true,
  'one selected bot may answer after the shorter reply pause');
assert.equal(reserveBotDiscussionSlot(questionMeeting, 2_650, 2, 6, '1:1000'), false,
  'the same open question cannot trigger a second autonomous reply');
assert.equal(reserveBotDiscussionSlot(questionMeeting, 6_149, 2, 6), false,
  'the usual speaking cadence resumes after a reply');
assert.equal(reserveBotDiscussionSlot(questionMeeting, 6_150, 2, 6), true,
  'the next ordinary turn remains globally paced');

console.log('Bot discussion cadence tests passed.');
