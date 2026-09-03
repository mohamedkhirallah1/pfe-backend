import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record HTTP requests and generate Prometheus output', async () => {
    service.recordHttpRequest('GET', '/api/zones', 200, 0.045);
    service.recordHttpRequest('POST', '/api/auth/login', 401, 0.012);
    service.recordAuthAttempt('failure', 'RESPONSABLE_ZONE');
    service.setAiCircuitBreakerStatus('groq', false);

    const output = await service.getMetrics();

    expect(output).toContain('smartfiber_http_requests_total');
    expect(output).toContain('smartfiber_http_request_duration_seconds');
    expect(output).toContain('smartfiber_auth_attempts_total');
    expect(output).toContain('smartfiber_security_events_total');
    expect(output).toContain('smartfiber_ai_circuit_breaker_status');
    expect(output).toContain('status="failure"');
    expect(output).toContain('type="unauthorized_401"');
  });

  it('should normalize dynamic ID routes to prevent Prometheus label cardinality explosion', async () => {
    service.recordHttpRequest('GET', '/api/zones/64b5f8c3d2e1a4b5c6d7e8f9', 200, 0.02);
    const output = await service.getMetrics();
    expect(output).toContain('route="/api/zones/:id"');
  });
});
