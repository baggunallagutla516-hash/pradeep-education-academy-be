import { Student } from '../models/Student.js';
import { Parent } from '../models/Parent.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/tokens.js';
import {
  clearAuthCookie,
  sendAuthResponse,
  toPublicParentSummary,
  toPublicStudent,
} from '../utils/authResponse.js';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

export const register = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    phone,
    studentClass,
    schoolName,
    rollNumber,
    password,
    confirmPassword,
  } = req.body;

  if (!fullName || !email || !phone || !studentClass || !password || !confirmPassword) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match');
  }

  const normalizedPhone = normalizePhone(phone);

  const existing = await Student.findOne({
    $or: [{ email: email.toLowerCase().trim() }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (existing) {
    if (existing.email === email.toLowerCase().trim()) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    throw new ApiError(409, 'An account with this phone number already exists');
  }

  const student = await Student.create({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    phone: normalizedPhone,
    studentClass,
    schoolName: schoolName?.trim() || '',
    rollNumber: rollNumber?.trim() || '',
    password,
  });

  const token = signToken({ id: student._id, role: student.role });
  sendAuthResponse(res, student, token, 201, 'Registration successful. Welcome!');
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const student = await Student.findOne({ email: email.toLowerCase().trim() }).select(
    '+password'
  );

  if (!student || !(await student.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!student.isActive) {
    throw new ApiError(403, 'Your account is inactive. Please contact support');
  }

  student.lastLoginAt = new Date();
  await student.save({ validateBeforeSave: false });

  const token = signToken({ id: student._id, role: student.role });
  sendAuthResponse(res, student, token, 200, 'Login successful');
});

export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      student: toPublicStudent(req.user),
    },
  });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { fullName, email, phone, studentClass, schoolName, rollNumber } = req.body;

  if (!fullName || !email || !phone || !studentClass) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  if (!Student.CLASS_OPTIONS.includes(studentClass)) {
    throw new ApiError(400, 'Please select a valid class');
  }

  const conflict = await Student.findOne({
    _id: { $ne: req.user._id },
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (conflict) {
    if (conflict.email === normalizedEmail) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    throw new ApiError(409, 'An account with this phone number already exists');
  }

  const student = await Student.findById(req.user._id);
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  student.fullName = fullName.trim();
  student.email = normalizedEmail;
  student.phone = normalizedPhone;
  student.studentClass = studentClass;
  student.schoolName = schoolName?.trim() || '';
  student.rollNumber = rollNumber?.trim() || '';

  await student.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      student: toPublicStudent(student),
    },
  });
});

export const getClassOptions = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      classes: Student.CLASS_OPTIONS,
    },
  });
});

export const listMyParents = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.user._id);
  const parents = await Parent.find({
    _id: { $in: student.parentIds || [] },
    isActive: true,
  }).sort({ fullName: 1 });

  res.status(200).json({
    success: true,
    data: {
      parents: parents.map(toPublicParentSummary),
    },
  });
});
