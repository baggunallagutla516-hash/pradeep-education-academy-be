import { Student } from '../models/Student.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicStudent } from '../utils/authResponse.js';
import { assertActiveClassId } from '../utils/schoolClass.js';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

async function loadStudentWithParents(studentId) {
  const student = await Student.findOne({ _id: studentId, deletedAt: null })
    .populate('studentClass', 'name')
    .populate('parentIds', 'fullName email phone role isActive');
  if (!student) return null;

  const parents = (student.parentIds || [])
    .filter((p) => p && typeof p === 'object' && p._id)
    .map((p) => ({
      id: p._id,
      fullName: p.fullName,
      email: p.email,
      phone: p.phone,
      role: p.role,
      isActive: p.isActive,
    }));

  return {
    ...toPublicStudent({
      ...student.toObject(),
      parentIds: parents.map((p) => p.id),
    }),
    isActive: student.isActive,
    parents,
  };
}

export const listStudents = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();

  const filter = { deletedAt: null };
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { schoolName: { $regex: q, $options: 'i' } },
    ];
  }
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const [items, total] = await Promise.all([
    Student.find(filter)
      .populate('studentClass', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Student.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      students: items.map((s) => ({
        ...toPublicStudent(s),
        isActive: s.isActive,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

export const getStudent = asyncHandler(async (req, res) => {
  const student = await loadStudentWithParents(req.params.id);
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  res.status(200).json({
    success: true,
    data: { student },
  });
});

export const updateStudent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, studentClass, schoolName, rollNumber } = req.body;

  if (!fullName || !email || !phone || !studentClass) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  await assertActiveClassId(studentClass);

  const student = await Student.findOne({ _id: req.params.id, deletedAt: null });
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  const conflict = await Student.findOne({
    _id: { $ne: student._id },
    deletedAt: null,
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (conflict) {
    if (conflict.email === normalizedEmail) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    throw new ApiError(409, 'An account with this phone number already exists');
  }

  student.fullName = String(fullName).trim();
  student.email = normalizedEmail;
  student.phone = normalizedPhone;
  student.studentClass = studentClass;
  student.schoolName = schoolName?.trim() || '';
  student.rollNumber = rollNumber?.trim() || '';
  await student.save();

  const populated = await loadStudentWithParents(student._id);

  res.status(200).json({
    success: true,
    message: 'Student updated',
    data: { student: populated },
  });
});

export const setStudentActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive boolean is required');
  }

  const student = await Student.findOne({ _id: req.params.id, deletedAt: null }).populate(
    'studentClass',
    'name'
  );
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  student.isActive = isActive;
  await student.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: isActive ? 'Student activated' : 'Student deactivated',
    data: {
      student: {
        ...toPublicStudent(student),
        isActive: student.isActive,
      },
    },
  });
});

export const softDeleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, deletedAt: null });
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  student.deletedAt = new Date();
  student.isActive = false;
  await student.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Student deleted',
  });
});
