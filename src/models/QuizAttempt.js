import mongoose from 'mongoose';

export const QUIZ_PARTICIPANT_ROLES = ['student', 'educator', 'parent'];

const quizResponseSchema = new mongoose.Schema(
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

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
    },
    participantRole: {
      type: String,
      enum: QUIZ_PARTICIPANT_ROLES,
      required: true,
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    /** @deprecated kept for older student attempts; prefer participantId */
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
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
      type: [quizResponseSchema],
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

quizAttemptSchema.index(
  { quiz: 1, participantRole: 1, participantId: 1 },
  { unique: true }
);
quizAttemptSchema.index({ participantRole: 1, participantId: 1, status: 1 });

export const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);
