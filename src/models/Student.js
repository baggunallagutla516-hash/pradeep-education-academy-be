import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import validator from 'validator';

const CLASS_OPTIONS = [
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
  'Other',
];

const studentSchema = new mongoose.Schema(
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
    studentClass: {
      type: String,
      required: [true, 'Class is required'],
      enum: {
        values: CLASS_OPTIONS,
        message: 'Please select a valid class',
      },
    },
    schoolName: {
      type: String,
      trim: true,
      maxlength: [120, 'School name cannot exceed 120 characters'],
      default: '',
    },
    rollNumber: {
      type: String,
      trim: true,
      maxlength: [40, 'Roll number cannot exceed 40 characters'],
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['student'],
      default: 'student',
    },
    parentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Parent',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

studentSchema.index({ phone: 1 }, { unique: true });
studentSchema.index({ createdAt: -1 });

studentSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

studentSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

studentSchema.statics.CLASS_OPTIONS = CLASS_OPTIONS;

export const Student = mongoose.model('Student', studentSchema);
