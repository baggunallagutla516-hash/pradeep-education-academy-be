import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/tokens.js';
import { Educator } from '../models/Educator.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protectEducator = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.educatorToken;

  if (!token) {
    throw new ApiError(401, 'Please log in as an educator to continue');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Educator session expired. Please log in again');
  }

  if (decoded.role !== 'educator') {
    throw new ApiError(403, 'Educator access required');
  }

  const educator = await Educator.findById(decoded.id);

  if (!educator || !educator.isActive) {
    throw new ApiError(401, 'Educator account not found or inactive');
  }

  req.educator = educator;
  next();
});
