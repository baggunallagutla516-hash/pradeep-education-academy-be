import { Router } from 'express';
import {
  getPublishedPost,
  listActiveNews,
  listPublishedPosts,
  getPublicSiteSettings,
} from '../controllers/publicContentController.js';
import {
  getPublicQuizIntro,
  listPublicCarousel,
} from '../controllers/publicCarouselController.js';

const router = Router();

router.get('/posts', listPublishedPosts);
router.get('/posts/:id', getPublishedPost);
router.get('/news', listActiveNews);
router.get('/site', getPublicSiteSettings);
router.get('/carousel', listPublicCarousel);
router.get('/quizzes/:id', getPublicQuizIntro);

export default router;
