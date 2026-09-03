import { ConfigService } from '@nestjs/config';
import { AiMetricsService } from './ai-metrics.service';
import { GroqService } from './groq.service';

function makeConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    GROQ_API_KEY: 'test-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_TIMEOUT_MS: '200',
    GROQ_MAX_RETRIES: '2',
    GROQ_MIN_INTERVAL_MS: '1', // near-zero so tests run fast; still exercises the queue path
    GROQ_MAX_OUTPUT_TOKENS: '600',
    ...overrides,
  };
  return { get: (key: string, def?: string) => values[key] ?? def } as unknown as ConfigService;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const chatCompletionBody = (content: string) => ({ choices: [{ message: { content } }] });

describe('GroqService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // Test 1: GROQ_API_KEY absent -> fallback (null), no network call attempted.
  it('returns null without calling fetch when GROQ_API_KEY is not set', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const service = new GroqService(makeConfigService({ GROQ_API_KEY: '' }), new AiMetricsService());
    expect(service.isConfigured).toBe(false);

    const result = await service.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Test 2: GROQ_API_KEY valid -> successful call returns the model's content.
  it('returns the completion content on a successful call', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(chatCompletionBody('hello back'))) as unknown as typeof fetch;

    const service = new GroqService(makeConfigService(), new AiMetricsService());
    const result = await service.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBe('hello back');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // Test 3: 429 -> bounded retry, succeeds on the retry.
  it('retries once on 429 and returns the result of the successful retry', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse(chatCompletionBody('recovered')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new GroqService(makeConfigService(), new AiMetricsService());
    const result = await service.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Test 4: 429 on every attempt -> exhausts GROQ_MAX_RETRIES then falls back to null, never loops forever.
  it('falls back to null after exhausting retries on repeated 429s', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new GroqService(makeConfigService({ GROQ_MAX_RETRIES: '2' }), new AiMetricsService());
    const result = await service.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBeNull();
    // maxRetries=2 => 1 initial attempt + 2 retries = 3 calls total, never more.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // Test 5: timeout -> falls back to null without retrying (an already-slow call isn't retried
  // immediately, per GroqService's deliberate choice — see callOnce's `retryable: !isAbort`).
  it('falls back to null on timeout without hanging the caller', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;

    const service = new GroqService(makeConfigService({ GROQ_TIMEOUT_MS: '50' }), new AiMetricsService());
    const result = await service.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBeNull();
  }, 2000);

  // Test 6: several calls "at once" are serialized by the internal queue, not fired concurrently —
  // this is what actually prevents the TPM burst that caused the original 429s.
  it('serializes concurrent calls through the internal queue instead of firing them all at once', async () => {
    const callTimestamps: number[] = [];
    global.fetch = jest.fn().mockImplementation(async () => {
      callTimestamps.push(Date.now());
      return jsonResponse(chatCompletionBody('ok'));
    }) as unknown as typeof fetch;

    const service = new GroqService(makeConfigService({ GROQ_MIN_INTERVAL_MS: '50' }), new AiMetricsService());

    await Promise.all([
      service.chat([{ role: 'user', content: 'a' }]),
      service.chat([{ role: 'user', content: 'b' }]),
      service.chat([{ role: 'user', content: 'c' }]),
    ]);

    expect(callTimestamps).toHaveLength(3);
    expect(callTimestamps[1] - callTimestamps[0]).toBeGreaterThanOrEqual(40); // allow small scheduling jitter
    expect(callTimestamps[2] - callTimestamps[1]).toBeGreaterThanOrEqual(40);
  }, 3000);

  it('chatJSON returns null (not a throw) when the model response is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(chatCompletionBody('not-json'))) as unknown as typeof fetch;

    const service = new GroqService(makeConfigService(), new AiMetricsService());
    const result = await service.chatJSON([{ role: 'user', content: 'hello' }]);

    expect(result).toBeNull();
  });

  it('never retries on a non-429 4xx (e.g. invalid request)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ error: 'bad request' }, 400));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new GroqService(makeConfigService(), new AiMetricsService());
    const result = await service.chat([{ role: 'user', content: 'hello' }]);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Test: repeated failures trip the circuit breaker; while OPEN, further calls short-circuit to
  // null WITHOUT calling fetch at all (no network call, immediate fallback).
  it('opens the circuit breaker after repeated failures and short-circuits further calls', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ error: 'server error' }, 503));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new GroqService(
      makeConfigService({ GROQ_MAX_RETRIES: '0', AI_GROQ_CIRCUIT_FAILURE_THRESHOLD: '2', AI_GROQ_CIRCUIT_COOLDOWN_MS: '100000' }),
      new AiMetricsService(),
    );

    await service.chat([{ role: 'user', content: 'a' }]); // failure 1
    await service.chat([{ role: 'user', content: 'b' }]); // failure 2 -> trips breaker
    const callsBeforeOpen = fetchMock.mock.calls.length;

    const result = await service.chat([{ role: 'user', content: 'c' }]); // should be short-circuited

    expect(result).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(callsBeforeOpen); // no additional network call
  });

  // Test: after the cooldown elapses, the breaker allows one HALF_OPEN trial call, and a success
  // closes it again (normal calls resume).
  it('allows a trial call after cooldown and closes the circuit again on success', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'server error' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'server error' }, 503))
      .mockResolvedValue(jsonResponse(chatCompletionBody('recovered')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new GroqService(
      makeConfigService({ GROQ_MAX_RETRIES: '0', AI_GROQ_CIRCUIT_FAILURE_THRESHOLD: '2', AI_GROQ_CIRCUIT_COOLDOWN_MS: '10' }),
      new AiMetricsService(),
    );

    await service.chat([{ role: 'user', content: 'a' }]);
    await service.chat([{ role: 'user', content: 'b' }]); // trips breaker

    await new Promise((resolve) => setTimeout(resolve, 20)); // let cooldown elapse

    const result = await service.chat([{ role: 'user', content: 'c' }]); // HALF_OPEN trial
    expect(result).toBe('recovered');
  });

  // Test: a 'critical' priority request queued behind pending 'low' priority requests runs first.
  it('runs a critical-priority request before already-queued low-priority requests', async () => {
    const order: string[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const label = body.messages[0].content as string;
      order.push(label);
      return jsonResponse(chatCompletionBody('ok'));
    }) as unknown as typeof fetch;

    const service = new GroqService(makeConfigService({ GROQ_MIN_INTERVAL_MS: '20' }), new AiMetricsService());

    const low1 = service.chat([{ role: 'user', content: 'low-1' }], { priority: 'low' });
    const low2 = service.chat([{ role: 'user', content: 'low-2' }], { priority: 'low' });
    const critical = service.chat([{ role: 'user', content: 'critical-1' }], { priority: 'critical' });

    await Promise.all([low1, low2, critical]);

    expect(order[0]).toBe('low-1'); // already draining by the time critical is enqueued
    expect(order.slice(1)).toEqual(['critical-1', 'low-2']); // critical jumps the remaining queue
  });
});
