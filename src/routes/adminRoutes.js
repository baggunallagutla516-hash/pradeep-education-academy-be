import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  adminLogin,
  adminLogout,
  forgotAdminPassword,
  getAdminMe,
  resetAdminPassword,
  verifyAdminResetOtp,
} from '../controllers/adminAuthController.js';
import { getDashboardStats } from '../controllers/adminDashboardController.js';
import {
  getStudent,
  listStudents,
  setStudentActive,
  softDeleteStudent,
  updateStudent,
} from '../controllers/adminStudentController.js';
import {
  listEducators,
  getEducator,
  updateEducator,
  setEducatorActive,
  softDeleteEducator,
} from '../controllers/adminEducatorController.js';
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
  createUnitTest,
  deleteUnitTest,
  getUnitTest,
  listUnitTests,
  updateUnitTest,
} from '../controllers/adminUnitTestController.js';
import {
  createCet,
  deleteCet,
  getCet,
  listCets,
  updateCet,
} from '../controllers/adminCetController.js';
import {
  createAssessment,
  deleteAssessment,
  getAssessment,
  listAssessmentResults,
  listAssessments,
  releaseAssessmentResults,
  updateAssessment,
} from '../controllers/adminAssessmentController.js';
import {
  createDpp,
  deleteDpp,
  getDpp,
  listDppResults,
  listDpps,
  releaseDppResults,
  updateDpp,
} from '../controllers/adminDppController.js';
import {
  createSlipTest,
  deleteSlipTest,
  getSlipTest,
  listSlipTestResults,
  listSlipTests,
  releaseSlipTestResults,
  updateSlipTest,
} from '../controllers/adminSlipTestController.js';
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
import {
  uploadLogo,
  uploadPoster,
  uploadCetAssets,
  uploadUnitTestAssets,
  uploadWorksheetAssets,
} from '../middleware/upload.js';

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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again in 15 minutes.',
  },
});

const router = Router();

router.post('/login', loginLimiter, adminLogin);
router.post('/logout', adminLogout);
router.post('/forgot-password', forgotPasswordLimiter, forgotAdminPassword);
router.post('/verify-reset-otp', loginLimiter, verifyAdminResetOtp);
router.post('/reset-password', loginLimiter, resetAdminPassword);
router.get('/me', protectAdmin, getAdminMe);

router.get('/dashboard', protectAdmin, getDashboardStats);

router.get('/students', protectAdmin, listStudents);
router.get('/students/:id', protectAdmin, getStudent);
router.patch('/students/:id', protectAdmin, updateStudent);
router.patch('/students/:id/active', protectAdmin, setStudentActive);
router.delete('/students/:id', protectAdmin, softDeleteStudent);
router.post('/students/:id/parents', protectAdmin, addParentToStudent);

router.get('/educators', protectAdmin, listEducators);
router.get('/educators/:id', protectAdmin, getEducator);
router.patch('/educators/:id', protectAdmin, updateEducator);
router.patch('/educators/:id/active', protectAdmin, setEducatorActive);
router.delete('/educators/:id', protectAdmin, softDeleteEducator);

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

router.get('/unit-tests', protectAdmin, listUnitTests);
router.get('/unit-tests/:id', protectAdmin, getUnitTest);
router.post('/unit-tests', protectAdmin, uploadUnitTestAssets, createUnitTest);
router.patch('/unit-tests/:id', protectAdmin, uploadUnitTestAssets, updateUnitTest);
router.delete('/unit-tests/:id', protectAdmin, deleteUnitTest);

router.get('/cets', protectAdmin, listCets);
router.get('/cets/:id', protectAdmin, getCet);
router.post('/cets', protectAdmin, uploadCetAssets, createCet);
router.patch('/cets/:id', protectAdmin, uploadCetAssets, updateCet);
router.delete('/cets/:id', protectAdmin, deleteCet);

router.get('/assessments', protectAdmin, listAssessments);
router.get('/assessments/:id', protectAdmin, getAssessment);
router.get('/assessments/:id/results', protectAdmin, listAssessmentResults);
router.post('/assessments/:id/release-results', protectAdmin, releaseAssessmentResults);
router.post('/assessments', protectAdmin, createAssessment);
router.patch('/assessments/:id', protectAdmin, updateAssessment);
router.delete('/assessments/:id', protectAdmin, deleteAssessment);

router.get('/dpps', protectAdmin, listDpps);
router.get('/dpps/:id', protectAdmin, getDpp);
router.get('/dpps/:id/results', protectAdmin, listDppResults);
router.post('/dpps/:id/release-results', protectAdmin, releaseDppResults);
router.post('/dpps', protectAdmin, createDpp);
router.patch('/dpps/:id', protectAdmin, updateDpp);
router.delete('/dpps/:id', protectAdmin, deleteDpp);

router.get('/slip-tests', protectAdmin, listSlipTests);
router.get('/slip-tests/:id', protectAdmin, getSlipTest);
router.get('/slip-tests/:id/results', protectAdmin, listSlipTestResults);
router.post('/slip-tests/:id/release-results', protectAdmin, releaseSlipTestResults);
router.post('/slip-tests', protectAdmin, createSlipTest);
router.patch('/slip-tests/:id', protectAdmin, updateSlipTest);
router.delete('/slip-tests/:id', protectAdmin, deleteSlipTest);

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
