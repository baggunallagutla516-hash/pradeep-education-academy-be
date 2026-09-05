import { Visitor } from '../models/Visitor.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getCookieOptions } from '../utils/authResponse.js';

export const getVisitorCount = asyncHandler(async (_req, res) => {
  const doc = await Visitor.findOne({ key: 'global' }).lean();

  res.status(200).json({
    success: true,
    data: {
      count: doc?.count ?? 0,
    },
  });
});

export const trackVisitor = asyncHandler(async (req, res) => {
  const alreadyCounted = Boolean(req.cookies?.visitorCounted);

  if (alreadyCounted) {
    const current = await Visitor.findOne({ key: 'global' }).lean();
    return res.status(200).json({
      success: true,
      message: 'Visitor already counted for this session',
      data: {
        count: current?.count ?? 0,
        counted: false,
      },
    });
  }

  const updated = await Visitor.findOneAndUpdate(
    { key: 'global' },
    { $inc: { count: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res
    .cookie('visitorCounted', '1', getCookieOptions(24 * 60 * 60 * 1000))
    .status(200)
    .json({
      success: true,
      message: 'Visitor counted',
      data: {
        count: updated.count,
        counted: true,
      },
    });
});
