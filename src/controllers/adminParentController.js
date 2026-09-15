import { Parent } from '../models/Parent.js';
import { Student } from '../models/Student.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicParent } from '../utils/parentAuthResponse.js';
import { toPublicStudent } from '../utils/authResponse.js';
import {
  linkParentAndStudent,
  unlinkParentAndStudent,
} from '../utils/parentStudentLink.js';
import { assertActiveClassIds } from '../utils/schoolClass.js';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function toAdminParent(parent) {
  return {
    ...toPublicParent(parent),
    isActive: parent.isActive,
  };
}

export const listParents = asyncHandler(async (req, res) => {
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
    ];
  }
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const [items, total] = await Promise.all([
    Parent.find(filter)
      .populate('classes', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Parent.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      parents: items.map(toAdminParent),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

export const getParent = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ _id: req.params.id, deletedAt: null })
    .populate('classes', 'name')
    .populate({
      path: 'studentIds',
      select: 'fullName email phone studentClass schoolName rollNumber registrationId isActive deletedAt',
      populate: { path: 'studentClass', select: 'name' },
    });
  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }

  const children = (parent.studentIds || [])
    .filter((s) => s && typeof s === 'object' && s._id && !s.deletedAt)
    .map((s) => ({
      ...toPublicStudent({
        ...s.toObject(),
        parentIds: [],
      }),
      isActive: s.isActive,
    }));

  res.status(200).json({
    success: true,
    data: {
      parent: {
        ...toAdminParent({
          ...parent.toObject(),
          studentIds: children.map((c) => c.id),
        }),
        children,
      },
    },
  });
});

export const createParent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, confirmPassword, classes } = req.body;

  if (!fullName || !email || !phone || !password || !confirmPassword) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match');
  }

  if (String(password).length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email.toLowerCase().trim();

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  const classIds = await assertActiveClassIds(classes);

  const existing = await Parent.findOne({
    deletedAt: null,
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (existing) {
    if (existing.email === normalizedEmail) {
      throw new ApiError(409, 'A parent account with this email already exists');
    }
    throw new ApiError(409, 'A parent account with this phone number already exists');
  }

  const parent = await Parent.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    classes: classIds,
  });

  await parent.populate('classes', 'name');

  res.status(201).json({
    success: true,
    message: 'Parent account created. Share login details with the parent.',
    data: {
      parent: toAdminParent(parent),
    },
  });
});

export const updateParent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, classes } = req.body;

  if (!fullName || !email || !phone) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  const classIds = await assertActiveClassIds(classes, { required: false });

  const parent = await Parent.findOne({ _id: req.params.id, deletedAt: null });
  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }

  const conflict = await Parent.findOne({
    _id: { $ne: parent._id },
    deletedAt: null,
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (conflict) {
    if (conflict.email === normalizedEmail) {
      throw new ApiError(409, 'A parent account with this email already exists');
    }
    throw new ApiError(409, 'A parent account with this phone number already exists');
  }

  parent.fullName = String(fullName).trim();
  parent.email = normalizedEmail;
  parent.phone = normalizedPhone;
  parent.classes = classIds;
  await parent.save();
  await parent.populate('classes', 'name');

  res.status(200).json({
    success: true,
    message: 'Parent updated',
    data: {
      parent: toAdminParent(parent),
    },
  });
});

export const setParentActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive boolean is required');
  }

  const parent = await Parent.findOne({ _id: req.params.id, deletedAt: null });
  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }

  parent.isActive = isActive;
  await parent.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: isActive ? 'Parent activated' : 'Parent deactivated',
    data: {
      parent: toAdminParent(parent),
    },
  });
});

