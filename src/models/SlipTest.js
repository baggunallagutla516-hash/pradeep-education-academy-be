import mongoose from 'mongoose';
import {
  MAX_BLANK_ANSWERS,
  MAX_OPTIONS,
  MIN_BLANK_ANSWERS,
  MIN_OPTIONS,
  MIN_MATRIX_ROWS,
  MAX_MATRIX_ROWS,
  QUESTION_TYPES,
} from '../utils/quizGrading.js';

const slipTestOptionSchema = new mongoose.Schema(
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

const slipTestRowSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Row text is required'],
      trim: true,
      maxlength: [500, 'Row text cannot exceed 500 characters'],
    },
  },
  { _id: false }
);

const slipTestQuestionSchema = new mongoose.Schema({
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
      message: 'Question type must be single, multiple, blank, or matrix',
    },
    default: 'single',
  },
  options: {
    type: [slipTestOptionSchema],
    default: [],
    validate: {
      validator(value) {
        if (this.type === 'blank') return Array.isArray(value) && value.length === 0;
        return value.length >= MIN_OPTIONS && value.length <= MAX_OPTIONS;
      },
      message: `A choice question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`,
    },
  },
  rows: {
    type: [slipTestRowSchema],
    default: [],
    validate: {
      validator(value) {
        if (this.type !== 'matrix') return true;
        return value.length >= MIN_MATRIX_ROWS && value.length <= MAX_MATRIX_ROWS;
      },
      message: `A matrix question needs between ${MIN_MATRIX_ROWS} and ${MAX_MATRIX_ROWS} rows`,
    },
  },
  correctOptions: {
    type: [Number],
    default: [],
  },
  correctAnswers: {
    type: [
      {
        type: String,
        trim: true,
        maxlength: [200, 'Accepted answer cannot exceed 200 characters'],
      },
    ],
    default: [],
    validate: {
      validator(value) {
        if (this.type !== 'blank') return true;
        return value.length >= MIN_BLANK_ANSWERS && value.length <= MAX_BLANK_ANSWERS;
      },
      message: `A blank question needs between ${MIN_BLANK_ANSWERS} and ${MAX_BLANK_ANSWERS} accepted answers`,
    },
  },
  correctMatrix: {
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

const slipTestSchema = new mongoose.Schema(
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
    chapter: {
      type: String,
      required: [true, 'Chapter is required'],
      trim: true,
      maxlength: [160, 'Chapter cannot exceed 160 characters'],
    },
    topic: {
      type: String,
      trim: true,
      maxlength: [160, 'Topic cannot exceed 160 characters'],
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
      type: [slipTestQuestionSchema],
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

slipTestSchema.index({ studentClass: 1, isPublished: 1, chapter: 1 });
slipTestSchema.index({ studentClasses: 1, isPublished: 1, chapter: 1 });

export const SlipTest = mongoose.model('SlipTest', slipTestSchema);
