import mongoose from 'mongoose';
import { MAX_OPTIONS, MIN_OPTIONS, QUESTION_TYPES } from '../utils/quizGrading.js';

const dppOptionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Option text is required'],
      trim: true,
      maxlength: [500, 'Option text cannot exceed 500 characters'],
    },
  },
  { _id: false }
);

const dppQuestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: [2000, 'Question text cannot exceed 2000 characters'],
  },
  type: {
    type: String,
    enum: {
      values: QUESTION_TYPES,
      message: 'Question type must be single or multiple',
    },
    default: 'single',
  },
  options: {
    type: [dppOptionSchema],
    validate: {
      validator: (value) => value.length >= MIN_OPTIONS && value.length <= MAX_OPTIONS,
      message: `A question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`,
    },
  },
  correctOptions: {
    type: [Number],
    default: [],
  },
  marks: {
    type: Number,
    default: 1,
    min: [0.25, 'Marks must be at least 0.25'],
    max: [100, 'Marks cannot exceed 100'],
  },
  explanation: {
    type: String,
    trim: true,
    maxlength: [1000, 'Explanation cannot exceed 1000 characters'],
    default: '',
  },
});

const dppSchema = new mongoose.Schema(
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
      required: [true, 'Class is required'],
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [80, 'Subject cannot exceed 80 characters'],
      default: '',
    },
    practiceDate: {
      type: Date,
      required: [true, 'Practice date is required'],
    },
    durationMinutes: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1 minute'],
      max: [300, 'Duration cannot exceed 300 minutes'],
    },
    negativeMarkPerWrong: {
      type: Number,
      default: 0,
      min: [0, 'Negative marking cannot be below 0'],
      max: [10, 'Negative marking cannot exceed 10'],
    },
    allowPartialCredit: {
      type: Boolean,
      default: true,
    },
    showAnswersAfterSubmit: {
      type: Boolean,
      default: true,
    },
    questions: {
      type: [dppQuestionSchema],
      default: [],
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
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

dppSchema.index({ studentClass: 1, isPublished: 1, practiceDate: -1 });

export const Dpp = mongoose.model('Dpp', dppSchema);
