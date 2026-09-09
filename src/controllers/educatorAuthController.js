import { Educator } from '../models/Educator.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/tokens.js';
import {
  clearEducatorAuthCookie,
  sendEducatorAuthResponse,
  toPublicEducator,
} from '../utils/educatorAuthResponse.js';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

export const registerEducator = asyncHandler(async (req, res) => {
  const { fullName, email, phone, schoolName, password, confirmPassword } = req.body;

  if (!fullName || !email || !phone || !password || !confirmPassword) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  const existing = await Educator.findOne({
    deletedAt: null,
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (existing) {
    if (existing.email === normalizedEmail) {
      throw new ApiError(409, 'An educator account with this email already exists');
    }
    throw new ApiError(409, 'An educator account with this phone number already exists');
  }

  const educator = await Educator.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    schoolName: schoolName?.trim() || '',
    password,
  });

  res.status(201).json({
    success: true,
    message:
      'Registration successful. Your account is not active yet. Please contact the admin to activate it.',
    data: {
      educator: toPublicEducator(educator),
    },
  });
});

export const loginEducator = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const educator = await Educator.findOne({
    email: email.toLowerCase().trim(),
    deletedAt: null,
  }).select('+password');

  if (!educator || !(await educator.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!educator.isActive) {
    throw new ApiError(
      403,
      'Your account is not active yet. Please contact the admin to activate it.'
    );
  }

  educator.lastLoginAt = new Date();
  await educator.save({ validateBeforeSave: false });

  const token = signToken({ id: educator._id, role: educator.role });
  sendEducatorAuthResponse(res, educator, token, 200, 'Educator login successful');
});

export const logoutEducator = asyncHandler(async (_req, res) => {
  clearEducatorAuthCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const getEducatorMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      educator: toPublicEducator(req.educator),
    },
  });
});

export const updateEducatorMe = asyncHandler(async (req, res) => {
  const { fullName, email, phone, schoolName } = req.body;

  if (!fullName || !email || !phone) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  const conflict = await Educator.findOne({
    _id: { $ne: req.educator._id },
    deletedAt: null,
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (conflict) {
    if (conflict.email === normalizedEmail) {
      throw new ApiError(409, 'An educator account with this email already exists');
    }
    throw new ApiError(409, 'An educator account with this phone number already exists');
  }

  const educator = await Educator.findById(req.educator._id);
  if (!educator) {
    throw new ApiError(404, 'Educator not found');
  }

  educator.fullName = fullName.trim();
  educator.email = normalizedEmail;
  educator.phone = normalizedPhone;
  educator.schoolName = schoolName?.trim() || '';
  await educator.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      educator: toPublicEducator(educator),
    },
  });
});