export const linkParentStudent = asyncHandler(async (req, res) => {
  const { parentId, studentId } = req.body;

  if (!parentId || !studentId) {
    throw new ApiError(400, 'parentId and studentId are required');
  }

  const [parent, student] = await Promise.all([
    Parent.findOne({ _id: parentId, deletedAt: null }),
    Student.findOne({ _id: studentId, deletedAt: null }).populate('studentClass', 'name'),
  ]);

  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  const result = await linkParentAndStudent(parent, student);

  res.status(200).json({
    success: true,
    message: result.alreadyLinked
      ? 'Parent and student are already linked'
      : 'Parent linked to student successfully',
    data: {
      parent: toAdminParent(parent),
      student: {
        ...toPublicStudent(student),
        isActive: student.isActive,
      },
      alreadyLinked: result.alreadyLinked,
    },
  });
});

export const unlinkParentStudent = asyncHandler(async (req, res) => {
  const { parentId, studentId } = req.body;

  if (!parentId || !studentId) {
    throw new ApiError(400, 'parentId and studentId are required');
  }

  const [parent, student] = await Promise.all([
    Parent.findOne({ _id: parentId, deletedAt: null }),
    Student.findOne({ _id: studentId, deletedAt: null }).populate('studentClass', 'name'),
  ]);

  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  const linked = (parent.studentIds || []).some((id) => String(id) === String(student._id));
  if (!linked) {
    throw new ApiError(404, 'This parent and student are not linked');
  }

  await unlinkParentAndStudent(parent, student);

  res.status(200).json({
    success: true,
    message: 'Parent unlinked from student successfully',
    data: {
      parent: toAdminParent(parent),
      student: {
        ...toPublicStudent(student),
        isActive: student.isActive,
      },
    },
  });
});

export const addParentToStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  const { fullName, email, phone, password, confirmPassword, classes } = req.body;

  if (!fullName || !email || !phone) {
    throw new ApiError(400, 'Full name, email, and phone are required');
  }

  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email.toLowerCase().trim();

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  let parent = await Parent.findOne({ email: normalizedEmail, deletedAt: null });
  let created = false;

  if (parent) {
    const result = await linkParentAndStudent(parent, student);
    return res.status(200).json({
      success: true,
      message: result.alreadyLinked
        ? 'This parent is already linked to the student'
        : 'Existing parent linked to student successfully',
      data: {
        parent: toAdminParent(parent),
        created: false,
        alreadyLinked: result.alreadyLinked,
      },
    });
  }

  if (!password || !confirmPassword) {
    throw new ApiError(400, 'Password is required for a new parent account');
  }
  if (password !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match');
  }
  if (String(password).length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const phoneTaken = await Parent.findOne({
    phone: normalizedPhone,
    deletedAt: null,
  }).select('_id');
  if (phoneTaken) {
    throw new ApiError(409, 'A parent account with this phone number already exists');
  }

  const fallbackClasses =
    Array.isArray(classes) && classes.length > 0
      ? classes
      : student.studentClass
        ? [String(student.studentClass)]
        : [];
  const classIds = await assertActiveClassIds(fallbackClasses);

  parent = await Parent.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    classes: classIds,
  });
  created = true;

  await linkParentAndStudent(parent, student);
  await parent.populate('classes', 'name');

  res.status(201).json({
    success: true,
    message: 'Parent created and linked to student. Share the login details with them.',
    data: {
      parent: toAdminParent(parent),
      created,
      alreadyLinked: false,
    },
  });
});

export const softDeleteParent = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ _id: req.params.id, deletedAt: null });
  if (!parent) {
    throw new ApiError(404, 'Parent not found');
  }

  const linkedStudentIds = [...(parent.studentIds || [])];
  if (linkedStudentIds.length > 0) {
    const students = await Student.find({
      _id: { $in: linkedStudentIds },
      deletedAt: null,
    });
    for (const student of students) {
      await unlinkParentAndStudent(parent, student);
    }
  }

  parent.deletedAt = new Date();
  parent.isActive = false;
  parent.studentIds = [];
  await parent.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Parent deleted',
  });
});
