import mongoose from 'mongoose';
import { SchoolClass, toPublicClass } from '../models/SchoolClass.js';
import { ApiError } from './ApiError.js';

export { toPublicClass };

export async function listActiveClasses() {
  return SchoolClass.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
}

export async function listAllClasses() {
  return SchoolClass.find().sort({ sortOrder: 1, name: 1 });
}

export async function assertActiveClassId(classId) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new ApiError(400, 'Please select a valid class');
  }
  const doc = await SchoolClass.findOne({ _id: classId, isActive: true });
  if (!doc) {
    throw new ApiError(400, 'Please select a valid class');
  }
  return doc;
}

/** Validate and return unique active class ObjectIds. */
export async function assertActiveClassIds(rawIds, { required = true } = {}) {
  const list = Array.isArray(rawIds) ? rawIds : [];
  const unique = [
    ...new Set(list.map((value) => String(value || '').trim()).filter(Boolean)),
  ];

  if (unique.length === 0) {
    if (required) {
      throw new ApiError(400, 'Please select at least one class');
    }
    return [];
  }

  const docs = await SchoolClass.find({
    _id: { $in: unique },
    isActive: true,
  }).select('_id');

  if (docs.length !== unique.length) {
    throw new ApiError(400, 'Please select valid classes only');
  }

  const found = new Set(docs.map((doc) => String(doc._id)));
  return unique.filter((id) => found.has(id)).map((id) => new mongoose.Types.ObjectId(id));
}

export function classIdsOf(userOrDoc) {
  const list = userOrDoc?.classes || [];
  return list
    .map((value) => {
      if (!value) return '';
      if (typeof value === 'object' && value._id) return String(value._id);
      return String(value);
    })
    .filter(Boolean);
}

export function toPublicClasses(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'object' && item._id) {
        return { id: String(item._id), name: item.name || '' };
      }
      return { id: String(item), name: '' };
    })
    .filter(Boolean);
}

/**
 * Build Mongo studentClass filter for assigned classes.
 * Supports both legacy `studentClass` and multi `studentClasses`.
 * Empty assigned classes → empty $in (see nothing).
 */
export async function buildAssignedClassFilter(userOrDoc, queryClass = '') {
  const assigned = classIdsOf(userOrDoc);
  if (assigned.length === 0) {
    return {
      filter: { studentClass: { $in: [] } },
      assignedIds: [],
      selectedClass: null,
    };
  }

  const selected = typeof queryClass === 'string' ? queryClass.trim() : '';
  const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(id));

  if (selected) {
    if (!assigned.includes(selected)) {
      throw new ApiError(403, 'You are not assigned to this class');
    }
    await assertActiveClassId(selected);
    const oid = new mongoose.Types.ObjectId(selected);
    return {
      filter: {
        $or: [{ studentClasses: oid }, { studentClass: oid }],
      },
      assignedIds: assigned,
      selectedClass: selected,
    };
  }

  const objectIds = toObjectIds(assigned);
  return {
    filter: {
      $or: [{ studentClasses: { $in: objectIds } }, { studentClass: { $in: objectIds } }],
    },
    assignedIds: assigned,
    selectedClass: null,
  };
}

export function docClassIds(doc) {
  const ids = new Set();
  const add = (value) => {
    if (!value) return;
    if (typeof value === 'object' && value._id) ids.add(String(value._id));
    else ids.add(String(value));
  };
  add(doc?.studentClass);
  (Array.isArray(doc?.studentClasses) ? doc.studentClasses : []).forEach(add);
  return [...ids];
}

export function classVisibilityForStudent(classId) {
  if (!classId) return { studentClass: null };
  const oid =
    classId instanceof mongoose.Types.ObjectId
      ? classId
      : new mongoose.Types.ObjectId(String(classId));
  return {
    $or: [{ studentClasses: oid }, { studentClass: oid }],
  };
}

/** Legacy content with no classes assigned (visible to everyone). */
export function unscopedClassContentFilter() {
  return {
    $and: [
      {
        $or: [{ studentClasses: { $size: 0 } }, { studentClasses: { $exists: false } }],
      },
      { studentClass: null },
    ],
  };
}

/**
 * Match student's class OR legacy unscoped docs (empty studentClasses + null studentClass).
 * Prefer for quizzes where older rows had no class assignment.
 */
export function classVisibilityOrUnscoped(classId) {
  if (!classId) return unscopedClassContentFilter();
  const visibility = classVisibilityForStudent(classId);
  return {
    $or: [unscopedClassContentFilter(), ...(visibility.$or || [visibility])],
  };
}

/** Merge educator assigned-class filter with legacy unscoped visibility. */
export function assignedClassVisibilityOrUnscoped(classFilter) {
  if (classFilter?.$or) {
    return { $or: [unscopedClassContentFilter(), ...classFilter.$or] };
  }
  return unscopedClassContentFilter();
}

export function toPublicClassList(doc) {
  const fromArray = Array.isArray(doc?.studentClasses) ? doc.studentClasses : [];
  if (fromArray.length > 0) {
    return toPublicClasses(fromArray);
  }
  if (doc?.studentClass) {
    return toPublicClasses([doc.studentClass]);
  }
  return [];
}

export async function listClassesByIds(ids) {
  if (!ids?.length) return [];
  return SchoolClass.find({
    _id: { $in: ids },
    isActive: true,
  }).sort({ sortOrder: 1, name: 1 });
}

export function assertDocInAssignedClasses(doc, userOrDoc, label = 'Item') {
  const assigned = classIdsOf(userOrDoc);
  const examIds = docClassIds(doc);
  if (!examIds.some((id) => assigned.includes(id))) {
    throw new ApiError(404, `${label} not found`);
  }
}

export function classRefFields(value) {
  if (!value) {
    return { studentClass: null, studentClassName: '' };
  }
  if (typeof value === 'object' && value._id) {
    return {
      studentClass: String(value._id),
      studentClassName: value.name || '',
    };
  }
  return {
    studentClass: String(value),
    studentClassName: '',
  };
}

/** Parse class ids from JSON or multipart bodies (array, single, JSON string, CSV). */
export function parseClassIdsFromBody(body) {
  const hasMulti = body && Object.prototype.hasOwnProperty.call(body, 'studentClasses');
  const raw = hasMulti ? body.studentClasses : body?.studentClass;
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* fall through */
      }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [raw];
}

export async function resolveContentClasses(body, { required = true } = {}) {
  const classIds = await assertActiveClassIds(parseClassIdsFromBody(body), { required });
  return {
    studentClasses: classIds,
    studentClass: classIds[0] || null,
  };
}

export function contentClassJsonFields(doc) {
  const classes = toPublicClassList(doc);
  const classFields = classRefFields(doc.studentClass || classes[0] || null);
  return {
    studentClass: classFields.studentClass || classes[0]?.id || null,
    studentClassName:
      classes.map((item) => item.name).filter(Boolean).join(', ') || classFields.studentClassName,
    studentClasses: classes,
  };
}
