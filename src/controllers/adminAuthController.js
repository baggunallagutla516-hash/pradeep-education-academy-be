import { Admin } from '../models/Admin.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAdminToken } from '../utils/tokens.js';
import {
  clearAdminAuthCookie,
  sendAdminAuthResponse,
  toPublicAdmin,
} from '../utils/adminAuthResponse.js';

export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!admin || !(await admin.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!admin.isActive) {
    throw new ApiError(403, 'Your admin account is inactive');
  }

  admin.lastLoginAt = new Date();
  await admin.save({ validateBeforeSave: false });

  const token = signAdminToken({ id: admin._id, role: 'admin' });
  sendAdminAuthResponse(res, admin, token, 200, 'Admin login successful');
});

export const adminLogout = asyncHandler(async (_req, res) => {
  clearAdminAuthCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const getAdminMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      admin: toPublicAdmin(req.admin),
    },
  });
});
