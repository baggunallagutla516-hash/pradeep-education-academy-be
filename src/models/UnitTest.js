import mongoose from 'mongoose';
import { contentAccessPaths } from '../utils/contentAccess.js';

const unitTestSchema = new mongoose.Schema(
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
    unitNumber: {
      type: Number,
      required: [true, 'Unit number is required'],
      min: [1, 'Unit number must be at least 1'],
      max: [200, 'Unit number cannot exceed 200'],
    },
    unitName: {
      type: String,
      trim: true,
      maxlength: [160, 'Unit name cannot exceed 160 characters'],
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
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
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
    ...contentAccessPaths(),
  },
  { timestamps: true }
);

unitTestSchema.index({ studentClass: 1, isPublished: 1, unitNumber: 1 });
unitTestSchema.index({ studentClasses: 1, isPublished: 1, unitNumber: 1 });
unitTestSchema.index(
  { joinCode: 1 },
  { unique: true, partialFilterExpression: { joinCode: { $type: 'string' } } }
);

export const UnitTest = mongoose.model('UnitTest', unitTestSchema);
