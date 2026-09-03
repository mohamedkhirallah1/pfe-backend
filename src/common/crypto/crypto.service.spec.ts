import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'ENCRYPTION_KEY') return 'e8a5b2c9d1f3048576a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f70';
              if (key === 'BLIND_INDEX_PEPPER') return 'test-secret-pepper';
              if (key === 'JWT_SECRET') return 'test-jwt-secret';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt & decrypt (AES-256-GCM)', () => {
    it('should encrypt and decrypt a string accurately', () => {
      const original = '20111222';
      const encrypted = service.encrypt(original);

      expect(encrypted).toBeDefined();
      expect(encrypted).toMatch(/^enc:v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(encrypted).not.toEqual(original);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('should produce different ciphertexts for the same plaintext due to random IVs', () => {
      const original = '12345678';
      const encrypted1 = service.encrypt(original);
      const encrypted2 = service.encrypt(original);

      expect(encrypted1).not.toEqual(encrypted2);
      expect(service.decrypt(encrypted1)).toEqual(original);
      expect(service.decrypt(encrypted2)).toEqual(original);
    });

    it('should pass unencrypted plaintext through untouched (backward compatibility)', () => {
      const plain = 'unencrypted-legacy-text';
      expect(service.decrypt(plain)).toEqual(plain);
    });

    it('should throw on corrupted or tampered ciphertext (authenticated encryption tag mismatch)', () => {
      const encrypted = service.encrypt('sensitive-data')!;
      const parts = encrypted.split(':');
      // Tamper with the ciphertext
      parts[4] = parts[4].replace(/^[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a'));
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('hashBlindIndex (HMAC-SHA256)', () => {
    it('should produce deterministic hashes for exact matching', () => {
      const hash1 = service.hashBlindIndex('20111222');
      const hash2 = service.hashBlindIndex(' 20111222 ');

      expect(hash1).toBeDefined();
      expect(hash1).toHaveLength(64); // 256-bit hex
      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different values', () => {
      const hash1 = service.hashBlindIndex('20111222');
      const hash2 = service.hashBlindIndex('20999888');

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('maskPII', () => {
    it('should mask phone numbers correctly', () => {
      expect(service.maskPII('20111222', 'phone')).toEqual('20****22');
    });

    it('should mask CIN numbers correctly', () => {
      expect(service.maskPII('12345678', 'cin')).toEqual('12****78');
    });

    it('should mask emails correctly', () => {
      expect(service.maskPII('admin@smartfiber.tn', 'email')).toEqual('a***n@smartfiber.tn');
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true for identical strings and false for differing strings', () => {
      expect(service.timingSafeEqual('secret-key-123', 'secret-key-123')).toBe(true);
      expect(service.timingSafeEqual('secret-key-123', 'secret-key-456')).toBe(false);
      expect(service.timingSafeEqual('short', 'longer-string')).toBe(false);
    });
  });
});
