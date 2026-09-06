import { ApiError } from './ApiError.js';

function hasId(list, id) {
  return (list || []).some((entry) => String(entry) === String(id));
}

export async function linkParentAndStudent(parent, student) {
  if (!parent?.isActive) {
    throw new ApiError(403, 'Parent account is inactive');
  }
  if (!student?.isActive || student?.deletedAt) {
    throw new ApiError(403, 'Student account is inactive');
  }

  const already =
    hasId(parent.studentIds, student._id) && hasId(student.parentIds, parent._id);

  if (already) {
    return { alreadyLinked: true };
  }

  if (!hasId(parent.studentIds, student._id)) {
    parent.studentIds.push(student._id);
  }
  if (!hasId(student.parentIds, parent._id)) {
    student.parentIds.push(parent._id);
  }

  await Promise.all([parent.save(), student.save()]);
  return { alreadyLinked: false };
}

export async function unlinkParentAndStudent(parent, student) {
  parent.studentIds = (parent.studentIds || []).filter(
    (id) => String(id) !== String(student._id)
  );
  student.parentIds = (student.parentIds || []).filter(
    (id) => String(id) !== String(parent._id)
  );

  await Promise.all([parent.save(), student.save()]);
}
