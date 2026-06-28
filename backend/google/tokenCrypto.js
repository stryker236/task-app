const crypto = require('crypto');

function getEncryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    const error = new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is required to store Google OAuth tokens');
    error.status = 500;
    throw error;
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');

  try {
    const base64 = Buffer.from(raw, 'base64');
    if (base64.length === 32) return base64;
  } catch {
    // fall through
  }

  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) return utf8;

  const error = new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded 32 bytes, or 64 hex characters');
  error.status = 500;
  throw error;
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final()
  ]);
  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptJson(payload) {
  if (!payload?.iv || !payload?.ciphertext || !payload?.tag) {
    const error = new Error('Stored Google token payload is invalid');
    error.status = 500;
    throw error;
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encryptJson, decryptJson };
