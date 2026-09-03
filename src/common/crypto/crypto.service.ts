import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual as cryptoTimingSafeEqual,
} from 'crypto';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits for AES-GCM
const ENCRYPTED_PREFIX = 'enc:v1:';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly encryptionKey: Buffer;
  private readonly pepperSecret: string;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('ENCRYPTION_KEY');
    const jwtSecret = this.configService.get<string>('JWT_SECRET') ?? 'fallback-smart-fiber-secret-key-32b!';
    this.pepperSecret = this.configService.get<string>('BLIND_INDEX_PEPPER') ?? `${jwtSecret}-pepper`;

    if (!rawKey) {
      this.logger.warn(
        'ENCRYPTION_KEY is not defined in environment! Deriving 256-bit AES key from JWT_SECRET for development.',
      );
      this.encryptionKey = createHash('sha256').update(jwtSecret).digest();
    } else {
      // Ensure 32-byte (256-bit) buffer length via SHA-256 derivation
      this.encryptionKey = createHash('sha256').update(rawKey).digest();
    }
  }

  /**
   * Chiffre une chaîne en clair avec l'algorithme AES-256-GCM (Authenticated Encryption).
   * Retourne un format sécurisé: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
   */
  encrypt(plaintext: string | null | undefined): string | null | undefined {
    if (plaintext === null || plaintext === undefined || plaintext === '') {
      return plaintext;
    }

    if (typeof plaintext !== 'string') {
      return plaintext;
    }

    // Si déjà chiffré, ne pas re-chiffrer
    if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
      return plaintext;
    }

    try {
      const iv = randomBytes(IV_LENGTH_BYTES);
      const cipher = createCipheriv(CIPHER_ALGORITHM, this.encryptionKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${(error as Error).message}`);
      throw new Error('Data encryption failure');
    }
  }

  /**
   * Déchiffre une chaîne chiffrée au format enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>.
   * Si la chaîne n'est pas chiffrée (ex: données existantes en clair), la renvoie telle quelle (rétrocompatible).
   */
  decrypt(ciphertext: string | null | undefined): string | null | undefined {
    if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
      return ciphertext;
    }

    if (typeof ciphertext !== 'string' || !ciphertext.startsWith(ENCRYPTED_PREFIX)) {
      return ciphertext;
    }

    try {
      const parts = ciphertext.slice(ENCRYPTED_PREFIX.length).split(':');
      if (parts.length !== 3) {
        this.logger.warn('Malformed encrypted payload encountered');
        return ciphertext;
      }

      const [ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');

      const decipher = createDecipheriv(CIPHER_ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(`Decryption failed: ${(error as Error).message}`);
      throw new Error('Data decryption failure: invalid key or corrupted ciphertext');
    }
  }

  /**
   * Calcule un Blind Index non-réversible (HMAC-SHA256) avec un Pepper secret.
   * Permet d'effectuer des recherches exactes ($eq) et contraintes d'unicité dans MongoDB
   * sans jamais stocker ni exposer la valeur en clair.
   */
  hashBlindIndex(value: string | null | undefined): string | null | undefined {
    if (value === null || value === undefined || value === '') {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    return createHmac('sha256', this.pepperSecret).update(normalized).digest('hex');
  }

  /**
   * Masque les données à caractère personnel (PII) pour les logs et l'affichage sécurisé.
   */
  maskPII(value: string | null | undefined, type: 'phone' | 'cin' | 'email' | 'generic' = 'generic'): string {
    if (!value || typeof value !== 'string') {
      return '***';
    }

    const clean = value.trim();

    if (type === 'phone' || (type === 'generic' && clean.length === 8 && /^\d+$/.test(clean))) {
      // Ex: "20111222" -> "20***222"
      if (clean.length <= 4) return '***';
      return `${clean.slice(0, 2)}${'*'.repeat(clean.length - 4)}${clean.slice(-2)}`;
    }

    if (type === 'cin') {
      // Ex: "12345678" -> "12****78"
      if (clean.length <= 4) return '***';
      return `${clean.slice(0, 2)}${'*'.repeat(clean.length - 4)}${clean.slice(-2)}`;
    }

    if (type === 'email' || clean.includes('@')) {
      const [user, domain] = clean.split('@');
      if (!domain) return '***@***';
      const visible = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : '***';
      return `${visible}@${domain}`;
    }

    if (clean.length <= 6) {
      return '***';
    }

    return `${clean.slice(0, 2)}${'*'.repeat(clean.length - 4)}${clean.slice(-2)}`;
  }

  /**
   * Comparaison en temps constant de deux chaînes pour éviter les attaques temporelles (Timing Attacks).
   */
  timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return cryptoTimingSafeEqual(bufA, bufB);
  }
}
