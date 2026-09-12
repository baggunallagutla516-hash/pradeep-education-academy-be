import mongoose from 'mongoose';

export const EXAM_PARTICIPANT_ROLES = ['student', 'educator'];

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

const assessmentAttemptSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
    },
    participantRole: {
      type: String,
      enum: EXAM_PARTICIPANT_ROLES,
      default: 'student',
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    /** @deprecated prefer participantId; kept for existing student attempts */
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
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

assessmentAttemptSchema.index({ assessment: 1, student: 1 }, { unique: true, sparse: true });
assessmentAttemptSchema.index(
  { assessment: 1, participantRole: 1, participantId: 1 },
  { unique: true, sparse: true }
);
assessmentAttemptSchema.index({ student: 1, status: 1 });
assessmentAttemptSchema.index({ participantRole: 1, participantId: 1, status: 1 });

export const AssessmentAttempt = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
