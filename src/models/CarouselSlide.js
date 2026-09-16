import mongoose from 'mongoose';

export const CAROUSEL_SLIDE_TYPES = ['quiz', 'topper', 'achievement', 'featured_post'];

const carouselSlideSchema = new mongoose.Schema(
  {
    slideType: {
      type: String,
      enum: {
        values: CAROUSEL_SLIDE_TYPES,
        message: 'Slide type must be quiz, topper, achievement, or featured_post',
      },
      required: [true, 'Slide type is required'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [160, 'Title cannot exceed 160 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [600, 'Description cannot exceed 600 characters'],
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: [1000, 'Image URL cannot exceed 1000 characters'],
      default: '',
    },
    imageKey: {
      type: String,
      trim: true,
      maxlength: [500, 'Image key cannot exceed 500 characters'],
      default: '',
    },
    ctaText: {
      type: String,
      trim: true,
      maxlength: [60, 'CTA text cannot exceed 60 characters'],
      default: '',
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: [0, 'Display order cannot be negative'],
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    publishAt: {
      type: Date,
      default: null,
    },
    unpublishAt: {
      type: Date,
      default: null,
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      default: null,
    },
    difficulty: {
      type: String,
      trim: true,
      maxlength: [80, 'Difficulty cannot exceed 80 characters'],
      default: '',
    },
    category: {
      type: String,
      trim: true,
      maxlength: [80, 'Category cannot exceed 80 characters'],
      default: '',
    },
    studentName: {
      type: String,
      trim: true,
      maxlength: [120, 'Student name cannot exceed 120 characters'],
      default: '',
    },
    studentClassLabel: {
      type: String,
      trim: true,
      maxlength: [60, 'Class label cannot exceed 60 characters'],
      default: '',
    },
    studentPhotoUrl: {
      type: String,
      trim: true,
      maxlength: [1000, 'Photo URL cannot exceed 1000 characters'],
      default: '',
    },
    studentPhotoKey: {
      type: String,
      trim: true,
      maxlength: [500, 'Photo key cannot exceed 500 characters'],
      default: '',
    },
    quizName: {
      type: String,
      trim: true,
      maxlength: [160, 'Quiz name cannot exceed 160 characters'],
      default: '',
    },
    scoreDisplay: {
      type: String,
      trim: true,
      maxlength: [40, 'Score display cannot exceed 40 characters'],
      default: '',
    },
    percentage: {
      type: Number,
      default: null,
      min: [0, 'Percentage cannot be below 0'],
      max: [100, 'Percentage cannot exceed 100'],
    },
    rank: {
      type: Number,
      default: null,
      min: [1, 'Rank must be at least 1'],
    },
    badgeLabel: {
      type: String,
      trim: true,
      maxlength: [60, 'Badge label cannot exceed 60 characters'],
      default: 'Quiz Topper',
    },
    showStudentName: {
      type: Boolean,
      default: true,
    },
    showStudentClass: {
      type: Boolean,
      default: true,
    },
    showStudentPhoto: {
      type: Boolean,
      default: true,
    },
    showScore: {
      type: Boolean,
      default: true,
    },
    showPercentage: {
      type: Boolean,
      default: true,
    },
    showRank: {
      type: Boolean,
      default: false,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    linkPath: {
      type: String,
      trim: true,
      maxlength: [200, 'Link path cannot exceed 200 characters'],
      default: '',
      validate: {
        validator(value) {
          if (!value) return true;
          return value.startsWith('/') && !value.startsWith('//');
        },
        message: 'Link must be an internal path starting with /',
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  { timestamps: true }
);

carouselSlideSchema.index({ isEnabled: 1, slideType: 1, displayOrder: 1, createdAt: -1 });
carouselSlideSchema.index({ publishAt: 1, unpublishAt: 1 });

export function isSlidePubliclyVisible(slide, now = new Date()) {
  if (!slide?.isEnabled) return false;
  if (slide.publishAt && slide.publishAt > now) return false;
  if (slide.unpublishAt && slide.unpublishAt <= now) return false;
  return true;
}

export const CarouselSlide = mongoose.model('CarouselSlide', carouselSlideSchema);
