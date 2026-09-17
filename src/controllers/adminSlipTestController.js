import fs from 'fs';
import { SlipTest } from '../models/SlipTest.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { contentClassJsonFields, resolveContentClasses } from '../utils/schoolClass.js';
import { normaliseQuestions, totalMarksFor, validateQuestions } from '../utils/quizGrading.js';
import { sendAssessmentResultsReleasedEmail } from '../utils/mailer.js';
import { assertEndDateNotBefore, readEndDate, readStartDate } from '../utils/examWindow.js';
import { countPendingReleaseAttempts, pendingReleaseAttempts } from '../utils/resultsRelease.js';
import {
  loadParticipantsByRole,
  participantKey,
  participantResultFields,
  resultUrlForRole,
} from '../utils/examParticipant.js';
import { clearAttemptById, deleteAttemptById, setAttemptResultsHidden } from '../utils/reattempt.js';
import {
  buildObjectKey,
  deleteObject,
  keyFromPublicUrl,
  uploadDiskFile,
} from '../utils/storage.js';

function toQuestionJson(question) {
  return {
    id: question._id,
    text: question.text,
    imageUrl: question.imageUrl || '',
    imageKey: question.imageKey || '',
    type: question.type,
    options: question.options.map((option) => ({
      text: option.text,
      imageUrl: option.imageUrl || '',
      imageKey: option.imageKey || '',
    })),
    rows: (question.rows || []).map((row) => ({ text: row.text })),
    correctOptions: question.correctOptions,
    correctAnswers: question.correctAnswers || [],
    correctMatrix: question.correctMatrix || [],
    marks: question.marks,
    explanation: question.explanation,
  };
}

function toSlipTestJson(doc, extra = {}) {
  const contentMode = doc.contentMode === 'file' ? 'file' : 'exam';
  return {
    id: doc._id,
    contentMode,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subject: doc.subject,
    chapter: doc.chapter,
    topic: doc.topic,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    showAnswersAfterSubmit: doc.showAnswersAfterSubmit,
    resultsReleased: Boolean(doc.resultsReleased),
    resultsReleasedAt: doc.resultsReleasedAt || null,
    questionCount: doc.questions?.length || 0,
    totalMarks: doc.totalMarks,
    coverImageUrl: doc.coverImageUrl || '',
    fileUrl: doc.fileUrl || '',
    fileName: doc.fileName || '',
    fileMimeType: doc.fileMimeType || '',
    fileSize: doc.fileSize || 0,
    isPublished: doc.isPublished,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    ...extra,
  };
}

function toSlipTestDetailJson(doc) {
  return toSlipTestJson(doc, {
    questions: (doc.questions || []).map(toQuestionJson),
  });
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true';
}

function readContentMode(value, fallback = 'exam') {
  if (value === undefined || value === null || value === '') return fallback;
  const mode = String(value).trim().toLowerCase();
  if (mode !== 'exam' && mode !== 'file') {
    throw new ApiError(400, 'Content mode must be exam or file');
  }
  return mode;
}

function assertValidQuestions(questions) {
  const errors = validateQuestions(questions);
  if (errors.length > 0) {
    throw new ApiError(400, 'Please fix the questions before saving', errors);
  }
}

function readDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
    throw new ApiError(400, 'Duration must be between 1 and 300 minutes');
  }
  return duration;
}

async function unlinkTemp(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function uploadCover(file) {
  if (!file?.path) throw new ApiError(400, 'Cover image is required');
  const key = buildObjectKey('slip-tests/covers', file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return { url, key };
}

async function uploadFile(file) {
  if (!file?.path) throw new ApiError(400, 'Slip test file is required');
  const key = buildObjectKey('slip-tests/files', file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return {
    url,
    key,
    fileName: file.originalname,
    fileMimeType: file.mimetype,
    fileSize: file.size,
  };
}

async function deleteStoredAssets(doc) {
  await deleteObject(doc.coverImageKey || keyFromPublicUrl(doc.coverImageUrl));
  await deleteObject(doc.fileKey || keyFromPublicUrl(doc.fileUrl));
}

export const listSlipTests = asyncHandler(async (req, res) => {
  const slipTests = await SlipTest.find()
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ createdAt: -1 });

  const counts = await SlipTestAttempt.aggregate([
    { $group: { _id: '$slipTest', count: { $sum: 1 } } },
  ]);
  const countByTest = new Map(counts.map((row) => [String(row._id), row.count]));

  res.status(200).json({
    success: true,
    data: {
      slipTests: slipTests.map((doc) =>
        toSlipTestJson(doc, { attemptCount: countByTest.get(String(doc._id)) || 0 })
      ),
    },
  });
});

export const getSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  res.status(200).json({
    success: true,
    data: { slipTest: toSlipTestDetailJson(slipTest) },
  });
});

