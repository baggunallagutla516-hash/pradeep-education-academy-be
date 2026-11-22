import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/tokens.js';
import { Student } from '../models/Student.js';
import { Educator } from '../models/Educator.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Accept either a student or educator session for paper purchases. */
export const protectBuyer = asyncHandler(async (req, _res, next) => {
  const studentToken = req.cookies?.token;
  const educatorToken = req.cookies?.educatorToken;

  if (studentToken) {
    let decoded;
    try {
      decoded = verifyToken(studentToken);
    } catch {
      throw new ApiError(401, 'Session expired. Please log in again');
    }

    if (!decoded.role || decoded.role === 'student') {
      const student = await Student.findById(decoded.id).populate('studentClass', 'name isActive');
      if (!student || !student.isActive || student.deletedAt) {
        throw new ApiError(401, 'Account not found or inactive. Please log in again');
      }
      req.buyerType = 'student';
      req.buyerId = student._id;
      req.user = student;
      return next();
    }
  }

  if (educatorToken) {
    let decoded;
    try {
      decoded = verifyToken(educatorToken);
    } catch {
      throw new ApiError(401, 'Educator session expired. Please log in again');
    }

    if (decoded.role !== 'educator') {
      throw new ApiError(403, 'Educator access required');
    }

    const educator = await Educator.findOne({ _id: decoded.id, deletedAt: null }).populate(
      'classes',
      'name'
    );
    if (!educator || !educator.isActive) {
      throw new ApiError(401, 'Educator account not found or inactive');
    }

    req.buyerType = 'educator';
    req.buyerId = educator._id;
    req.educator = educator;
    return next();
  }

  throw new ApiError(401, 'Please log in to continue');
});
