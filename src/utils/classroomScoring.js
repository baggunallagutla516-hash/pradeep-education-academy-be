/** Live classroom quiz scoring. Groups stay in seat order; the board sorts them for display. */

export function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function halfOf(marks) {
  return round2(Number(marks) / 2);
}

function copyGroups(groups = []) {
  return groups.map((group) => ({
    ...group,
    members: Array.isArray(group.members) ? group.members.map((member) => ({ ...member })) : [],
  }));
}

/**
 * One group action on the open question.
 * Correct earns the marks on offer.
 * Wrong takes half of the question's marks off that group, locks the answer, and shows the key.
 * Pass (no penalty) or a first miss carries half the marks on offer to the next group.
 * A second miss gives the marks still on offer to the master.
 */
export function applyGroupAction(state, action) {
  if (!state.questionOpen) {
    throw new Error('This question is already locked.');
  }

  const groups = copyGroups(state.groups);
  const group = groups[state.turnIndex];
  if (!group) throw new Error('No group is on turn.');

  const questionMarks = Number(state.questionMarks);
  let stake = round2(state.stake);
  let failCount = state.failCount;
  let masterScore = round2(state.masterScore);
  let questionOpen = true;
  let revealCorrect = false;
  let nextTurnIndex = state.turnIndex;
  let scoreDelta = 0;
  let masterGain = 0;
  let emoji = '';
  let headline = '';
  let detail = '';

  if (action === 'correct') {
    scoreDelta = stake;
    group.score = round2(group.score + scoreDelta);
    questionOpen = false;
    revealCorrect = true;
    emoji = '🎉';
    headline = 'Correct';
    detail = `${group.name} earns ${scoreDelta} marks.`;
  } else if (action === 'wrong' || action === 'pass') {
    if (action === 'wrong') {
      const penalty = halfOf(questionMarks);
      scoreDelta = round2(-penalty);
      group.score = round2(group.score + scoreDelta);
      emoji = '❌';
      headline = 'Wrong';
      revealCorrect = true;
    } else {
      emoji = '⏭️';
      headline = 'Passed';
    }

    failCount += 1;

    if (failCount >= 2) {
      masterGain = stake;
      masterScore = round2(masterScore + masterGain);
      questionOpen = false;
      revealCorrect = true;
      detail =
        action === 'wrong'
          ? `${group.name} loses ${Math.abs(scoreDelta)} marks. Two groups missed it, so ${masterGain} marks go to the master.`
          : `${group.name} passed. Two groups did not answer, so ${masterGain} marks go to the master.`;
    } else {
      const carried = halfOf(stake);
      stake = carried;
      nextTurnIndex = (state.turnIndex + 1) % groups.length;
      const nextName = groups[nextTurnIndex]?.name || 'the next group';
      detail =
        action === 'wrong'
          ? `${group.name} loses ${Math.abs(scoreDelta)} marks. The answer is locked. ${carried} marks carry to ${nextName}.`
          : `${group.name} passed. ${carried} marks carry to ${nextName}.`;
    }
  } else {
    throw new Error('Unknown classroom action.');
  }

  return {
    groups,
    turnIndex: nextTurnIndex,
    stake: questionOpen ? stake : round2(state.stake),
    failCount,
    masterScore,
    questionOpen,
    revealCorrect,
    emoji,
    headline,
    detail,
    scoreDelta,
    masterGain,
    groupId: group.id,
    groupName: group.name,
    outcome: action,
  };
}

export function awardMasterMarks(state, { groupId, marks }) {
  const amount = round2(marks);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter marks greater than zero.');
  }
  if (amount - round2(state.masterScore) > 0.001) {
    throw new Error('The master does not have that many marks.');
  }

  const groups = copyGroups(state.groups);
  const group = groups.find((item) => String(item.id) === String(groupId));
  if (!group) throw new Error('Choose a group.');

  group.score = round2(group.score + amount);

  return {
    groups,
    masterScore: round2(state.masterScore - amount),
    amount,
    groupId: group.id,
    groupName: group.name,
  };
}

/** Highest score first. Equal scores share a rank. */
export function rankGroups(groups = []) {
  const ordered = [...groups].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.name).localeCompare(String(b.name));
  });

  let rank = 0;
  let previous = null;
  return ordered.map((group, index) => {
    if (group.score !== previous) {
      rank = index + 1;
      previous = group.score;
    }
    return { ...group, rank };
  });
}

export function selectionsMatch(selected = [], correct = []) {
  const left = [...new Set(selected.map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  const right = [...new Set(correct.map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
