import mongoose from 'mongoose';
import { MAX_OPTIONS, MIN_OPTIONS } from '../utils/quizGrading.js';

export const QUIZ_QUESTION_TYPES = ['single', 'multiple'];

const quizOptionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      trim: true,
      maxlength: [500, 'Option text cannot exceed 500 characters'],
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: [1000, 'Option image URL cannot exceed 1000 characters'],
      default: '',
    },
    imageKey: {
      type: String,
      trim: true,
      maxlength: [500, 'Option image key cannot exceed 500 characters'],
      default: '',
    },
  },
  { _id: false }
);

const quizQuestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: [2000, 'Question text cannot exceed 2000 characters'],
  },
  imageUrl: {
    type: String,
    trim: true,
    maxlength: [1000, 'Question image URL cannot exceed 1000 characters'],
    default: '',
  },
  imageKey: {
    type: String,
    trim: true,
    maxlength: [500, 'Question image key cannot exceed 500 characters'],
    default: '',
  },
  type: {
    type: String,
    enum: {
      values: QUIZ_QUESTION_TYPES,
      message: 'Question type must be single or multiple',
    },
    default: 'single',
  },
  options: {
    type: [quizOptionSchema],
    default: [],
    validate: {
      validator(value) {
        return value.length >= MIN_OPTIONS && value.length <= MAX_OPTIONS;
      },
      message: `A choice question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`,
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

const quizSchema = new mongoose.Schema(
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
    subject: {
      type: String,
      trim: true,
      maxlength: [80, 'Subject cannot exceed 80 characters'],
      default: '',
    },
    endDate: {
      type: Date,
      default: null,
    },
    startDate: {
      type: Date,
      default: null,
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
    resultsReleased: {
      type: Boolean,
      default: false,
    },
    resultsReleasedAt: {
      type: Date,
      default: null,
    },
    questions: {
      type: [quizQuestionSchema],
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

quizSchema.index({ isPublished: 1, createdAt: -1 });
quizSchema.index({ studentClasses: 1, isPublished: 1, createdAt: -1 });
quizSchema.index({ studentClass: 1, isPublished: 1, createdAt: -1 });

export const Quiz = mongoose.model('Quiz', quizSchema);
