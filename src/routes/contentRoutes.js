import { Router } from 'express';
import {
  getPublishedPost,
  listActiveNews,
  listPublishedPosts,
} from '../controllers/publicContentController.js';

const router = Router();

router.get('/posts', listPublishedPosts);
router.get('/posts/:id', getPublishedPost);
router.get('/news', listActiveNews);

export default router;
