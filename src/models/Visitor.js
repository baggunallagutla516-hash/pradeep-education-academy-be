import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global',
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

export const Visitor = mongoose.model('Visitor', visitorSchema);
