import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/tokens.js';
import { Parent } from '../models/Parent.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protectParent = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.parentToken;

  if (!token) {
    throw new ApiError(401, 'Please log in as a parent to continue');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Parent session expired. Please log in again');
  }

  if (decoded.role !== 'parent') {
    throw new ApiError(403, 'Parent access required');
  }

  const parent = await Parent.findOne({
    _id: decoded.id,
    deletedAt: null,
  }).populate('classes', 'name');

  if (!parent || !parent.isActive) {
    throw new ApiError(401, 'Parent account not found or inactive');
  }

  req.parent = parent;
  next();
});
