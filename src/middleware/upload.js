import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { ApiError } from '../utils/ApiError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vercel serverless FS is read-only except /tmp
export const uploadsDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '../../uploads');

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
  /* ignore on restricted filesystems */
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.mimetype)) {
    cb(new ApiError(400, 'Only JPEG, PNG, WebP, or GIF images are allowed'));
    return;
  }
  cb(null, true);
}

export const uploadPoster = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('posterImage');

export const uploadLogo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('logo');

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

function resourceFileFilter(_req, file, cb) {
  if (file.fieldname === 'coverImage') {
    if (!COVER_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, 'Cover image must be JPEG, PNG, WebP, or GIF'));
      return;
    }
    cb(null, true);
    return;
  }
  if (file.fieldname === 'file') {
    if (!FILE_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, 'File type not allowed. Use PDF, Office, ZIP, or image files'));
      return;
    }
    cb(null, true);
    return;
  }
  cb(new ApiError(400, `Unexpected upload field: ${file.fieldname}`));
}

export const uploadWorksheetAssets = multer({
  storage,
  fileFilter: resourceFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
}).fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

export const uploadUnitTestAssets = multer({
  storage,
  fileFilter: resourceFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
}).fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);
