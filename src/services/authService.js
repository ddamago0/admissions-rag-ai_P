import crypto from 'crypto';
import { config } from '../config/env.js';

const TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours validity

/**
 * Validates admin login credentials against environment configuration.
 */
export function authenticateAdmin(username, password) {
  const validUser = config.admin.username;
  const validPass = config.admin.password;

  if (!username || !password) {
    return false;
  }

  // Timing-safe comparison to prevent timing attacks
  const userMatch = crypto.timingSafeEqual(
    Buffer.from(username.padEnd(64, ' ')),
    Buffer.from(validUser.padEnd(64, ' '))
  );
  const passMatch = crypto.timingSafeEqual(
    Buffer.from(password.padEnd(64, ' ')),
    Buffer.from(validPass.padEnd(64, ' '))
  );

  return userMatch && passMatch;
}

/**
 * Generates a signed HMAC-SHA256 session token.
 */
export function generateAdminToken() {
  const payload = {
    role: 'admin',
    issuedAt: Date.now(),
    expiresAt: Date.now() + TOKEN_EXPIRY_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.admin.jwtSecret)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies the validity and signature of a session token.
 */
export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [payloadB64, signature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', config.admin.jwtSecret)
    .update(payloadB64)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.role !== 'admin' || Date.now() > payload.expiresAt) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Express middleware to guard admin-only API routes.
 */
export function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : req.headers['x-admin-token'];

  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized access. A valid Admin session token is required to perform this action.'
    });
  }

  next();
}
