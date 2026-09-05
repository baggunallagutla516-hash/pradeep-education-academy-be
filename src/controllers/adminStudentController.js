import { Student } from '../models/Student.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicStudent } from '../utils/authResponse.js';

export const listStudents = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();

  const filter = {};
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
    Student.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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
  const student = await Student.findById(req.params.id).populate(
    'parentIds',
    'fullName email phone role isActive'
  );
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

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

  res.status(200).json({
    success: true,
    data: {
      student: {
        ...toPublicStudent({
          ...student.toObject(),
          parentIds: parents.map((p) => p.id),
        }),
        isActive: student.isActive,
        parents,
      },
    },
  });
});

export const setStudentActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive boolean is required');
  }

  const student = await Student.findById(req.params.id);
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
