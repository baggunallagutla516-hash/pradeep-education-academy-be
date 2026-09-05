import { ContactQuery } from '../models/ContactQuery.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    throw new ApiError(400, 'Name, email, subject, and message are required');
  }

  const query = await ContactQuery.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone ? String(phone).replace(/\D/g, '').slice(-10) : '',
    subject: subject.trim(),
    message: message.trim(),
  });

  res.status(201).json({
    success: true,
    message: 'Your message has been received. We will get back to you soon.',
    data: {
      id: query._id,
      createdAt: query.createdAt,
    },
  });
});
