import { getCookieOptions } from './authResponse.js';
import { toPublicClasses } from './schoolClass.js';

export function toPublicEducator(educator) {
  return {
    id: educator._id,
    fullName: educator.fullName,
    email: educator.email,
    phone: educator.phone,
    schoolName: educator.schoolName || '',
    classes: toPublicClasses(educator.classes),
    role: educator.role,
    createdAt: educator.createdAt,
    lastLoginAt: educator.lastLoginAt,
  };
}

export function sendEducatorAuthResponse(
  res,
  educator,
  token,
  statusCode = 200,
  message = 'Success'
) {
  res
    .cookie('educatorToken', token, getCookieOptions(7 * 24 * 60 * 60 * 1000))
    .status(statusCode)
    .json({
      success: true,
      message,
      data: {
        educator: toPublicEducator(educator),
      },
    });
}

export function clearEducatorAuthCookie(res) {
  res.clearCookie('educatorToken', getCookieOptions(0));
}
