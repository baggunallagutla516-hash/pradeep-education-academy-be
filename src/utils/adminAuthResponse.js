import { getCookieOptions } from './authResponse.js';

export function toPublicAdmin(admin) {
  return {
    id: admin._id,
    fullName: admin.fullName,
    email: admin.email,
    role: admin.role,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  };
}

export function sendAdminAuthResponse(res, admin, token, statusCode = 200, message = 'Success') {
  res
    .cookie('adminToken', token, getCookieOptions(7 * 24 * 60 * 60 * 1000))
    .status(statusCode)
    .json({
      success: true,
      message,
      data: {
        admin: toPublicAdmin(admin),
      },
    });
}

export function clearAdminAuthCookie(res) {
  res.clearCookie('adminToken', getCookieOptions(0));
}
