import mongoose from 'mongoose';

export const DEFAULT_CLASS_NAMES = [
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
  'Other',
];

const schoolClassSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
      maxlength: [80, 'Class name cannot exceed 80 characters'],
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

schoolClassSchema.index({ name: 1 }, { unique: true });
schoolClassSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export function toPublicClass(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    sortOrder: doc.sortOrder,
    isActive: doc.isActive,
  };
}

export const SchoolClass = mongoose.model('SchoolClass', schoolClassSchema);
