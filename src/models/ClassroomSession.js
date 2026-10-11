import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    role: {
      type: String,
      enum: ['student'],
      default: 'student',
    },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: 40,
    required: true,
  },
  score: {
    type: Number,
    default: 0,
  },
  members: {
    type: [memberSchema],
    default: [],
  },
});

const awardSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    groupName: {
      type: String,
      trim: true,
      default: '',
    },
    marks: {
      type: Number,
      required: true,
    },
    criteria: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const lastResultSchema = new mongoose.Schema(
  {
    emoji: { type: String, default: '' },
    headline: { type: String, default: '' },
    detail: { type: String, default: '' },
    outcome: { type: String, default: '' },
    groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
    groupName: { type: String, default: '' },
    revealCorrect: { type: Boolean, default: false },
    scoreDelta: { type: Number, default: 0 },
    masterGain: { type: Number, default: 0 },
    selectedOptions: { type: [Number], default: [] },
  },
  { _id: false }
);

const classroomSessionSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
    },
    hostRole: {
      type: String,
      enum: ['admin', 'educator'],
      required: true,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    status: {
      type: String,
      enum: ['lobby', 'live', 'finished'],
      default: 'lobby',
    },
    groups: {
      type: [groupSchema],
      default: [],
    },
    masterScore: {
      type: Number,
      default: 0,
    },
    awards: {
      type: [awardSchema],
      default: [],
    },
    questionIndex: {
      type: Number,
      default: 0,
    },
    openingTurnIndex: {
      type: Number,
      default: 0,
    },
    turnIndex: {
      type: Number,
      default: 0,
    },
    stake: {
      type: Number,
      default: 0,
    },
    failCount: {
      type: Number,
      default: 0,
    },
    questionOpen: {
      type: Boolean,
      default: false,
    },
    revealAnswer: {
      type: Boolean,
      default: false,
    },
    turnToken: {
      type: Number,
      default: 0,
    },
    lastResult: {
      type: lastResultSchema,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    resultsSentAt: {
      type: Date,
      default: null,
    },
    resultsSentCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

classroomSessionSchema.index(
  { quiz: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['lobby', 'live'] } },
  }
);
classroomSessionSchema.index({ quiz: 1, updatedAt: -1 });
classroomSessionSchema.index({ code: 1, status: 1, updatedAt: -1 });

export async function latestClassroomStatuses(quizIds = []) {
  if (!quizIds.length) return new Map();
  const sessions = await mongoose
    .model('ClassroomSession')
    .find({ quiz: { $in: quizIds } })
    .select('quiz status updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  const statuses = new Map();
  sessions.forEach((session) => {
    const key = String(session.quiz);
    if (!statuses.has(key)) statuses.set(key, session.status);
  });
  return statuses;
}

export const ClassroomSession = mongoose.model('ClassroomSession', classroomSessionSchema);
