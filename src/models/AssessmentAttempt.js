import mongoose from 'mongoose';

const assessmentResponseSchema = new mongoose.Schema(
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

const assessmentAttemptSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
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
    submitReason: {
      type: String,
      enum: ['manual', 'timer', 'fullscreen_exits', 'expired'],
      default: null,
    },
    timeTakenSeconds: {
      type: Number,
      default: 0,
    },
    fullscreenExitCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    responses: {
      type: [assessmentResponseSchema],
      default: [],
    },
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
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ assessment: 1, student: 1 }, { unique: true });
assessmentAttemptSchema.index({ student: 1, status: 1 });

export const AssessmentAttempt = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
