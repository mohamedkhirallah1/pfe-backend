import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;
  public readonly authAttemptsTotal: Counter<string>;
  public readonly securityEventsTotal: Counter<string>;
  public readonly aiCircuitBreakerStatus: Gauge<string>;
  public readonly aiRequestsTotal: Counter<string>;
  public readonly eventsIngestedTotal: Counter<string>;

  constructor() {
    this.registry = new Registry();

    // Default Node.js runtime metrics (CPU, Memory, Event Loop, GC)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'smartfiber_node_',
    });

    // Custom HTTP Metrics
    this.httpRequestsTotal = new Counter({
      name: 'smartfiber_http_requests_total',
      help: 'Total number of HTTP requests received',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'smartfiber_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // Security Metrics
    this.authAttemptsTotal = new Counter({
      name: 'smartfiber_auth_attempts_total',
      help: 'Total authentication attempts (success vs failure)',
      labelNames: ['status', 'role'],
      registers: [this.registry],
    });

    this.securityEventsTotal = new Counter({
      name: 'smartfiber_security_events_total',
      help: 'Security events such as 401, 403, 429 rate limit exceeded or invalid API key',
      labelNames: ['type', 'route'],
      registers: [this.registry],
    });

    // AI & Operational Metrics
    this.aiCircuitBreakerStatus = new Gauge({
      name: 'smartfiber_ai_circuit_breaker_status',
      help: 'Status of AI circuit breaker: 0 = CLOSED (healthy), 1 = OPEN (tripped / degraded)',
      labelNames: ['service'],
      registers: [this.registry],
    });
    this.aiCircuitBreakerStatus.set({ service: 'groq' }, 0);

    this.aiRequestsTotal = new Counter({
      name: 'smartfiber_ai_requests_total',
      help: 'Total requests sent to AI models (Groq)',
      labelNames: ['model', 'status'],
      registers: [this.registry],
    });

    this.eventsIngestedTotal = new Counter({
      name: 'smartfiber_events_ingested_total',
      help: 'Total network events ingested via RabbitMQ/Webhooks',
      labelNames: ['eventType', 'status'],
      registers: [this.registry],
    });

    this.userOperationsTotal = new Counter({
      name: 'smartfiber_user_operations_total',
      help: 'Total user management operations (created, updated, deleted)',
      labelNames: ['operation', 'role'],
      registers: [this.registry],
    });

    // Pre-initialize series with 0 so Prometheus metrics are always populated
    this.authAttemptsTotal.inc({ status: 'success', role: 'ADMIN' }, 0);
    this.authAttemptsTotal.inc({ status: 'failure', role: 'UNKNOWN' }, 0);
    this.securityEventsTotal.inc({ type: 'unauthorized_401', route: '/api/auth' }, 0);
    this.securityEventsTotal.inc({ type: 'forbidden_403', route: '/api/admin' }, 0);
    this.securityEventsTotal.inc({ type: 'rate_limit_exceeded', route: '/api/auth/login' }, 0);
    this.httpRequestsTotal.inc({ method: 'GET', route: '/api/health', status_code: '200' }, 0);
    this.userOperationsTotal.inc({ operation: 'created', role: 'RESPONSABLE_ZONE' }, 0);
  }

  public readonly userOperationsTotal: Counter<string>;
  private readonly recentActivities: Array<{ id: string; timestamp: string; type: string; message: string }> = [];

  recordActivity(type: 'USER' | 'AUTH' | 'SECURITY' | 'AI' | 'NETWORK', message: string): void {
    const activity = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    this.recentActivities.unshift(activity);
    if (this.recentActivities.length > 20) {
      this.recentActivities.pop();
    }
  }

  recordUserOperation(operation: 'created' | 'updated' | 'deleted', username: string, role: string = 'RESPONSABLE_ZONE'): void {
    this.userOperationsTotal.inc({ operation, role });
    this.recordActivity('USER', `Utilisateur ${role} "${username}" ${operation === 'created' ? 'créé' : operation === 'updated' ? 'modifié' : 'désactivé'}`);
  }

  onModuleInit(): void {
    // Initialized
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const cleanRoute = this.normalizeRoute(route);
    const statusStr = String(statusCode);

    this.httpRequestsTotal.inc({
      method,
      route: cleanRoute,
      status_code: statusStr,
    });

    this.httpRequestDuration.observe(
      {
        method,
        route: cleanRoute,
        status_code: statusStr,
      },
      durationSeconds,
    );

    // Track security-relevant status codes
    if (statusCode === 401) {
      this.recordSecurityEvent('unauthorized_401', cleanRoute);
    } else if (statusCode === 403) {
      this.recordSecurityEvent('forbidden_403', cleanRoute);
    } else if (statusCode === 429) {
      this.recordSecurityEvent('rate_limit_exceeded', cleanRoute);
    }
  }

  recordAuthAttempt(status: 'success' | 'failure', role: string = 'UNKNOWN', username?: string): void {
    this.authAttemptsTotal.inc({ status, role });
    const userLabel = username ? `(${username})` : '';
    if (status === 'success') {
      this.recordActivity('AUTH', `Connexion réussie ${userLabel} - Rôle: ${role}`);
    } else {
      this.recordActivity('SECURITY', `Échec de connexion ${userLabel} - Mauvais identifiants`);
    }
  }

  recordSecurityEvent(type: string, route: string): void {
    const cleanRoute = this.normalizeRoute(route);
    this.securityEventsTotal.inc({ type, route: cleanRoute });
    this.recordActivity('SECURITY', `Alerte sécurité [${type}] sur ${cleanRoute}`);
  }

  setAiCircuitBreakerStatus(service: string, isOpen: boolean): void {
    this.aiCircuitBreakerStatus.set({ service }, isOpen ? 1 : 0);
    this.recordActivity('AI', `Circuit Breaker ${service} passé à ${isOpen ? 'OUVERT (Panne)' : 'FERMÉ (Normal)'}`);
  }

  recordAiRequest(model: string, status: 'success' | 'fallback' | 'error'): void {
    this.aiRequestsTotal.inc({ model, status });
  }

  recordEventIngestion(eventType: string, status: 'success' | 'error'): void {
    this.eventsIngestedTotal.inc({ eventType, status });
    this.recordActivity('NETWORK', `Événement réseau ingéré: ${eventType} (${status})`);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  async getSummary(): Promise<Record<string, any>> {
    const rawMetrics = await this.registry.getMetricsAsJSON();
    
    const findMetricValue = (name: string, filter?: (item: any) => boolean): number => {
      const metric = rawMetrics.find((m: any) => m.name === name);
      if (!metric || !metric.values) return 0;
      if (!filter) {
        return metric.values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
      }
      return metric.values
        .filter(filter)
        .reduce((sum: number, v: any) => sum + (v.value || 0), 0);
    };

    const authSuccess = findMetricValue('smartfiber_auth_attempts_total', (v: any) => v.labels?.status === 'success');
    const authFailure = findMetricValue('smartfiber_auth_attempts_total', (v: any) => v.labels?.status === 'failure');
    const unauth401 = findMetricValue('smartfiber_security_events_total', (v: any) => v.labels?.type === 'unauthorized_401');
    const forbidden403 = findMetricValue('smartfiber_security_events_total', (v: any) => v.labels?.type === 'forbidden_403');
    const rateLimit429 = findMetricValue('smartfiber_security_events_total', (v: any) => v.labels?.type === 'rate_limit_exceeded');
    const userCreated = findMetricValue('smartfiber_user_operations_total', (v: any) => v.labels?.operation === 'created');
    const circuitBreakerValue = findMetricValue('smartfiber_ai_circuit_breaker_status', (v: any) => v.labels?.service === 'groq');
    const totalHttp = findMetricValue('smartfiber_http_requests_total');
    const memoryUsed = findMetricValue('smartfiber_node_nodejs_heap_size_used_bytes');

    return {
      timestamp: new Date().toISOString(),
      auth: {
        success: authSuccess,
        failure: authFailure,
        total: authSuccess + authFailure,
      },
      users: {
        created: userCreated,
      },
      security: {
        unauthorized_401: unauth401,
        forbidden_403: forbidden403,
        rate_limit_exceeded: rateLimit429,
        totalThreats: unauth401 + forbidden403 + rateLimit429 + authFailure,
      },
      ai: {
        circuitBreaker: circuitBreakerValue === 0 ? 'CLOSED' : 'OPEN',
        status: circuitBreakerValue === 0 ? 'Opérationnel' : 'Dégradé (Fallback)',
      },
      http: {
        totalRequests: totalHttp,
      },
      activities: this.recentActivities,
      system: {
        uptime: process.uptime(),
        memoryMB: Math.round((memoryUsed || process.memoryUsage().heapUsed) / 1024 / 1024),
        nodeVersion: process.version,
      },
    };
  }

  private normalizeRoute(route: string): string {
    if (!route) return 'unknown';
    // Remove query params
    const withoutQuery = route.split('?')[0];
    // Replace Mongo ObjectIds with :id placeholder for aggregation in Prometheus
    return withoutQuery
      .replace(/[0-9a-fA-F]{24}/g, ':id')
      .replace(/\/[0-9]+/g, '/:id');
  }
}
