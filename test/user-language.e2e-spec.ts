import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('User Language Preference (e2e against real DB)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    // Login as ADMIN
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@smartfiber.tn',
        password: 'admin1234',
      });

    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // Reset admin language to 'fr' after tests
    if (adminToken) {
      await request(app.getHttpServer())
        .patch('/api/users/me/language')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ language: 'fr' });
    }
    await app.close();
  });

  it('GET /api/users/me - should return current user profile with language property', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe('admin@smartfiber.tn');
    expect(res.body.role).toBe('ADMIN');
    expect(res.body).toHaveProperty('language');
    expect(['fr', 'en', 'ar']).toContain(res.body.language);
  });

  it('PATCH /api/users/me/language - should update language to "en"', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me/language')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ language: 'en' })
      .expect(200);

    expect(res.body).toEqual({ language: 'en' });

    // Verify GET /api/users/me returns updated language
    const profileRes = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(profileRes.body.language).toBe('en');
  });

  it('PATCH /api/users/me/language - should update language to "ar"', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me/language')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ language: 'ar' })
      .expect(200);

    expect(res.body).toEqual({ language: 'ar' });
  });

  it('PATCH /api/users/me/language - should update language to "fr"', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me/language')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ language: 'fr' })
      .expect(200);

    expect(res.body).toEqual({ language: 'fr' });
  });

  it('PATCH /api/users/me/language - should reject unsupported language "de" with HTTP 400', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me/language')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ language: 'de' })
      .expect(400);

    expect(res.body.message || res.body.error).toBeDefined();
  });

  it('PATCH /api/users/me/language - should reject unauthenticated request with HTTP 401', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/me/language')
      .send({ language: 'en' })
      .expect(401);
  });
});