export const createSlipTest = asyncHandler(async (req, res) => {
  const contentMode = readContentMode(req.body.contentMode, 'exam');
  const { title, description, subject, chapter, topic, startDate, endDate, questions } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (!title?.trim()) throw new ApiError(400, 'Title is required');
    if (!chapter?.trim()) throw new ApiError(400, 'Chapter is required');
    const { studentClasses, studentClass } = await resolveContentClasses(req.body);
    const starts = readStartDate(startDate, { label: 'starting date and time' });
    const ends = readEndDate(endDate);
    assertEndDateNotBefore(ends, starts, 'starting date and time');

    const base = {
      contentMode,
      title: title.trim(),
      description: (description || '').trim(),
      studentClass,
      studentClasses,
      subject: (subject || '').trim(),
      chapter: chapter.trim(),
      topic: (topic || '').trim(),
      startDate: starts,
      endDate: ends,
      isPublished: parseBoolean(req.body.isPublished, false),
      createdBy: req.admin._id,
    };

    let slipTest;

    if (contentMode === 'file') {
      if (!cover) throw new ApiError(400, 'Cover image is required');
      if (!file) throw new ApiError(400, 'Slip test file is required');

      const coverUpload = await uploadCover(cover);
      let fileUpload;
      try {
        fileUpload = await uploadFile(file);
      } catch (err) {
        await deleteObject(coverUpload.key);
        throw err;
      }

      slipTest = await SlipTest.create({
        ...base,
        durationMinutes: null,
        negativeMarkPerWrong: 0,
        allowPartialCredit: true,
        showAnswersAfterSubmit: false,
        questions: [],
        totalMarks: 0,
        coverImageUrl: coverUpload.url,
        coverImageKey: coverUpload.key,
        fileUrl: fileUpload.url,
        fileKey: fileUpload.key,
        fileName: fileUpload.fileName,
        fileMimeType: fileUpload.fileMimeType,
        fileSize: fileUpload.fileSize,
        publishedAt: base.isPublished ? new Date() : null,
      });
    } else {
      assertValidQuestions(questions);
      const normalised = normaliseQuestions(questions);
      slipTest = await SlipTest.create({
        ...base,
        durationMinutes: readDuration(req.body.durationMinutes),
        negativeMarkPerWrong: Number(req.body.negativeMarkPerWrong) || 0,
        allowPartialCredit: parseBoolean(req.body.allowPartialCredit, true),
        showAnswersAfterSubmit: parseBoolean(req.body.showAnswersAfterSubmit, true),
        questions: normalised,
        totalMarks: totalMarksFor(normalised),
      });
    }

    await slipTest.populate([
      { path: 'studentClass', select: 'name' },
      { path: 'studentClasses', select: 'name' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Slip test created',
      data: { slipTest: toSlipTestDetailJson(slipTest) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const updateSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  const wasPublished = Boolean(slipTest.isPublished);
  const contentMode = slipTest.contentMode === 'file' ? 'file' : 'exam';
  const { title, description, subject, chapter, topic, startDate, endDate, questions } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  if (req.body.contentMode !== undefined && readContentMode(req.body.contentMode, contentMode) !== contentMode) {
    throw new ApiError(400, 'Cannot change content mode after a slip test is created');
  }

  try {
    if (title !== undefined) {
      if (!String(title).trim()) throw new ApiError(400, 'Title is required');
      slipTest.title = String(title).trim();
    }
    if (description !== undefined) slipTest.description = String(description).trim();
    if (subject !== undefined) slipTest.subject = String(subject).trim();
    if (chapter !== undefined) {
      if (!String(chapter).trim()) throw new ApiError(400, 'Chapter is required');
      slipTest.chapter = String(chapter).trim();
    }
    if (topic !== undefined) slipTest.topic = String(topic).trim();
    if (req.body.studentClasses !== undefined || req.body.studentClass !== undefined) {
      const { studentClasses, studentClass } = await resolveContentClasses(req.body);
      slipTest.studentClasses = studentClasses;
      slipTest.studentClass = studentClass;
    }
    if (startDate !== undefined) {
      slipTest.startDate = readStartDate(startDate, { label: 'starting date and time' });
    }
    if (endDate !== undefined) slipTest.endDate = readEndDate(endDate);
    assertEndDateNotBefore(slipTest.endDate, slipTest.startDate, 'starting date and time');
    if (req.body.isPublished !== undefined) {
      slipTest.isPublished = parseBoolean(req.body.isPublished, slipTest.isPublished);
    }

    if (contentMode === 'file') {
      if (cover) {
        const prevKey = slipTest.coverImageKey || keyFromPublicUrl(slipTest.coverImageUrl);
        const coverUpload = await uploadCover(cover);
        slipTest.coverImageUrl = coverUpload.url;
        slipTest.coverImageKey = coverUpload.key;
        await deleteObject(prevKey);
      }
      if (file) {
        const prevKey = slipTest.fileKey || keyFromPublicUrl(slipTest.fileUrl);
        const fileUpload = await uploadFile(file);
        slipTest.fileUrl = fileUpload.url;
        slipTest.fileKey = fileUpload.key;
        slipTest.fileName = fileUpload.fileName;
        slipTest.fileMimeType = fileUpload.fileMimeType;
        slipTest.fileSize = fileUpload.fileSize;
        await deleteObject(prevKey);
      }
      if (!slipTest.coverImageUrl || !slipTest.fileUrl) {
        throw new ApiError(400, 'Cover image and file are required for file slip tests');
      }
    } else {
      if (req.body.durationMinutes !== undefined) {
        slipTest.durationMinutes = readDuration(req.body.durationMinutes);
      }
      if (req.body.negativeMarkPerWrong !== undefined) {
        slipTest.negativeMarkPerWrong = Number(req.body.negativeMarkPerWrong) || 0;
      }
      if (req.body.allowPartialCredit !== undefined) {
        slipTest.allowPartialCredit = parseBoolean(req.body.allowPartialCredit, true);
      }
      if (req.body.showAnswersAfterSubmit !== undefined) {
        slipTest.showAnswersAfterSubmit = parseBoolean(req.body.showAnswersAfterSubmit, true);
      }
      if (questions !== undefined) {
        assertValidQuestions(questions);
        const normalised = normaliseQuestions(questions);
        slipTest.questions = normalised;
        slipTest.totalMarks = totalMarksFor(normalised);
      }
    }

    const willBePublished = Boolean(slipTest.isPublished);
    const unpublishing = wasPublished && !willBePublished;
    const editingPublished = wasPublished;
    const needsWipe = contentMode === 'exam' && (unpublishing || editingPublished);

    if (needsWipe) {
      if (!parseBoolean(req.body.confirmWipeAttempts, false)) {
        throw new ApiError(
          400,
          'Saving or unpublishing a published slip test deletes all attempt data. Confirm to continue.'
        );
      }
      await SlipTestAttempt.deleteMany({ slipTest: slipTest._id });
      slipTest.resultsReleased = false;
      slipTest.resultsReleasedAt = null;
    }

    if (willBePublished && !slipTest.publishedAt) {
      slipTest.publishedAt = new Date();
    }
    if (!willBePublished) {
      slipTest.publishedAt = null;
    }

    await slipTest.save();
    await slipTest.populate([
      { path: 'studentClass', select: 'name' },
      { path: 'studentClasses', select: 'name' },
    ]);

    res.status(200).json({
      success: true,
      message:
        contentMode === 'exam' && unpublishing
          ? 'Slip test unpublished. All attempt data was deleted.'
          : contentMode === 'exam' && editingPublished
            ? 'Slip test updated. Previous attempt data was deleted so corrected answers apply for everyone.'
            : 'Slip test updated',
      data: { slipTest: toSlipTestDetailJson(slipTest) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const deleteSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  await SlipTestAttempt.deleteMany({ slipTest: slipTest._id });
  await deleteStoredAssets(slipTest);
  await slipTest.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Slip test deleted',
    data: null,
  });
});

export const listSlipTestResults = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  if (slipTest.contentMode === 'file') {
    throw new ApiError(400, 'File slip tests do not have online results');
  }

  const attempts = await SlipTestAttempt.find({ slipTest: slipTest._id, status: 'submitted' }).sort({
    percentage: -1,
    submittedAt: 1,
  });
  const participants = await loadParticipantsByRole(attempts);

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;
  const pendingReleaseCount = countPendingReleaseAttempts(slipTest, attempts);

  res.status(200).json({
    success: true,
    data: {
      slipTest: toSlipTestJson(slipTest),
      summary: {
        submitted,
        averagePercentage,
        highestPercentage: submitted ? attempts[0].percentage : 0,
        pendingReleaseCount,
      },
      results: attempts.map((attempt) => ({
        id: attempt._id,
        ...participantResultFields(attempt, participants.get(participantKey(attempt))),
        scoredMarks: attempt.scoredMarks,
        totalMarks: attempt.totalMarks,
        percentage: attempt.percentage,
        correctCount: attempt.correctCount,
        partialCount: attempt.partialCount,
        wrongCount: attempt.wrongCount,
        unansweredCount: attempt.unansweredCount,
        timeTakenSeconds: attempt.timeTakenSeconds,
        autoSubmitted: attempt.autoSubmitted,
        submittedAt: attempt.submittedAt,
        resultsHidden: Boolean(attempt.resultsHidden),
      })),
    },
  });
});

export const reattemptSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  if (slipTest.contentMode === 'file') {
    throw new ApiError(400, 'File slip tests do not support reattempts');
  }

  await clearAttemptById({
    model: SlipTestAttempt,
    examField: 'slipTest',
    examId: slipTest._id,
    attemptId: req.params.attemptId,
    label: 'slip test',
    startDate: slipTest.startDate,
    endDate: slipTest.endDate,
  });

  res.status(200).json({
    success: true,
    message: 'Participant can write this slip test again.',
  });
});

export const setSlipTestAttemptVisibility = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  if (slipTest.contentMode === 'file') {
    throw new ApiError(400, 'File slip tests do not have attempt results');
  }

  const resultsHidden = Boolean(req.body?.resultsHidden);
  const result = await setAttemptResultsHidden({
    model: SlipTestAttempt,
    examField: 'slipTest',
    examId: slipTest._id,
    attemptId: req.params.attemptId,
    resultsHidden,
  });

  res.status(200).json({
    success: true,
    message: resultsHidden
      ? 'Result hidden from participants everywhere.'
      : 'Result is visible again where announced.',
    data: result,
  });
});

