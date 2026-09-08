import { Educator } from '../models/Educator.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toPublicEducator } from '../utils/educatorAuthResponse.js';

export const listEducators = asyncHandler(async (req, res) => {
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
    Educator.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Educator.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      educators: items.map((e) => ({
        ...toPublicEducator(e),
        isActive: e.isActive,
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

export const setEducatorActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive boolean is required');
  }

  const educator = await Educator.findById(req.params.id);
  if (!educator) {
    throw new ApiError(404, 'Educator not found');
  }

  educator.isActive = isActive;
  await educator.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: isActive ? 'Educator activated' : 'Educator deactivated',
    data: {
      educator: {
        ...toPublicEducator(educator),
        isActive: educator.isActive,
      },
    },
  });
});
