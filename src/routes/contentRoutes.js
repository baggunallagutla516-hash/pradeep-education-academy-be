import { Router } from 'express';
import {
  getPublishedPost,
  listActiveNews,
  listPublishedPosts,
  getPublicSiteSettings,
} from '../controllers/publicContentController.js';

const router = Router();

router.get('/posts', listPublishedPosts);
router.get('/posts/:id', getPublishedPost);
router.get('/news', listActiveNews);
router.get('/site', getPublicSiteSettings);

export default router;
