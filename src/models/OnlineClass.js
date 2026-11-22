import mongoose from 'mongoose';

export const ONLINE_CLASS_AUDIENCES = ['student', 'educator', 'parent'];

const onlineClassSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    meetingLink: {
      type: String,
      required: [true, 'Meeting link is required'],
      trim: true,
      maxlength: [1000, 'Meeting link cannot exceed 1000 characters'],
      validate: {
        validator(value) {
          try {
            const url = new URL(value);
            return url.protocol === 'https:' || url.protocol === 'http:';
          } catch {
            return false;
          }
        },
        message: 'Meeting link must be a valid http(s) URL',
      },
    },
    platform: {
      type: String,
      enum: {
        values: ['google_meet', 'zoom', 'other'],
        message: 'Platform must be google_meet, zoom, or other',
      },
      default: 'other',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    visibleTo: {
      type: [
        {
          type: String,
          enum: ONLINE_CLASS_AUDIENCES,
        },
      ],
      default: () => [...ONLINE_CLASS_AUDIENCES],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Select at least one audience',
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

onlineClassSchema.index({ isActive: 1, scheduledAt: 1, createdAt: -1 });
onlineClassSchema.index({ visibleTo: 1, isActive: 1 });

export const OnlineClass = mongoose.model('OnlineClass', onlineClassSchema);
