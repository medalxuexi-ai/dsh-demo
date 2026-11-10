import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function normalizeKey(raw: Buffer | string): Buffer {
  if (Buffer.isBuffer(raw) && raw.length === 32) return raw;
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buffer.length === 64 && /^[0-9a-f]+$/i.test(buffer.toString('utf8'))) {
    return Buffer.from(buffer.toString('utf8'), 'hex');
  }
  return createHash('sha256').update(buffer).digest();
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(masterKeyPath: string) {
    if (process.env.MASTER_KEY) {
      this.key = normalizeKey(process.env.MASTER_KEY);
      return;
    }
    if (existsSync(masterKeyPath)) {
      this.key = normalizeKey(readFileSync(masterKeyPath));
      return;
    }
    this.key = randomBytes(32);
    mkdirSync(dirname(masterKeyPath), { recursive: true });
    writeFileSync(masterKeyPath, this.key, { mode: 0o600 });
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('无法解密的密钥格式');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  mask(secret: string): string {
    if (!secret) return '';
    if (secret.length <= 8) return '••••••••';
    return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
  }
}
