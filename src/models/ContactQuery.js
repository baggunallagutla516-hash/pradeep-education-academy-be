import mongoose from 'mongoose';
import validator from 'validator';

const contactQuerySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: 'Please provide a valid email',
      },
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (value) => !value || /^[6-9]\d{9}$/.test(value),
        message: 'Phone must be a valid 10-digit Indian mobile number',
      },
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [120, 'Subject cannot exceed 120 characters'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: ['new', 'read', 'replied'],
      default: 'new',
    },
  },
  { timestamps: true }
);

contactQuerySchema.index({ createdAt: -1 });
contactQuerySchema.index({ status: 1, createdAt: -1 });

export const ContactQuery = mongoose.model('ContactQuery', contactQuerySchema);
