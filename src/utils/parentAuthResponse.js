import { getCookieOptions } from './authResponse.js';
import { toPublicClasses } from './schoolClass.js';

export function toPublicParent(parent) {
  return {
    id: parent._id,
    fullName: parent.fullName,
    email: parent.email,
    phone: parent.phone,
    role: parent.role,
    studentIds: (parent.studentIds || []).map((id) => String(id)),
    classes: toPublicClasses(parent.classes),
    createdAt: parent.createdAt,
    lastLoginAt: parent.lastLoginAt,
  };
}

export function sendParentAuthResponse(res, parent, token, statusCode = 200, message = 'Success') {
  res
    .cookie('parentToken', token, getCookieOptions(7 * 24 * 60 * 60 * 1000))
    .status(statusCode)
    .json({
      success: true,
      message,
      data: {
        parent: toPublicParent(parent),
      },
    });
}

export function clearParentAuthCookie(res) {
  res.clearCookie('parentToken', getCookieOptions(0));
}