export const deleteSlipTestAttempt = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  if (slipTest.contentMode === 'file') {
    throw new ApiError(400, 'File slip tests do not have attempt results');
  }

  await deleteAttemptById({
    model: SlipTestAttempt,
    examField: 'slipTest',
    examId: slipTest._id,
    attemptId: req.params.attemptId,
  });

  res.status(200).json({
    success: true,
    message: 'Result deleted everywhere.',
  });
});

export const releaseSlipTestResults = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  if (slipTest.contentMode === 'file') {
    throw new ApiError(400, 'File slip tests do not have online results');
  }

  const attempts = await SlipTestAttempt.find({
    slipTest: slipTest._id,
    status: 'submitted',
  });

  const toNotify = pendingReleaseAttempts(slipTest, attempts);
  if (toNotify.length === 0) {
    throw new ApiError(
      400,
      attempts.length === 0
        ? 'No submitted attempts to announce yet.'
        : 'All submitted results are already announced. The button unlocks when a new attempt is submitted.'
    );
  }

  const wasReleased = Boolean(slipTest.resultsReleased);
  slipTest.resultsReleased = true;
  slipTest.resultsReleasedAt = new Date();
  await slipTest.save();

  const participants = await loadParticipantsByRole(toNotify);
  const clientOrigin = env.clientOrigins[0] || '';

  let emailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const attempt of toNotify) {
    const person = participants.get(participantKey(attempt));
    if (!person?.email || person.deletedAt || person.isActive === false) {
      skipped += 1;
      continue;
    }

    try {
      const outcome = await sendAssessmentResultsReleasedEmail({
        to: person.email,
        studentName: person.fullName,
        title: slipTest.title,
        resultUrl: resultUrlForRole(
          clientOrigin,
          'slip-tests',
          slipTest._id,
          attempt.participantRole
        ),
      });
      if (outcome.sent) emailed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error(`[mailer] Failed to email ${person.email}:`, err?.message || err);
    }
  }

  res.status(200).json({
    success: true,
    message: wasReleased
      ? 'New results announced for late submissions. Participants can now view those scores.'
      : 'Results released. Participants can now view scores on the site.',
    data: {
      slipTest: toSlipTestJson(slipTest),
      notify: {
        recipients: toNotify.length,
        emailed,
        skipped,
        failed,
      },
      summary: {
        pendingReleaseCount: 0,
      },
    },
  });
});
