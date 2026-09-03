import { QlogService } from './qlog.service';
import { QlogContextService } from './qlog-context.service';

describe('QlogService', () => {
  let qlogService: QlogService;
  let contextService: QlogContextService;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    contextService = new QlogContextService();
    qlogService = new QlogService(contextService);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('Sanitization & Redaction', () => {
    it('should redact sensitive keys from nested objects', () => {
      const sensitiveData = {
        username: 'admin',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        refreshToken: 'refresh_secret_token',
        apiKey: 'groq-live-api-key',
        nested: {
          authorization: 'Bearer eyJhbGciOi...',
          secret: 'internal_secret',
          publicInfo: 'visible',
        },
      };

      const sanitized = qlogService.sanitize(sensitiveData);

      expect(sanitized.username).toBe('admin');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.refreshToken).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.nested.authorization).toBe('[REDACTED]');
      expect(sanitized.nested.secret).toBe('[REDACTED]');
      expect(sanitized.nested.publicInfo).toBe('visible');
    });

    it('should handle arrays and primitive values in sanitize', () => {
      expect(qlogService.sanitize('simple string')).toBe('simple string');
      expect(qlogService.sanitize(12345)).toBe(12345);
      expect(qlogService.sanitize(null)).toBeNull();

      const arr = [{ password: 'secret' }, { name: 'zone1' }];
      const sanitizedArr = qlogService.sanitize(arr);
      expect(sanitizedArr[0].password).toBe('[REDACTED]');
      expect(sanitizedArr[1].name).toBe('zone1');
    });
  });

  describe('Context Enrichment via AsyncLocalStorage', () => {
    it('should include requestId and user context when available in contextService', () => {
      contextService.runWithContext(
        {
          requestId: 'req-uuid-12345',
          correlationId: 'corr-uuid-12345',
          userId: 'user-id-abc',
          role: 'RESPONSABLE_ZONE',
          zoneId: 'Tunis',
        },
        () => {
          qlogService.info('Testing context enrichment', 'TestModule');

          expect(stdoutSpy).toHaveBeenCalled();
          const writtenText = stdoutSpy.mock.calls[0][0] as string;
          expect(writtenText).toContain('req:req-uuid');
          expect(writtenText).toContain('user:user-id-abc');
          expect(writtenText).toContain('zone:Tunis');
        },
      );
    });
  });

  describe('Specialized Logging Helpers', () => {
    it('should log HTTP requests with proper fields and format', () => {
      qlogService.logHttp({
        requestId: 'req-test-999',
        method: 'POST',
        route: '/api/contracts',
        statusCode: 201,
        durationMs: 35.4,
        userId: 'user-test-1',
        role: 'ADMIN',
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0][0] as string;
      expect(output).toContain('POST /api/contracts 201 (35.4ms)');
    });

    it('should log AI supervisor events with scope and status', () => {
      qlogService.logAi({
        scope: 'Tunis',
        analysisType: 'saturation_prediction',
        status: 'completed',
        durationMs: 145,
        model: 'llama-3.3-70b-versatile',
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0][0] as string;
      expect(output).toContain('AI saturation_prediction completed');
      expect(output).toContain('scope=Tunis');
    });

    it('should log BullMQ queue operations', () => {
      qlogService.logBullMq({
        queueName: 'external-events',
        jobName: 'contracts.new',
        jobId: 'job-42',
        event: 'started',
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0][0] as string;
      expect(output).toContain('BullMQ [external-events] job=contracts.new (id=job-42) started');
    });

    it('should log WebSocket events', () => {
      qlogService.logWs({
        event: 'connected',
        clientId: 'sock-100',
        userId: 'user-77',
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0][0] as string;
      expect(output).toContain('WebSocket [connected] client=sock-100');
    });

    it('should route ERROR and FATAL logs to stderr', () => {
      qlogService.error('Critical database timeout', 'Stack trace here', 'DatabaseModule');
      expect(stderrSpy).toHaveBeenCalled();
    });
  });
});
