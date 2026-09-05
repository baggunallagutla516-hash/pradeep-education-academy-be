import { ApiError } from '../utils/ApiError.js';
import { verifyAdminToken } from '../utils/tokens.js';
import { Admin } from '../models/Admin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protectAdmin = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.adminToken;

  if (!token) {
    throw new ApiError(401, 'Please log in as admin to continue');
  }

  let decoded;
  try {
    decoded = verifyAdminToken(token);
  } catch {
    throw new ApiError(401, 'Admin session expired. Please log in again');
  }

  if (decoded.role !== 'admin') {
    throw new ApiError(403, 'Admin access required');
  }

  const admin = await Admin.findById(decoded.id);

  if (!admin || !admin.isActive) {
    throw new ApiError(401, 'Admin account not found or inactive');
  }

  req.admin = admin;
  next();
});
