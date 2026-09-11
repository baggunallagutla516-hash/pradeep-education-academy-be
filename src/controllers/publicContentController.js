import { Post } from '../models/Post.js';
import { News } from '../models/News.js';
import { getSiteSettings, toPublicSiteSettings } from '../models/SiteSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const listPublishedPosts = asyncHandler(async (_req, res) => {
  const posts = await Post.find({ isPublished: true })
    .sort({ publishedAt: -1, createdAt: -1 })
    .select('title summary body posterImage publishedAt createdAt');

  res.status(200).json({
    success: true,
    data: {
      posts: posts.map((post) => ({
        id: post._id,
        title: post.title,
        summary: post.summary,
        body: post.body,
        posterImage: post.posterImage,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
      })),
    },
  });
});

export const getPublishedPost = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, isPublished: true }).select(
    'title summary body posterImage publishedAt createdAt'
  );
  if (!post) throw new ApiError(404, 'Post not found');

  res.status(200).json({
    success: true,
    data: {
      post: {
        id: post._id,
        title: post.title,
        summary: post.summary,
        body: post.body,
        posterImage: post.posterImage,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
      },
    },
  });
});

export const listActiveNews = asyncHandler(async (_req, res) => {
  const items = await News.find({ isActive: true })
    .sort({ createdAt: -1 })
    .select('text link createdAt');

  res.status(200).json({
    success: true,
    data: {
      news: items.map((item) => ({
        id: item._id,
        text: item.text,
        link: item.link || '',
        createdAt: item.createdAt,
      })),
    },
  });
});

export const getPublicSiteSettings = asyncHandler(async (_req, res) => {
  const settings = await getSiteSettings();
  res.status(200).json({
    success: true,
    data: { settings: toPublicSiteSettings(settings) },
  });
});
