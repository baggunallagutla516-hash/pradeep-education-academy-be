import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminLogin, adminLogout, getAdminMe } from '../controllers/adminAuthController.js';
import { getDashboardStats } from '../controllers/adminDashboardController.js';
import {
  getStudent,
  listStudents,
  setStudentActive,
  softDeleteStudent,
  updateStudent,
} from '../controllers/adminStudentController.js';
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
} from '../controllers/adminPostController.js';
import {
  createNews,
  deleteNews,
  listNews,
  updateNews,
} from '../controllers/adminNewsController.js';
import {
  createWorksheet,
  deleteWorksheet,
  getWorksheet,
  listWorksheets,
  updateWorksheet,
} from '../controllers/adminWorksheetController.js';
import {
  addParentToStudent,
  createParent,
  getParent,
  linkParentStudent,
  listParents,
  setParentActive,
  unlinkParentStudent,
} from '../controllers/adminParentController.js';
import {
  deleteContactQuery,
  getContactQuery,
  listContactQueries,
  updateContactQueryStatus,
} from '../controllers/adminContactController.js';
import {
  createClass,
  deleteClass,
  getAdminSettings,
  removeSiteLogo,
  updateClass,
  uploadSiteLogo,
} from '../controllers/adminSettingsController.js';
import { protectAdmin } from '../middleware/adminAuth.js';
import { uploadLogo, uploadPoster, uploadWorksheetAssets } from '../middleware/upload.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

const router = Router();

router.post('/login', loginLimiter, adminLogin);
router.post('/logout', adminLogout);
router.get('/me', protectAdmin, getAdminMe);

router.get('/dashboard', protectAdmin, getDashboardStats);

router.get('/students', protectAdmin, listStudents);
router.get('/students/:id', protectAdmin, getStudent);
router.patch('/students/:id', protectAdmin, updateStudent);
router.patch('/students/:id/active', protectAdmin, setStudentActive);
router.delete('/students/:id', protectAdmin, softDeleteStudent);
router.post('/students/:id/parents', protectAdmin, addParentToStudent);

router.get('/parents', protectAdmin, listParents);
router.post('/parents', protectAdmin, createParent);
router.post('/parents/link', protectAdmin, linkParentStudent);
router.post('/parents/unlink', protectAdmin, unlinkParentStudent);
router.get('/parents/:id', protectAdmin, getParent);
router.patch('/parents/:id/active', protectAdmin, setParentActive);

router.get('/posts', protectAdmin, listPosts);
router.get('/posts/:id', protectAdmin, getPost);
router.post('/posts', protectAdmin, uploadPoster, createPost);
router.patch('/posts/:id', protectAdmin, uploadPoster, updatePost);
router.delete('/posts/:id', protectAdmin, deletePost);

router.get('/news', protectAdmin, listNews);
router.post('/news', protectAdmin, createNews);
router.patch('/news/:id', protectAdmin, updateNews);
router.delete('/news/:id', protectAdmin, deleteNews);

router.get('/worksheets', protectAdmin, listWorksheets);
router.get('/worksheets/:id', protectAdmin, getWorksheet);
router.post('/worksheets', protectAdmin, uploadWorksheetAssets, createWorksheet);
router.patch('/worksheets/:id', protectAdmin, uploadWorksheetAssets, updateWorksheet);
router.delete('/worksheets/:id', protectAdmin, deleteWorksheet);

router.get('/contact-queries', protectAdmin, listContactQueries);
router.get('/contact-queries/:id', protectAdmin, getContactQuery);
router.patch('/contact-queries/:id', protectAdmin, updateContactQueryStatus);
router.delete('/contact-queries/:id', protectAdmin, deleteContactQuery);

router.get('/settings', protectAdmin, getAdminSettings);
router.post('/settings/logo', protectAdmin, uploadLogo, uploadSiteLogo);
router.delete('/settings/logo', protectAdmin, removeSiteLogo);
router.post('/settings/classes', protectAdmin, createClass);
router.patch('/settings/classes/:id', protectAdmin, updateClass);
router.delete('/settings/classes/:id', protectAdmin, deleteClass);

export default router;
