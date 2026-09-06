import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/tokens.js';
import { Student } from '../models/Student.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    throw new ApiError(401, 'Please log in to continue');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Session expired. Please log in again');
  }

  const student = await Student.findById(decoded.id).populate('studentClass', 'name isActive');

  if (!student || !student.isActive || student.deletedAt) {
    throw new ApiError(401, 'Account not found or inactive. Please log in again');
  }

  req.user = student;
  next();
});
