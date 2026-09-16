import { CarouselSlide, isSlidePubliclyVisible } from '../models/CarouselSlide.js';
import { Quiz } from '../models/Quiz.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

function toPublicQuizSlide(doc, quiz) {
  const questionCount = quiz?.questions?.length ?? null;
  return {
    id: doc._id,
    slideType: 'quiz',
    title: doc.title || quiz?.title || '',
    description: doc.description || quiz?.description || '',
    imageUrl: doc.imageUrl || '',
    ctaText: doc.ctaText || 'Attempt Quiz',
    quizId: quiz?._id || doc.quiz,
    questionCount,
    difficulty: doc.difficulty || '',
    category: doc.category || quiz?.subject || '',
    durationMinutes: quiz?.durationMinutes ?? null,
    subject: quiz?.subject || '',
  };
}

function toPublicTopperSlide(doc) {
  return {
    id: doc._id,
    slideType: doc.slideType,
    title: doc.title,
    description: doc.description || '',
    imageUrl: doc.imageUrl || '',
    ctaText: doc.ctaText || '',
    badgeLabel: doc.badgeLabel || 'Quiz Topper',
    quizName: doc.quizName || '',
    quizId: doc.quiz || null,
    studentName: doc.showStudentName ? doc.studentName || '' : '',
    studentClassLabel: doc.showStudentClass ? doc.studentClassLabel || '' : '',
    studentPhotoUrl: doc.showStudentPhoto ? doc.studentPhotoUrl || '' : '',
    scoreDisplay: doc.showScore ? doc.scoreDisplay || '' : '',
    percentage: doc.showPercentage ? doc.percentage : null,
    rank: doc.showRank ? doc.rank : null,
  };
}

function toPublicFeaturedPostSlide(doc) {
  return {
    id: doc._id,
    slideType: 'featured_post',
    title: doc.title,
    description: doc.description || '',
    imageUrl: doc.imageUrl || '',
    ctaText: doc.ctaText || 'Read more',
    linkPath: doc.linkPath || (doc.post ? `/posts/${doc.post}` : ''),
    postId: doc.post || null,
  };
}

function toPublicSlide(doc, quizMap) {
  if (doc.slideType === 'quiz') {
    const quiz = quizMap.get(String(doc.quiz));
    if (!quiz || !quiz.isPublished) return null;
    return toPublicQuizSlide(doc, quiz);
  }
  if (doc.slideType === 'topper' || doc.slideType === 'achievement') {
    return toPublicTopperSlide(doc);
  }
  if (doc.slideType === 'featured_post') {
    return toPublicFeaturedPostSlide(doc);
  }
  return null;
}

export const listPublicCarousel = asyncHandler(async (_req, res) => {
  const now = new Date();
  const slides = await CarouselSlide.find({ isEnabled: true })
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  const visible = slides.filter((slide) => isSlidePubliclyVisible(slide, now));
  const quizIds = [
    ...new Set(
      visible
        .filter((s) => s.slideType === 'quiz' && s.quiz)
        .map((s) => String(s.quiz))
    ),
  ];

  const quizzes = quizIds.length
    ? await Quiz.find({ _id: { $in: quizIds }, isPublished: true }).select(
        'title description subject durationMinutes questions isPublished'
      )
    : [];
  const quizMap = new Map(quizzes.map((q) => [String(q._id), q]));

  const publicSlides = visible
    .map((slide) => toPublicSlide(slide, quizMap))
    .filter(Boolean);

  res.status(200).json({
    success: true,
    data: {
      slides: publicSlides,
      quizzes: publicSlides.filter((s) => s.slideType === 'quiz'),
      toppers: publicSlides.filter(
        (s) => s.slideType === 'topper' || s.slideType === 'achievement'
      ),
      featuredPosts: publicSlides.filter((s) => s.slideType === 'featured_post'),
    },
  });
});

export const getPublicQuizIntro = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).select(
    'title description subject durationMinutes startDate endDate totalMarks questions isPublished'
  );
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  res.status(200).json({
    success: true,
    data: {
      quiz: {
        id: quiz._id,
        title: quiz.title,
        description: quiz.description || '',
        subject: quiz.subject || '',
        durationMinutes: quiz.durationMinutes,
        startDate: quiz.startDate || null,
        endDate: quiz.endDate || null,
        totalMarks: quiz.totalMarks,
        questionCount: quiz.questions.length,
      },
    },
  });
});
