import { ContactQuery } from '../models/ContactQuery.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendContactNotification } from '../utils/mailer.js';

export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    throw new ApiError(400, 'Name, email, subject, and message are required');
  }

  const payload = {
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone ? String(phone).replace(/\D/g, '').slice(-10) : '',
    subject: subject.trim(),
    message: message.trim(),
  };

  const query = await ContactQuery.create(payload);

  try {
    await sendContactNotification(payload);
  } catch (err) {
    console.error('[contact] Failed to send notification email:', err.message);
  }

  res.status(201).json({
    success: true,
    message: 'Your message has been received. We will get back to you soon.',
    data: {
      id: query._id,
      createdAt: query.createdAt,
    },
  });
});
