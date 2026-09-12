import mongoose from 'mongoose';
import { MAX_OPTIONS, MIN_OPTIONS, MIN_MATRIX_ROWS, MAX_MATRIX_ROWS } from '../utils/quizGrading.js';

export const ASSESSMENT_QUESTION_TYPES = ['single', 'multiple', 'matrix'];
export const MAX_FULLSCREEN_EXITS = 3;

const assessmentOptionSchema = new mongoose.Schema(
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

const assessmentRowSchema = new mongoose.Schema(
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

const assessmentQuestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    maxlength: [2000, 'Question text cannot exceed 2000 characters'],
  },
  type: {
    type: String,
    enum: {
      values: ASSESSMENT_QUESTION_TYPES,
      message: 'Question type must be single, multiple, or matrix',
    },
    default: 'single',
  },
  options: {
    type: [assessmentOptionSchema],
    default: [],
    validate: {
      validator(value) {
        return value.length >= MIN_OPTIONS && value.length <= MAX_OPTIONS;
      },
      message: `A choice question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`,
    },
  },
  rows: {
    type: [assessmentRowSchema],
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
  correctMatrix: {
    type: [Number],
    default: [],
  },
  section: {
    type: String,
    trim: true,
    maxlength: [80, 'Section name cannot exceed 80 characters'],
    default: 'Section A',
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

const assessmentSectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Section name is required'],
      trim: true,
      maxlength: [80, 'Section name cannot exceed 80 characters'],
    },
  },
  { _id: false }
);

const assessmentSchema = new mongoose.Schema(
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
    assessmentDate: {
      type: Date,
      required: [true, 'Assessment date is required'],
    },
    endDate: {
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
    maxFullscreenExits: {
      type: Number,
      default: MAX_FULLSCREEN_EXITS,
      min: [1, 'Must allow at least 1 fullscreen exit'],
      max: [10, 'Fullscreen exits cannot exceed 10'],
    },
    sections: {
      type: [assessmentSectionSchema],
      default: [{ name: 'Section A' }],
    },
    questions: {
      type: [assessmentQuestionSchema],
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

assessmentSchema.index({ studentClass: 1, isPublished: 1, assessmentDate: -1 });
assessmentSchema.index({ studentClasses: 1, isPublished: 1, assessmentDate: -1 });

export const Assessment = mongoose.model('Assessment', assessmentSchema);
