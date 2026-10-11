import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyGroupAction,
  awardMasterMarks,
  rankGroups,
  selectionsMatch,
} from './classroomScoring.js';

function board() {
  return {
    groups: [
      { id: 'a', name: 'Group A', score: 0, members: [] },
      { id: 'b', name: 'Group B', score: 0, members: [] },
      { id: 'c', name: 'Group C', score: 0, members: [] },
    ],
    turnIndex: 0,
    stake: 4,
    failCount: 0,
    masterScore: 0,
    questionMarks: 4,
    questionOpen: true,
  };
}

test('a correct answer awards the marks on offer and closes the question', () => {
  const next = applyGroupAction(board(), 'correct');
  assert.equal(next.groups[0].score, 4);
  assert.equal(next.questionOpen, false);
  assert.equal(next.revealCorrect, true);
  assert.equal(next.emoji, '🎉');
  assert.equal(next.masterGain, 0);
});

test('a wrong answer deducts half the question marks and carries half to the next group', () => {
  const next = applyGroupAction(board(), 'wrong');
  assert.equal(next.groups[0].score, -2);
  assert.equal(next.questionOpen, true);
  assert.equal(next.revealCorrect, true);
  assert.equal(next.emoji, '❌');
  assert.equal(next.stake, 2);
  assert.equal(next.turnIndex, 1);
  assert.equal(next.failCount, 1);
});

test('a pass carries half the marks and keeps the answer hidden', () => {
  const next = applyGroupAction(board(), 'pass');
  assert.equal(next.groups[0].score, 0);
  assert.equal(next.revealCorrect, false);
  assert.equal(next.stake, 2);
  assert.equal(next.turnIndex, 1);
  assert.equal(next.emoji, '⏭️');
});

test('the second miss gives the marks on offer to the master', () => {
  const afterPass = applyGroupAction(board(), 'pass');
  const next = applyGroupAction(
    {
      ...afterPass,
      questionMarks: 4,
      questionOpen: true,
    },
    'wrong'
  );
  assert.equal(next.groups[1].score, -2);
  assert.equal(next.masterScore, 2);
  assert.equal(next.masterGain, 2);
  assert.equal(next.questionOpen, false);
  assert.equal(next.revealCorrect, true);
});

test('two passes send the carried marks to the master', () => {
  const afterPass = applyGroupAction(board(), 'pass');
  const next = applyGroupAction({ ...afterPass, questionMarks: 4, questionOpen: true }, 'pass');
  assert.equal(next.groups[0].score, 0);
  assert.equal(next.groups[1].score, 0);
  assert.equal(next.masterScore, 2);
  assert.equal(next.questionOpen, false);
});

test('the next group can win the carried half', () => {
  const afterPass = applyGroupAction(board(), 'pass');
  const next = applyGroupAction({ ...afterPass, questionMarks: 4, questionOpen: true }, 'correct');
  assert.equal(next.groups[1].score, 2);
  assert.equal(next.questionOpen, false);
  assert.equal(next.masterScore, 0);
});

test('the master can give held marks to a chosen group', () => {
  const awarded = awardMasterMarks(
    { groups: [{ id: 'b', name: 'Group B', score: 1, members: [] }], masterScore: 2.5 },
    { groupId: 'b', marks: 1.5 }
  );
  assert.equal(awarded.groups[0].score, 2.5);
  assert.equal(awarded.masterScore, 1);
  assert.throws(() => awardMasterMarks({ groups: awarded.groups, masterScore: 1 }, { groupId: 'b', marks: 2 }));
});

test('scores arrange from highest to lowest', () => {
  const ranked = rankGroups([
    { id: 'a', name: 'Group A', score: 1 },
    { id: 'b', name: 'Group B', score: 4 },
    { id: 'c', name: 'Group C', score: 4 },
  ]);
  assert.deepEqual(
    ranked.map((group) => [group.name, group.rank]),
    [
      ['Group B', 1],
      ['Group C', 1],
      ['Group A', 3],
    ]
  );
});

test('locked selections match only the full correct set', () => {
  assert.equal(selectionsMatch([1], [1]), true);
  assert.equal(selectionsMatch([0, 1], [1, 0]), true);
  assert.equal(selectionsMatch([0], [1]), false);
  assert.equal(selectionsMatch([0], [0, 1]), false);
});
