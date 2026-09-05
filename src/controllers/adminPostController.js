import { Post } from '../models/Post.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function toPostJson(post) {
  return {
    id: post._id,
    title: post.title,
    summary: post.summary,
    body: post.body,
    posterImage: post.posterImage,
    isPublished: post.isPublished,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export const listPosts = asyncHandler(async (_req, res) => {
  const posts = await Post.find().sort({ publishedAt: -1, createdAt: -1 });
  res.status(200).json({
    success: true,
    data: { posts: posts.map(toPostJson) },
  });
});

export const getPost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new ApiError(404, 'Post not found');
  res.status(200).json({
    success: true,
    data: { post: toPostJson(post) },
  });
});

export const createPost = asyncHandler(async (req, res) => {
  const { title, summary, body, isPublished } = req.body;

  if (!title?.trim() || !body?.trim()) {
    throw new ApiError(400, 'Title and body are required');
  }
  if (!req.file) {
    throw new ApiError(400, 'Poster image is required');
  }

  const published = isPublished === undefined || isPublished === 'true' || isPublished === true;

  const post = await Post.create({
    title: title.trim(),
    summary: summary?.trim() || '',
    body: body.trim(),
    posterImage: `/uploads/${req.file.filename}`,
    isPublished: published,
    publishedAt: published ? new Date() : null,
    createdBy: req.admin._id,
  });

  res.status(201).json({
    success: true,
    message: 'Post created',
    data: { post: toPostJson(post) },
  });
});

export const updatePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new ApiError(404, 'Post not found');

  const { title, summary, body, isPublished } = req.body;

  if (title !== undefined) {
    if (!String(title).trim()) throw new ApiError(400, 'Title cannot be empty');
    post.title = String(title).trim();
  }
  if (summary !== undefined) post.summary = String(summary).trim();
  if (body !== undefined) {
    if (!String(body).trim()) throw new ApiError(400, 'Body cannot be empty');
    post.body = String(body).trim();
  }
  if (req.file) {
    post.posterImage = `/uploads/${req.file.filename}`;
  }

  if (isPublished !== undefined) {
    const published = isPublished === 'true' || isPublished === true;
    if (published && !post.isPublished) {
      post.publishedAt = new Date();
    }
    if (!published) {
      post.publishedAt = null;
    }
    post.isPublished = published;
  }

  await post.save();

  res.status(200).json({
    success: true,
    message: 'Post updated',
    data: { post: toPostJson(post) },
  });
});

export const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findByIdAndDelete(req.params.id);
  if (!post) throw new ApiError(404, 'Post not found');
  res.status(200).json({
    success: true,
    message: 'Post deleted',
  });
});
