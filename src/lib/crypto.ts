import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET?.trim();
  if (secret && /^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  const fallbackSeed = secret || 'ai-content-workbench-default-local-secret';
  return crypto.createHash('sha256').update(fallbackSeed).digest();
}

export function encryptApiKey(plainText: string): string {
  const trimmed = plainText.trim();
  if (!trimmed) {
    throw new Error('API Key 不能为空');
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) {
    // Allow legacy plain value only if unencrypted in dev
    return payload;
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskApiKey(plainOrEncrypted: string): string {
  if (!plainOrEncrypted) return '****';
  let plain = plainOrEncrypted;
  if (plainOrEncrypted.split(':').length === 3) {
    try {
      plain = decryptApiKey(plainOrEncrypted);
    } catch {
      return 'sk-****';
    }
  }
  if (plain.length <= 8) {
    return `${plain.slice(0, 2)}****${plain.slice(-2)}`;
  }
  return `${plain.slice(0, 5)}••••${plain.slice(-4)}`;
}
