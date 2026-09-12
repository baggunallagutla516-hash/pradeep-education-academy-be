import mongoose from 'mongoose';
import { Student } from '../models/Student.js';
import { Educator } from '../models/Educator.js';
import { Parent } from '../models/Parent.js';

export const EXAM_PARTICIPANT_ROLES = ['student', 'educator', 'parent'];

export const PARTICIPANT_MODEL_BY_ROLE = {
  student: 'Student',
  educator: 'Educator',
  parent: 'Parent',
};

export const ROLE_LABEL = {
  student: 'Student',
  educator: 'Educator',
  parent: 'Parent',
};

const PARTICIPANT_SELECT = 'fullName email rollNumber isActive deletedAt';

/** Identity fields for an attempt. `student` is only set for actual students. */
export function participantIdentity(role, id) {
  const participantRole = EXAM_PARTICIPANT_ROLES.includes(role) ? role : 'student';
  const fields = {
    participantRole,
    participantModel: PARTICIPANT_MODEL_BY_ROLE[participantRole],
    participantId: id,
  };
  if (participantRole === 'student') fields.student = id;
  return fields;
}

export function participantSchemaFields() {
  return {
    participantRole: {
      type: String,
      enum: EXAM_PARTICIPANT_ROLES,
      required: true,
    },
    participantModel: {
      type: String,
      enum: Object.values(PARTICIPANT_MODEL_BY_ROLE),
      required: true,
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'participantModel',
      required: true,
    },
    /**
     * Set only when the participant is a student, so the unique student index
     * does not collide with educator/parent attempts.
     */
    student: {
      type: mongoose.Schema.Types.ObjectId,
    },
  };
}

export function attemptParticipant(attempt) {
  const role = attempt?.participantRole || (attempt?.student ? 'student' : null);
  const id = attempt?.participantId || attempt?.student || null;
  return { role, id };
}

export function participantKey(attempt) {
  const { role, id } = attemptParticipant(attempt);
  return `${role || 'student'}:${id}`;
}

export async function loadParticipantsByRole(attempts) {
  const idsByRole = {
    student: new Set(),
    educator: new Set(),
    parent: new Set(),
  };

  attempts.forEach((attempt) => {
    const { role, id } = attemptParticipant(attempt);
    if (role && id && idsByRole[role]) idsByRole[role].add(String(id));
  });

  const [students, educators, parents] = await Promise.all([
    idsByRole.student.size
      ? Student.find({ _id: { $in: [...idsByRole.student] } }).select(PARTICIPANT_SELECT)
      : [],
    idsByRole.educator.size
      ? Educator.find({ _id: { $in: [...idsByRole.educator] } }).select(PARTICIPANT_SELECT)
      : [],
    idsByRole.parent.size
      ? Parent.find({ _id: { $in: [...idsByRole.parent] } }).select(PARTICIPANT_SELECT)
      : [],
  ]);

  const map = new Map();
  students.forEach((doc) => map.set(`student:${doc._id}`, doc));
  educators.forEach((doc) => map.set(`educator:${doc._id}`, doc));
  parents.forEach((doc) => map.set(`parent:${doc._id}`, doc));
  return map;
}

export function participantResultFields(attempt, person) {
  const { role, id } = attemptParticipant(attempt);
  const label = ROLE_LABEL[role] || 'User';
  return {
    participantRole: role,
    roleLabel: ROLE_LABEL[role] || role,
    studentId: person?._id || id,
    studentName: person?.fullName || `Deleted ${label.toLowerCase()}`,
    studentEmail: person?.email || '',
    rollNumber: person?.rollNumber || '',
  };
}

export function resultUrlForRole(clientOrigin, examPath, examId, role) {
  if (!clientOrigin) return '';
  const base = clientOrigin.replace(/\/$/, '');
  const prefix = role === 'educator' ? '/educator' : role === 'parent' ? '/parent' : '';
  return `${base}${prefix}/${examPath}/${examId}/result`;
}

/** Point existing attempts at Student, Educator, or Parent instead of only Student. */
export async function backfillAttemptParticipants(model) {
  await model.updateMany({ participantRole: { $in: ['educator', 'parent'] }, student: null }, {
    $unset: { student: '' },
  });

  await model.updateMany({ participantModel: { $exists: false } }, [
    {
      $set: {
        participantRole: { $ifNull: ['$participantRole', 'student'] },
        participantId: { $ifNull: ['$participantId', '$student'] },
        participantModel: {
          $switch: {
            branches: [
              {
                case: { $eq: [{ $ifNull: ['$participantRole', 'student'] }, 'educator'] },
                then: 'Educator',
              },
              {
                case: { $eq: [{ $ifNull: ['$participantRole', 'student'] }, 'parent'] },
                then: 'Parent',
              },
            ],
            default: 'Student',
          },
        },
      },
    },
  ]);

  await model.updateMany(
    { participantRole: { $in: ['educator', 'parent'] } },
    { $unset: { student: '' } }
  );
}
