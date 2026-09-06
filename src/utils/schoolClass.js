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
