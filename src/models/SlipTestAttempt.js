import mongoose from 'mongoose';
import { participantSchemaFields } from '../utils/examParticipant.js';

const slipTestResponseSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    selectedOptions: {
      type: [Number],
      default: [],
    },
    correctOptions: {
      type: [Number],
      default: [],
    },
    textAnswer: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Text answer cannot exceed 500 characters'],
    },
    correctAnswers: {
      type: [String],
      default: [],
    },
    matrixAnswers: {
      type: [Number],
      default: [],
    },
    correctMatrix: {
      type: [Number],
      default: [],
    },
    outcome: {
      type: String,
      enum: ['correct', 'partial', 'wrong', 'unanswered'],
      required: true,
    },
    awardedMarks: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const slipTestAttemptSchema = new mongoose.Schema(
  {
    slipTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SlipTest',
      required: true,
    },
    ...participantSchemaFields(),
    studentClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
    },
    status: {
      type: String,
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    autoSubmitted: {
      type: Boolean,
      default: false,
    },
    timeTakenSeconds: {
      type: Number,
      default: 0,
    },
    responses: {
      type: [slipTestResponseSchema],
      default: [],
    },
    /**
     * Per-question display order of option indexes for this student.
     * Master slip-test options stay fixed; grading always uses original indexes.
     */
    optionOrder: {
      type: [
        {
          question: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
          },
          order: {
            type: [Number],
            default: [],
          },
        },
      ],
      default: [],
    },
    totalMarks: { type: Number, default: 0 },
    scoredMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    partialCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    /** When true, scores stay hidden from participants everywhere (admin still sees them). */
    resultsHidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

slipTestAttemptSchema.index(
  { slipTest: 1, student: 1 },
  { unique: true, partialFilterExpression: { student: { $type: 'objectId' } } }
);
slipTestAttemptSchema.index(
  { slipTest: 1, participantRole: 1, participantId: 1 },
  { unique: true, partialFilterExpression: { participantId: { $type: 'objectId' } } }
);
slipTestAttemptSchema.index({ student: 1, status: 1 });
slipTestAttemptSchema.index({ participantRole: 1, participantId: 1, status: 1 });

export const SlipTestAttempt = mongoose.model('SlipTestAttempt', slipTestAttemptSchema);
