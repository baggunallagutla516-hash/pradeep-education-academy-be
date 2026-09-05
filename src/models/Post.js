import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [160, 'Title cannot exceed 160 characters'],
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [400, 'Summary cannot exceed 400 characters'],
      default: '',
    },
    body: {
      type: String,
      required: [true, 'Post body is required'],
      trim: true,
      maxlength: [20000, 'Post body cannot exceed 20000 characters'],
    },
    posterImage: {
      type: String,
      required: [true, 'Poster image is required'],
      trim: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  { timestamps: true }
);

postSchema.index({ isPublished: 1, publishedAt: -1 });

export const Post = mongoose.model('Post', postSchema);
