import mongoose from 'mongoose';

const dppResponseSchema = new mongoose.Schema(
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

const dppAttemptSchema = new mongoose.Schema(
  {
    dpp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dpp',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
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
      type: [dppResponseSchema],
      default: [],
    },
    totalMarks: { type: Number, default: 0 },
    scoredMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    partialCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dppAttemptSchema.index({ dpp: 1, student: 1 }, { unique: true });
dppAttemptSchema.index({ student: 1, status: 1 });

export const DppAttempt = mongoose.model('DppAttempt', dppAttemptSchema);
