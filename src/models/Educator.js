import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import validator from 'validator';
import {
  passwordResetSchemaFields,
  stripPasswordResetFromJson,
} from '../utils/passwordReset.js';

const educatorSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [80, 'Full name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) => validator.isEmail(value),
        message: 'Please provide a valid email',
      },
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      validate: {
        validator: (value) => /^[6-9]\d{9}$/.test(value),
        message: 'Phone must be a valid 10-digit Indian mobile number',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['educator'],
      default: 'educator',
    },
    schoolName: {
      type: String,
      trim: true,
      maxlength: [120, 'School name cannot exceed 120 characters'],
      default: '',
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    ...passwordResetSchemaFields,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        stripPasswordResetFromJson(ret);
        delete ret.__v;
        return ret;
      },
    },
  }
);

educatorSchema.index({ phone: 1 }, { unique: true });
educatorSchema.index({ createdAt: -1 });
educatorSchema.index({ deletedAt: 1 });

educatorSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

educatorSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const Educator = mongoose.model('Educator', educatorSchema);
