import { env } from '../config/env.js';
import { classRefFields } from './schoolClass.js';

export function getCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

export function toPublicStudent(student) {
  const classFields = classRefFields(student.studentClass);
  return {
    id: student._id,
    fullName: student.fullName,
    email: student.email,
    phone: student.phone,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    schoolName: student.schoolName,
    rollNumber: student.rollNumber,
    role: student.role,
    parentIds: (student.parentIds || []).map((id) => String(id)),
    createdAt: student.createdAt,
    lastLoginAt: student.lastLoginAt,
  };
}

export function toPublicParentSummary(parent) {
  return {
    id: parent._id,
    fullName: parent.fullName,
    email: parent.email,
    phone: parent.phone,
    role: parent.role,
  };
}

export function sendAuthResponse(res, student, token, statusCode = 200, message = 'Success') {
  res
    .cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000))
    .status(statusCode)
    .json({
      success: true,
      message,
      data: {
        student: toPublicStudent(student),
      },
    });
}

export function clearAuthCookie(res) {
  res.clearCookie('token', getCookieOptions(0));
}
