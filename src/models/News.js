import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'News text is required'],
      trim: true,
      maxlength: [280, 'News text cannot exceed 280 characters'],
    },
    link: {
      type: String,
      trim: true,
      default: '',
      maxlength: [200, 'Link cannot exceed 200 characters'],
      validate: {
        validator(value) {
          if (!value) return true;
          return value.startsWith('/') && !value.startsWith('//');
        },
        message: 'Link must be an internal path starting with /',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  { timestamps: true }
);

newsSchema.index({ isActive: 1, createdAt: -1 });

export const News = mongoose.model('News', newsSchema);
