import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertStorageConfigured,
  buildObjectKey,
  uploadDiskFile,
} from '../utils/storage.js';

export const uploadQuestionImage = asyncHandler(async (req, res) => {
  if (!req.file?.path) {
    throw new ApiError(400, 'Image file is required');
  }

  assertStorageConfigured();

  const key = buildObjectKey('questions', req.file.originalname);
  const url = await uploadDiskFile({
    filePath: req.file.path,
    contentType: req.file.mimetype,
    key,
  });

  res.status(201).json({
    success: true,
    data: {
      imageUrl: url,
      imageKey: key,
    },
  });
});
