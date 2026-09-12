import mongoose from 'mongoose';

const chapterEndTestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [160, 'Title cannot exceed 160 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    studentClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      default: null,
    },
    studentClasses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SchoolClass',
      },
    ],
    chapterNumber: {
      type: Number,
      required: [true, 'Chapter number is required'],
      min: [1, 'Chapter number must be at least 1'],
      max: [200, 'Chapter number cannot exceed 200'],
    },
    chapterName: {
      type: String,
      trim: true,
      maxlength: [160, 'Chapter name cannot exceed 160 characters'],
      default: '',
    },
    coverImageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    coverImageKey: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      required: [true, 'File is required'],
      trim: true,
    },
    fileKey: {
      type: String,
      trim: true,
      default: '',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileMimeType: {
      type: String,
      trim: true,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
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

chapterEndTestSchema.index({ studentClass: 1, isPublished: 1, chapterNumber: 1 });
chapterEndTestSchema.index({ studentClasses: 1, isPublished: 1, chapterNumber: 1 });

export const ChapterEndTest = mongoose.model('ChapterEndTest', chapterEndTestSchema);
