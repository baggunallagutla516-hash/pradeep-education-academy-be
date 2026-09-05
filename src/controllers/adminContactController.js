import { ContactQuery } from '../models/ContactQuery.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const ALLOWED_STATUSES = ['new', 'read', 'replied'];

function toContactJson(item) {
  return {
    id: item._id,
    name: item.name,
    email: item.email,
    phone: item.phone || '',
    subject: item.subject,
    message: item.message,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const listContactQueries = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();

  const filter = {};
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { subject: { $regex: q, $options: 'i' } },
      { message: { $regex: q, $options: 'i' } },
    ];
  }
  if (ALLOWED_STATUSES.includes(status)) {
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    ContactQuery.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ContactQuery.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      queries: items.map(toContactJson),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    },
  });
});

export const getContactQuery = asyncHandler(async (req, res) => {
  const item = await ContactQuery.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Contact query not found');

  if (item.status === 'new') {
    item.status = 'read';
    await item.save();
  }

  res.status(200).json({
    success: true,
    data: { query: toContactJson(item) },
  });
});

export const updateContactQueryStatus = asyncHandler(async (req, res) => {
  const item = await ContactQuery.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Contact query not found');

  const status = String(req.body.status || '').trim();
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new ApiError(400, 'Status must be new, read, or replied');
  }

  item.status = status;
  await item.save();

  res.status(200).json({
    success: true,
    message: 'Contact query updated',
    data: { query: toContactJson(item) },
  });
});

export const deleteContactQuery = asyncHandler(async (req, res) => {
  const item = await ContactQuery.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, 'Contact query not found');

  res.status(200).json({
    success: true,
    message: 'Contact query deleted',
  });
});
