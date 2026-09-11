import { Educator } from '../models/Educator.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { sendAccountActivatedEmail } from '../utils/mailer.js';
import { toPublicEducator } from '../utils/educatorAuthResponse.js';

function normalizePhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .slice(-10);
}

function toAdminEducator(educator) {
  return {
    ...toPublicEducator(educator),
    isActive: educator.isActive,
  };
}

export const listEducators = asyncHandler(async (req, res) => {
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
    Educator.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Educator.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      educators: items.map(toAdminEducator),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

export const getEducator = asyncHandler(async (req, res) => {
  const educator = await Educator.findOne({ _id: req.params.id, deletedAt: null });
  if (!educator) {
    throw new ApiError(404, 'Educator not found');
  }

  res.status(200).json({
    success: true,
    data: { educator: toAdminEducator(educator) },
  });
});

export const updateEducator = asyncHandler(async (req, res) => {
  const { fullName, email, phone, schoolName } = req.body;

  if (!fullName || !email || !phone) {
    throw new ApiError(400, 'Please fill in all required fields');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = normalizePhone(phone);

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'Phone must be a valid 10-digit Indian mobile number');
  }

  const educator = await Educator.findOne({ _id: req.params.id, deletedAt: null });
  if (!educator) {
    throw new ApiError(404, 'Educator not found');
  }

  const conflict = await Educator.findOne({
    _id: { $ne: educator._id },
    deletedAt: null,
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  }).select('_id email phone');

  if (conflict) {
    if (conflict.email === normalizedEmail) {
      throw new ApiError(409, 'An educator account with this email already exists');
    }
    throw new ApiError(409, 'An educator account with this phone number already exists');
  }

  educator.fullName = String(fullName).trim();
  educator.email = normalizedEmail;
  educator.phone = normalizedPhone;
  educator.schoolName = schoolName?.trim() || '';
  await educator.save();

  res.status(200).json({
    success: true,
    message: 'Educator updated',
    data: { educator: toAdminEducator(educator) },
  });
});

export const setEducatorActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive boolean is required');
  }

  const educator = await Educator.findOne({ _id: req.params.id, deletedAt: null });
  if (!educator) {
    throw new ApiError(404, 'Educator not found');
  }

  const wasActive = Boolean(educator.isActive);
  educator.isActive = isActive;
  await educator.save({ validateBeforeSave: false });

  if (isActive && !wasActive && educator.email) {
    const clientOrigin = env.clientOrigins[0] || '';
    const loginUrl = clientOrigin ? `${clientOrigin.replace(/\/$/, '')}/educator/login` : '';
    try {
      await sendAccountActivatedEmail({
        to: educator.email,
        name: educator.fullName,
        loginUrl,
        roleLabel: 'educator account',
      });
    } catch (err) {
      console.error(`[mailer] Failed to email activation to ${educator.email}:`, err?.message || err);
    }
  }

  res.status(200).json({
    success: true,
    message: isActive ? 'Educator activated' : 'Educator deactivated',
    data: {
      educator: toAdminEducator(educator),
    },
  });
});

export const softDeleteEducator = asyncHandler(async (req, res) => {
  const educator = await Educator.findOne({ _id: req.params.id, deletedAt: null });
  if (!educator) {
    throw new ApiError(404, 'Educator not found');
  }

  educator.deletedAt = new Date();
  educator.isActive = false;
  await educator.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Educator deleted',
  });
});
