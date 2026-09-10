import { Parent } from '../models/Parent.js';
import { Student } from '../models/Student.js';
import { DppAttempt } from '../models/DppAttempt.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/tokens.js';
import {
  clearParentAuthCookie,
  sendParentAuthResponse,
  toPublicParent,
} from '../utils/parentAuthResponse.js';
import { toPublicStudent } from '../utils/authResponse.js';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

async function loadLinkedChild(parentId, studentId) {
  const parent = await Parent.findById(parentId);
  const linked = (parent?.studentIds || []).some((id) => String(id) === String(studentId));

  if (!linked) {
    throw new ApiError(403, 'You can only view students linked to your account');
  }

  const student = await Student.findById(studentId).populate('studentClass', 'name');
  if (!student || !student.isActive || student.deletedAt) {
    throw new ApiError(404, 'Student not found');
  }

  return student;
}

function mapAttemptResult(attempt, assessment, kind) {
  return {
    id: attempt._id,
    kind,
    assessmentId: assessment?._id || null,
    title: assessment?.title || (kind === 'dpp' ? 'D.P.P.' : 'Slip test'),
    subject: assessment?.subject || '',
    chapter: assessment?.chapter || '',
    date: assessment?.practiceDate || assessment?.publishedAt || attempt.submittedAt,
    scoredMarks: attempt.scoredMarks,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    correctCount: attempt.correctCount,
    partialCount: attempt.partialCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    timeTakenSeconds: attempt.timeTakenSeconds,
    autoSubmitted: attempt.autoSubmitted,
    submittedAt: attempt.submittedAt,
  };
}

export const loginParent = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const parent = await Parent.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!parent || !(await parent.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!parent.isActive) {
    throw new ApiError(403, 'Your account is inactive. Please contact support');
  }

  parent.lastLoginAt = new Date();
  await parent.save({ validateBeforeSave: false });

  const token = signToken({ id: parent._id, role: parent.role });
  sendParentAuthResponse(res, parent, token, 200, 'Parent login successful');
});

export const logoutParent = asyncHandler(async (_req, res) => {
  clearParentAuthCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const getParentMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      parent: toPublicParent(req.parent),
    },
  });
});

export const updateParentMe = asyncHandler(async (req, res) => {
  const { fullName, email, phone } = req.body;

  if (!fullName || !email || !phone) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  const conflict = await Parent.findOne({
    _id: { $ne: req.parent._id },
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (conflict) {
    if (conflict.email === normalizedEmail) {
      throw new ApiError(409, 'A parent account with this email already exists');
    }
    throw new ApiError(409, 'A parent account with this phone number already exists');
  }

  const parent = await Parent.findById(req.parent._id);
  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }

  parent.fullName = fullName.trim();
  parent.email = normalizedEmail;
  parent.phone = normalizedPhone;
  await parent.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      parent: toPublicParent(parent),
    },
  });
});

export const listChildren = asyncHandler(async (req, res) => {
  const parent = await Parent.findById(req.parent._id);
  const students = await Student.find({
    _id: { $in: parent.studentIds || [] },
    isActive: true,
    deletedAt: null,
  })
    .populate('studentClass', 'name')
    .sort({ fullName: 1 });

  res.status(200).json({
    success: true,
    data: {
      children: students.map(toPublicStudent),
    },
  });
});

export const getChild = asyncHandler(async (req, res) => {
  const student = await loadLinkedChild(req.parent._id, req.params.studentId);

  res.status(200).json({
    success: true,
    data: {
      child: toPublicStudent(student),
    },
  });
});

export const getChildResults = asyncHandler(async (req, res) => {
  const student = await loadLinkedChild(req.parent._id, req.params.studentId);

  const [dppAttempts, slipAttempts] = await Promise.all([
    DppAttempt.find({ student: student._id, status: 'submitted' })
      .populate('dpp', 'title subject practiceDate publishedAt')
      .sort({ submittedAt: -1 }),
    SlipTestAttempt.find({ student: student._id, status: 'submitted' })
      .populate('slipTest', 'title subject chapter publishedAt')
      .sort({ submittedAt: -1 }),
  ]);

  const dpps = dppAttempts.map((attempt) => mapAttemptResult(attempt, attempt.dpp, 'dpp'));
  const slipTests = slipAttempts.map((attempt) =>
    mapAttemptResult(attempt, attempt.slipTest, 'slip_test')
  );

  res.status(200).json({
    success: true,
    data: {
      child: toPublicStudent(student),
      results: {
        dpps,
        slipTests,
        all: [...dpps, ...slipTests].sort(
          (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
        ),
      },
    },
  });
});
