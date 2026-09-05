import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function signAdminToken(payload) {
  return jwt.sign(payload, env.jwtAdminSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyAdminToken(token) {
  return jwt.verify(token, env.jwtAdminSecret);
}
