import crypto from 'crypto';
import { ApiError } from './ApiError.js';
import { asyncHandler } from './asyncHandler.js';
import { sendPasswordResetOtpEmail } from './mailer.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const RESET_SELECT =
  '+passwordResetOtpHash +passwordResetOtpExpires +passwordResetOtpAttempts +passwordResetTokenHash +passwordResetTokenExpires';
const GENERIC_OTP_SENT =
  'If an account exists for that email, we sent a one-time password. Check your inbox.';

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function clearPasswordResetFields(account) {
  account.passwordResetOtpHash = null;
  account.passwordResetOtpExpires = null;
  account.passwordResetOtpAttempts = 0;
  account.passwordResetTokenHash = null;
  account.passwordResetTokenExpires = null;
}

export const passwordResetSchemaFields = {
  passwordResetOtpHash: {
    type: String,
    select: false,
    default: null,
  },
  passwordResetOtpExpires: {
    type: Date,
    select: false,
    default: null,
  },
  passwordResetOtpAttempts: {
    type: Number,
    select: false,
    default: 0,
  },
  passwordResetTokenHash: {
    type: String,
    select: false,
    default: null,
  },
  passwordResetTokenExpires: {
    type: Date,
    select: false,
    default: null,
  },
};

export function stripPasswordResetFromJson(ret) {
  delete ret.passwordResetOtpHash;
  delete ret.passwordResetOtpExpires;
  delete ret.passwordResetOtpAttempts;
  delete ret.passwordResetTokenHash;
  delete ret.passwordResetTokenExpires;
}

/**
 * Builds forgot / verify-otp / reset-password handlers for a user model.
 * @param {import('mongoose').Model} Model
 * @param {{ checkDeletedAt?: boolean }} [options]
 */
export function createPasswordResetHandlers(Model, options = {}) {
  const { checkDeletedAt = false } = options;

  function isUnavailable(account) {
    if (!account) return true;
    if (checkDeletedAt && account.deletedAt) return true;
    return false;
  }

  const forgotPassword = asyncHandler(async (req, res) => {
    const email = String(req.body.email || '')
      .toLowerCase()
      .trim();

    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    const account = await Model.findOne({ email }).select(RESET_SELECT);

    if (isUnavailable(account)) {
      res.status(200).json({
        success: true,
        message: GENERIC_OTP_SENT,
      });
      return;
    }

    const otp = generateOtp();
    account.passwordResetOtpHash = hashValue(otp);
    account.passwordResetOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    account.passwordResetOtpAttempts = 0;
    account.passwordResetTokenHash = null;
    account.passwordResetTokenExpires = null;
    await account.save({ validateBeforeSave: false });

    const mailResult = await sendPasswordResetOtpEmail({
      to: account.email,
      name: account.fullName,
      otp,
    });

    if (!mailResult.sent) {
      clearPasswordResetFields(account);
      await account.save({ validateBeforeSave: false });
      throw new ApiError(
        503,
        'Could not send the reset email right now. Please try again later or contact the academy.'
      );
    }

    res.status(200).json({
      success: true,
      message: GENERIC_OTP_SENT,
    });
  });

  const verifyResetOtp = asyncHandler(async (req, res) => {
    const email = String(req.body.email || '')
      .toLowerCase()
      .trim();
    const otp = String(req.body.otp || '').trim();

    if (!email || !otp) {
      throw new ApiError(400, 'Email and OTP are required');
    }

    if (!/^\d{6}$/.test(otp)) {
      throw new ApiError(400, 'Enter the 6-digit OTP from your email');
    }

    const account = await Model.findOne({ email }).select(RESET_SELECT);

    if (
      isUnavailable(account) ||
      !account.passwordResetOtpHash ||
      !account.passwordResetOtpExpires
    ) {
      throw new ApiError(400, 'Invalid or expired OTP. Please request a new code.');
    }

    if (account.passwordResetOtpExpires.getTime() < Date.now()) {
      clearPasswordResetFields(account);
      await account.save({ validateBeforeSave: false });
      throw new ApiError(400, 'OTP has expired. Please request a new code.');
    }

    if ((account.passwordResetOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      clearPasswordResetFields(account);
      await account.save({ validateBeforeSave: false });
      throw new ApiError(429, 'Too many invalid attempts. Please request a new code.');
    }

    if (account.passwordResetOtpHash !== hashValue(otp)) {
      account.passwordResetOtpAttempts = (account.passwordResetOtpAttempts || 0) + 1;
      await account.save({ validateBeforeSave: false });
      throw new ApiError(400, 'Invalid OTP. Please check the code and try again.');
    }

    const resetToken = generateResetToken();
    account.passwordResetOtpHash = null;
    account.passwordResetOtpExpires = null;
    account.passwordResetOtpAttempts = 0;
    account.passwordResetTokenHash = hashValue(resetToken);
    account.passwordResetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await account.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'OTP verified. You can set a new password now.',
      data: {
        email: account.email,
        resetToken,
      },
    });
  });

  const resetPassword = asyncHandler(async (req, res) => {
    const email = String(req.body.email || '')
      .toLowerCase()
      .trim();
    const resetToken = String(req.body.resetToken || '').trim();
    const { newPassword, confirmPassword } = req.body;

    if (!email || !resetToken || !newPassword || !confirmPassword) {
      throw new ApiError(400, 'Please fill in all required fields');
    }

    if (String(newPassword).length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters');
    }

    if (newPassword !== confirmPassword) {
      throw new ApiError(400, 'Passwords do not match');
    }

    const account = await Model.findOne({ email }).select(`+password ${RESET_SELECT}`);

    if (
      isUnavailable(account) ||
      !account.passwordResetTokenHash ||
      !account.passwordResetTokenExpires
    ) {
      throw new ApiError(400, 'Reset session is invalid or expired. Please start again.');
    }

    if (account.passwordResetTokenExpires.getTime() < Date.now()) {
      clearPasswordResetFields(account);
      await account.save({ validateBeforeSave: false });
      throw new ApiError(400, 'Reset session has expired. Please start again.');
    }

    if (account.passwordResetTokenHash !== hashValue(resetToken)) {
      throw new ApiError(400, 'Reset session is invalid. Please start again.');
    }

    account.password = newPassword;
    clearPasswordResetFields(account);
    await account.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You can log in with your new password.',
    });
  });

  return { forgotPassword, verifyResetOtp, resetPassword };
}
